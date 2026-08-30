// ===== BBCode 安全渲染：用户内容文本格式白名单 =====
// 允许：粗体 [b]、斜体 [i]、下划线 [u]、删除线 [s]、颜色 [color=red|#ff0000]
// 禁止：链接/图片/音频/视频等任何外链标签（[url][img][audio][video]…）——不识别即原文显示
// 安全：解析生成 React 元素（文本自动转义），color 值严格校验（防 CSS 注入），绝无 dangerouslySetInnerHTML
import type { ReactNode } from 'react';

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
const TAG_NAMES = new Set(['b', 'i', 'u', 's', 'color']);
// 开标签正则：b/i/u/s 或 color=值
const OPEN_RE = /\[(b|i|u|s|color(?:=[^\]\s]+)?)\]/i;

/** 内容是否含 BBCode 标签（决定是否走 BBCode 渲染） */
export function hasBBCode(text: string): boolean {
  return OPEN_RE.test(text);
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
    else {
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
