// ===== BBCode 安全渲染：基于 @bbob/parser 的栈式解析器 =====
// 允许：粗体 [b]、斜体 [i]、下划线 [u]、删除线 [s]、颜色 [color=red|#ff0000]、大字 [big]、小字 [small]、
//       可复制文本块 [copy]文字[/copy]、骰子 [dice]1d20[/dice]（支持 NdM / NdM+K，如 2d6+1）
// 禁止：链接/图片/音频/视频等任何外链标签（[url][img][audio][video]…）——不识别即原文显示
// 安全：解析生成 React 元素（文本自动转义），color 值严格校验（防 CSS 注入），绝无 dangerouslySetInnerHTML
// 健壮：BBob 栈式解析器处理任意嵌套（含同标签嵌套）、未闭合、交叉闭合、空标签、深层嵌套等
//       全部容错不崩溃；白名单外标签由解析器拆回原文保留。
import { useState, type ReactNode } from 'react';
import { parse } from '@bbob/parser';
import type { TagNode } from '@bbob/plugin-helper';

// ===== BBob AST 节点（@bbob/parser 产出） =====
type BBNode = TagNode<any> | string;

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
const ALLOWED_TAGS = ['b', 'i', 'u', 's', 'color', 'big', 'small', 'copy', 'dice'];
// 开标签正则（判断"是否含 BBCode"用；与解析器口径一致）
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

// ===== BBob AST 节点类型（@bbob/parser 产出） =====
// 取 [tag=value] 的 value：BBob 把 =值 解析为 attrs { value: value }
function tagValue(attrs?: Record<string, unknown>): string {
  if (!attrs) return '';
  const keys = Object.keys(attrs);
  return keys.length ? String(attrs[keys[0]] ?? '') : '';
}

// 递归渲染 BBob AST 为 React 节点
// loose=true（摘要）：未闭合标签（无 end）丢弃开标签原文，保留后续文本（截断场景不显示残缺标签）
function renderBB(nodes: BBNode[], loose: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  let k = 0;
  for (const n of nodes) {
    const key = k++;
    if (typeof n === 'string') {
      out.push(n);
      continue;
    }
    const tag = String(n.tag || '').toLowerCase();
    const value = tagValue(n.attrs);
    // 白名单外的标签：解析器已把原文拆成字符串节点（仅白名单 tag 才会成为对象），
    // 理论上不会到这里；兜底：原文显示
    if (!ALLOWED_TAGS.includes(tag)) {
      out.push(String(n));
      continue;
    }
    // 骰子：自闭合 [dice=expr]（无 end 但有 attrs，注入格式含 | 结果）渲染骰子；
    // 成对 [dice]expr[/dice]（有 end）用内容作表达式；无 end 也无 attrs（[dice] 未闭合）按未闭合处理
    if (tag === 'dice' && (value !== '' || n.end)) {
      out.push(<DiceRoll key={key} expr={value || innerText(n)} />);
      continue;
    }
    // 未闭合标签：完整模式原文显示开标签；摘要模式丢弃开标签（保留后续文本）
    if (!n.end) {
      if (loose) continue;
      const raw = `[${n.tag}${tagValue(n.attrs) ? '=' + tagValue(n.attrs) : ''}]`;
      out.push(raw);
      continue;
    }
    const children = renderBB((n.content || []) as BBNode[], loose);
    switch (tag) {
      case 'b':
        out.push(<b key={key}>{children}</b>);
        break;
      case 'i':
        out.push(<i key={key}>{children}</i>);
        break;
      case 'u':
        out.push(<u key={key}>{children}</u>);
        break;
      case 's':
        out.push(<s key={key}>{children}</s>);
        break;
      case 'big':
        out.push(<span key={key} style={{ fontSize: '1.25em' }}>{children}</span>);
        break;
      case 'small':
        out.push(<span key={key} style={{ fontSize: '0.8em' }}>{children}</span>);
        break;
      case 'copy': {
        // 可复制文本块：纯文本内容（stripBBCode 得复制文本，显示层仍渲染 BBCode）
        out.push(
          <CopyBlock key={key} text={stripBBCode(innerText(n))}>
            {children}
          </CopyBlock>
        );
        break;
      }
      default: {
        // color=值：严格校验，非法值忽略颜色（按普通文本显示）
        out.push(
          isSafeColor(value) ? (
            <span key={key} style={{ color: value.toLowerCase() }}>{children}</span>
          ) : (
            <span key={key}>{children}</span>
          )
        );
      }
    }
  }
  return out;
}

// 提取节点内容纯文本（copy 复制内容 / dice 表达式用；递归含子 tag）
function innerText(n: TagNode<any>): string {
  const parts: string[] = [];
  const walk = (nodes: BBNode[]) => {
    for (const c of nodes) {
      if (typeof c === 'string') parts.push(c);
      else if (c && Array.isArray(c.content)) walk(c.content as BBNode[]);
    }
  };
  walk((n.content || []) as BBNode[]);
  return parts.join('');
}

/** 渲染 BBCode 内容为 React 节点（白名单外标签原文显示） */
export function parseBBCode(text: string): ReactNode {
  let ast: BBNode[] = [];
  try {
    ast = parse(String(text || ''), { onlyAllowTags: ALLOWED_TAGS, caseFreeTags: true });
  } catch {
    /* 解析异常：原文显示 */
    return <>{String(text || '')}</>;
  }
  return <>{renderBB(ast, false)}</>;
}

/** 渲染 BBCode 摘要（列表/feed 用）：未闭合标签宽容处理，不显示残缺标签文本 */
export function parseBBCodeExcerpt(text: string): ReactNode {
  let ast: BBNode[] = [];
  try {
    ast = parse(String(text || ''), { onlyAllowTags: ALLOWED_TAGS, caseFreeTags: true });
  } catch {
    return <>{String(text || '')}</>;
  }
  return <>{renderBB(ast, true)}</>;
}

/** 剥离 BBCode 得纯文本（列表摘要/导出用） */
export function stripBBCode(text: string): string {
  // 不带 onlyAllowTags：所有标签（白名单 + 未知/外链）都解析成 AST 节点，
  // 统一剥壳取内容文本（strip 语义：只留文本，标签全剥）。
  // 注意：dice（骰子）标签整体跳过——表达式/结果是"代码部分"，纯文本里不该出现
  //（如 [dice]1d20[/dice] 或注入格式 [dice=1d20|17|17]）。
  return stripBBCodeImpl(text, true);
}

/** 剥离 BBCode 得纯文本但**保留全部内容**（图片导出用）：与 stripBBCode 的唯一区别是
 * 骰子内容不跳过——导出图片时骰子表达式/结果应可见，不能丢失 */
export function stripBBCodeKeepAll(text: string): string {
  return stripBBCodeImpl(text, false);
}

function stripBBCodeImpl(text: string, skipDice: boolean): string {
  let ast: BBNode[] = [];
  try {
    ast = parse(String(text || ''), { caseFreeTags: true });
  } catch {
    // 解析失败：正则兜底剥离成对标签
    let out = String(text || '');
    for (let guard = 0; guard < 20; guard++) {
      const m = out.match(/\[([a-z]+)(?:=[^\]\s]*)?\]([\s\S]*?)\[\/\1\]/i);
      if (!m) break;
      out = out.slice(0, m.index ?? 0) + m[2] + out.slice((m.index ?? 0) + m[0].length);
    }
    return out;
  }
  const parts: string[] = [];
  const walk = (nodes: BBNode[]) => {
    for (const n of nodes) {
      if (typeof n === 'string') {
        parts.push(n);
      } else if (n && Array.isArray(n.content)) {
        // 骰子：skipDice=true（摘要）整体跳过；false（导出）保留内容
        if (skipDice && String(n.tag || '').toLowerCase() === 'dice') continue;
        walk(n.content as BBNode[]);
      }
    }
  };
  walk(ast);
  return parts.join('');
}
