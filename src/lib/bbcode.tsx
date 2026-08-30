// ===== BBCode 安全渲染：用户内容文本格式白名单 =====
// 允许：粗体 [b]、斜体 [i]、下划线 [u]、删除线 [s]、颜色 [color=red|#ff0000]、大字 [big]、小字 [small]、
//       可复制文本块 [copy]文字[/copy]、骰子 [dice]1d20[/dice]（支持 NdM / NdM+K，如 2d6+1）
// 禁止：链接/图片/音频/视频等任何外链标签（[url][img][audio][video]…）——不识别即原文显示
// 安全：解析生成 React 元素（文本自动转义），color 值严格校验（防 CSS 注入），绝无 dangerouslySetInnerHTML
import { useState, type ReactNode } from 'react';

// 颜色白名单：常见颜色名 + 合法 hex
const COLOR_NAMES = new Set([
  'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray', 'grey',
  'brown', 'black', 'white', 'silver', 'gold', 'cyan', 'magenta', 'darkred', 'darkblue', 'darkgreen',
]);

export function isSafeColor(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (COLOR_NAMES.has(v)) return true;
  // #rgb / #rrggbb
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v);
}

// 允许的标签（不含 color 的 value 部分）
const TAG_NAMES = new Set(['b', 'i', 'u', 's', 'color', 'big', 'small', 'copy', 'dice']);
// 开标签正则：普通标签 / color=值 / dice=表达式
const OPEN_RE = /\[(b|i|u|s|big|small|copy|dice|color(?:=[^\]\s]+)?|dice(?:=[^\]\s]+)?)\]/i;

/** 内容是否含 BBCode 标签（决定是否走 BBCode 渲染） */
export function hasBBCode(text: string): boolean {
  return OPEN_RE.test(text);
}

/** 校验骰子表达式：NdM 或 NdM+K（N 骰数 1-100，M 面数不限 ≥2（BigInt 范畴），K 修正 ±10^9） */
export function parseDiceExpr(raw: string): { count: number; sides: bigint; mod: bigint } | null {
  const m = String(raw || '').trim().toLowerCase().match(/^(\d{1,3})?d(\d+)([+-]\d{1,10})?$/);
  if (!m) return null;
  const count = m[1] ? parseInt(m[1], 10) : 1;
  if (count < 1 || count > 100) return null;
  if (m[2].length > 1000) return null; // 面数位数上限（与后端一致，防滥用）
  let sides: bigint;
  try {
    sides = BigInt(m[2]);
  } catch {
    return null;
  }
  if (sides < 2n) return null;
  const mod = m[3] ? BigInt(m[3]) : 0n;
  if (mod > 1000000000n || mod < -1000000000n) return null;
  return { count, sides, mod };
}

// ===== 可复制文本块：带「复制」按钮的容器（内容支持嵌套 BBCode） =====
function CopyBlock({ children, text }: { children: ReactNode; text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 旧浏览器回退
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      } catch {
        /* 复制失败静默 */
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div
      style={{
        position: 'relative',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '8px 12px',
        margin: '6px 0',
        background: 'var(--card)',
        fontSize: 13,
        lineHeight: 1.7,
      }}
    >
      <button
        type="button"
        onClick={handleCopy}
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          border: '1px solid var(--border)',
          borderRadius: 6,
          background: 'var(--card)',
          color: 'var(--muted)',
          fontSize: 11,
          padding: '2px 8px',
          cursor: 'pointer',
        }}
      >
        {copied ? '✓ 已复制' : '复制'}
      </button>
      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', paddingRight: 48 }}>{children}</div>
    </div>
  );
}

// ===== 骰子：显示服务端注入的结果（防客户端伪造，不可自行掷骰） =====
// 注入格式：[dice=expr|total|detail]，如 [dice=2d6+1|8|3,4+1]
// 旧格式（无结果）：显示 🎲 表达式，提示结果由服务端掷定（发帖/回复时注入）
function DiceRoll({ expr }: { expr: string }) {
  // 拆分注入结果：expr|total|detail
  const [rawExpr, totalStr, detail] = expr.split('|');
  const parsed = parseDiceExpr(rawExpr || expr);
  if (!parsed) return <span>🎲 [{expr}]</span>;
  const { count, sides, mod } = parsed;
  const label = `${count}d${sides}${mod ? (mod > 0 ? `+${mod}` : mod) : ''}`;
  const hasResult = totalStr !== undefined && totalStr !== '';
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: '0 2px', verticalAlign: 'middle' }}
      title="结果由服务端掷定"
    >
      <span
        style={{
          display: 'inline-block',
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--card)',
          padding: '2px 10px',
          fontSize: 13,
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        🎲 {label}
      </span>
      {hasResult ? (
        <span style={{ fontSize: 13, color: 'var(--primary-deep)', fontWeight: 600 }}>
          {totalStr}
          {detail ? (
            <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}>
              {' '}
              [{detail}]
            </span>
          ) : null}
        </span>
      ) : (
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>（发帖后掷定）</span>
      )}
    </span>
  );
}

// 递归解析一段文本为 React 节点（支持嵌套）
// loose=true（列表摘要用）：遇到未闭合标签时丢弃标签标记本身、保留后续文本，
// 避免摘要截断在标签中间时把 "[color=red]" 这类半截标签当原文显示
function parseSegment(text: string, loose = false): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = text;
  while (rest.length > 0) {
    const m = rest.match(OPEN_RE);
    if (!m) {
      nodes.push(rest);
      break;
    }
    const before = rest.slice(0, m.index ?? 0);
    if (before) nodes.push(before);
    const rawTag = m[1]; // 如 'b' 或 'color=red'
    const tagName = rawTag.startsWith('color') ? 'color' : rawTag.toLowerCase();
    const closeTag = `[/${tagName}]`;
    const innerStart = (m.index ?? 0) + m[0].length;
    // [dice=...] 一律按自闭合处理（注入格式 [dice=expr|total|detail] 无闭合；防误吞后续内容）
    if (rawTag.toLowerCase().startsWith('dice=')) {
      nodes.push(<DiceRoll key={nodes.length} expr={rawTag.slice(5).trim()} />);
      rest = rest.slice(innerStart);
      continue;
    }
    const closeIdx = rest.slice(innerStart).toLowerCase().indexOf(closeTag);
    if (closeIdx === -1) {
      if (loose) {
        // 摘要截断在标签中间：丢弃残缺标签，继续解析后续文本
        rest = rest.slice(innerStart);
        continue;
      }
      // 无闭合：原文显示（不解析，避免把 [b] 吃掉）
      nodes.push(rest.slice(m.index ?? 0, innerStart));
      rest = rest.slice(innerStart);
      continue;
    }
    const inner = rest.slice(innerStart, innerStart + closeIdx);
    const after = rest.slice(innerStart + closeIdx + closeTag.length);
    const children = parseSegment(inner, loose); // 嵌套递归
    const key = nodes.length;
    if (tagName === 'b') nodes.push(<b key={key}>{children}</b>);
    else if (tagName === 'i') nodes.push(<i key={key}>{children}</i>);
    else if (tagName === 'u') nodes.push(<u key={key}>{children}</u>);
    else if (tagName === 's') nodes.push(<s key={key}>{children}</s>);
    else if (tagName === 'big') nodes.push(<span key={key} style={{ fontSize: '1.25em' }}>{children}</span>);
    else if (tagName === 'small') nodes.push(<span key={key} style={{ fontSize: '0.8em' }}>{children}</span>);
    else if (tagName === 'copy') {
      // 可复制文本块：纯文本内容（stripBBCode 得复制文本，显示层仍渲染 BBCode）
      nodes.push(
        <CopyBlock key={key} text={stripBBCode(inner)}>
          {children}
        </CopyBlock>
      );
    } else if (tagName === 'dice') {
      // 骰子：内容即表达式（不解析内部 BBCode）；支持 [dice]1d20[/dice] 与 [dice=1d20] 两种写法
      const expr = rawTag.startsWith('dice=') ? rawTag.slice('dice='.length).trim() : inner.trim();
      nodes.push(<DiceRoll key={key} expr={expr} />);
    } else {
      // color=值：严格校验，非法值忽略颜色（按普通文本显示）
      const value = rawTag.slice('color'.length + 1).trim();
      nodes.push(
        isSafeColor(value) ? (
          <span key={key} style={{ color: value.toLowerCase() }}>
            {children}
          </span>
        ) : (
          <span key={key}>{children}</span>
        )
      );
    }
    rest = after;
  }
  return nodes;
}

/** 渲染 BBCode 内容为 React 节点（禁用的外链标签不识别 → 原文显示） */
export function parseBBCode(text: string): ReactNode {
  return <>{parseSegment(text)}</>;
}

/** 渲染 BBCode 摘要（列表/feed 用）：未闭合标签宽容处理，不显示残缺标签文本 */
export function parseBBCodeExcerpt(text: string): ReactNode {
  return <>{parseSegment(text, true)}</>;
}

/** 剥离 BBCode 得纯文本（列表摘要/导出用） */
export function stripBBCode(text: string): string {
  // 递归剥离所有 [tag]...[/tag]（白名单 + 未知标签都剥，只留内容文本）
  let out = text;
  for (let guard = 0; guard < 20; guard++) {
    const m = out.match(/\[([a-z]+)(?:=[^\]\s]*)?\]([\s\S]*?)\[\/\1\]/i);
    if (!m) break;
    out = out.slice(0, m.index ?? 0) + m[2] + out.slice((m.index ?? 0) + m[0].length);
  }
  return out;
}
