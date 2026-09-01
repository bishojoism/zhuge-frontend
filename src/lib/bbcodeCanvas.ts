// ===== Canvas BBCode 排版：解析 BBCode 为带格式的文本段，按行布局供 canvas 绘制 =====
// 图片记录/海报用：粗体/颜色/字号等视觉格式在 canvas 上还原，骰子内容保留不丢。
// 输出：FormattedLine[]（每行由若干段组成，段带 font 修饰与颜色），调用方逐段设置 ctx 绘制。
import { parse } from '@bbob/parser';
import type { TagNode } from '@bbob/plugin-helper';

export interface FormatSpan {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string | null; // 合法颜色值或 null
  big: boolean;
  small: boolean;
}

export interface FormattedLine {
  spans: FormatSpan[];
}

const COLOR_NAMES = new Set([
  'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray', 'grey',
  'brown', 'black', 'white', 'silver', 'gold', 'cyan', 'magenta', 'darkred', 'darkblue', 'darkgreen',
]);

function isSafeColor(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (COLOR_NAMES.has(v)) return true;
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v);
}

interface Ctx {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string | null;
  big: boolean;
  small: boolean;
}

const BASE: Ctx = { bold: false, italic: false, underline: false, strike: false, color: null, big: false, small: false };

function merge(ctx: Ctx, patch: Partial<Ctx>): Ctx {
  return { ...ctx, ...patch };
}

function tagValue(attrs?: Record<string, unknown>): string {
  if (!attrs) return '';
  const keys = Object.keys(attrs);
  return keys.length ? String(attrs[keys[0]] ?? '') : '';
}

// 递归解析 AST → 段（保持文档顺序；换行符保留在文本里，外层按 \n 分行）
function walk(nodes: (TagNode<any> | string)[], ctx: Ctx, out: FormatSpan[]): void {
  for (const n of nodes) {
    if (typeof n === 'string') {
      if (n === '') continue;
      const last = out[out.length - 1];
      // 相邻同格式文本合并，减少 canvas 状态切换
      if (
        last &&
        last.bold === ctx.bold &&
        last.italic === ctx.italic &&
        last.underline === ctx.underline &&
        last.strike === ctx.strike &&
        last.color === ctx.color &&
        last.big === ctx.big &&
        last.small === ctx.small
      ) {
        last.text += n;
      } else {
        out.push({
          text: n,
          bold: ctx.bold,
          italic: ctx.italic,
          underline: ctx.underline,
          strike: ctx.strike,
          color: ctx.color,
          big: ctx.big,
          small: ctx.small,
        });
      }
      continue;
    }
    const tag = String(n.tag || '').toLowerCase();
    const value = tagValue(n.attrs);
    let child: Ctx = ctx;
    switch (tag) {
      case 'b': child = merge(ctx, { bold: true }); break;
      case 'i': child = merge(ctx, { italic: true }); break;
      case 'u': child = merge(ctx, { underline: true }); break;
      case 's': child = merge(ctx, { strike: true }); break;
      case 'big': child = merge(ctx, { big: true }); break;
      case 'small': child = merge(ctx, { small: true }); break;
      case 'color': child = isSafeColor(value) ? merge(ctx, { color: value.toLowerCase() }) : ctx; break;
      case 'dice':
        // 骰子：内容（表达式/结果）保留为文本，不加格式
        walk((n.content || []) as (TagNode<any> | string)[], ctx, out);
        continue;
      default:
        // 未闭合标签 / 未知标签：保留内容文本（不吞标签原文）
        if (n.end || n.attrs) {
          walk((n.content || []) as (TagNode<any> | string)[], ctx, out);
        } else {
          // 未闭合：直接保留内容
          walk((n.content || []) as (TagNode<any> | string)[], ctx, out);
        }
        continue;
    }
    // 成对标签：解析内容；未闭合（无 end）也解析内容（宽容，标签原文丢弃）
    walk((n.content || []) as (TagNode<any> | string)[], child, out);
  }
}

/** 解析 BBCode 文本为格式化行（每行由格式段组成；\n 分行） */
export function parseBBCodeCanvas(text: string): FormattedLine[] {
  const spans: FormatSpan[] = [];
  try {
    const ast = parse(String(text || ''), { caseFreeTags: true });
    walk(ast as (TagNode<any> | string)[], BASE, spans);
  } catch {
    // 解析失败：整段按纯文本处理
    spans.push({ text: String(text || ''), bold: false, italic: false, underline: false, strike: false, color: null, big: false, small: false });
  }
  const lines: FormattedLine[] = [];
  let cur: FormatSpan[] = [];
  const flush = () => {
    if (cur.length) {
      lines.push({ spans: cur });
      cur = [];
    }
  };
  for (const s of spans) {
    const parts = s.text.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) flush();
      if (parts[i] !== '') {
        cur.push({ ...s, text: parts[i] });
      }
    }
  }
  flush();
  if (lines.length === 0) lines.push({ spans: [] });
  return lines;
}

/** 计算一行格式化文本的渲染宽度（设置好 baseFont 后调用；big/small 用相对倍数） */
export function measureFormattedLine(
  ctx: CanvasRenderingContext2D,
  line: FormattedLine,
  baseFont: string,
  baseSize: number
): number {
  let total = 0;
  for (const s of line.spans) {
    const size = baseSize * (s.big ? 1.25 : s.small ? 0.8 : 1);
    const font = fontForSpan(baseFont, s, size);
    ctx.font = font;
    total += ctx.measureText(s.text).width;
  }
  ctx.font = baseFont;
  return total;
}

/** 按 maxWidth 把格式化行拆成多行（每行是子段数组） */
export function wrapFormattedLines(
  ctx: CanvasRenderingContext2D,
  lines: FormattedLine[],
  baseFont: string,
  baseSize: number,
  maxWidth: number
): FormattedLine[] {
  const out: FormattedLine[] = [];
  for (const line of lines) {
    let curSpans: FormatSpan[] = [];
    for (const span of line.spans) {
      const size = baseSize * (span.big ? 1.25 : span.small ? 0.8 : 1);
      const font = fontForSpan(baseFont, span, size);
      ctx.font = font;
      let text = span.text;
      while (text !== '') {
        // 找到当前行能容纳的最长子串（二分按字符；中文逐字）
        let lo = 0;
        let hi = text.length;
        let fit = 0;
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          if (ctx.measureText(text.slice(0, mid)).width <= maxWidth - measureSpans(ctx, curSpans, baseFont, baseSize)) {
            fit = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        if (fit === 0) fit = 1; // 单字超宽也放一个，避免死循环
        curSpans.push({ ...span, text: text.slice(0, fit) });
        text = text.slice(fit);
        if (text !== '' || measureSpans(ctx, curSpans, baseFont, baseSize) >= maxWidth - 1) {
          out.push({ spans: curSpans });
          curSpans = [];
        }
      }
    }
    if (curSpans.length) {
      out.push({ spans: curSpans });
      curSpans = [];
    }
  }
  ctx.font = baseFont;
  return out;
}

function measureSpans(
  ctx: CanvasRenderingContext2D,
  spans: FormatSpan[],
  baseFont: string,
  baseSize: number
): number {
  let w = 0;
  for (const s of spans) {
    const size = baseSize * (s.big ? 1.25 : s.small ? 0.8 : 1);
    ctx.font = fontForSpan(baseFont, s, size);
    w += ctx.measureText(s.text).width;
  }
  return w;
}

/** 根据段格式构造 canvas font（在 baseFont 基础上加粗/斜体/字号） */
export function fontForSpan(baseFont: string, s: FormatSpan, size: number): string {
  const base = baseFont.replace(/^\d+px\s*/, ''); // 去掉原有字号
  const weight = s.bold ? 'bold ' : '';
  const style = s.italic ? 'italic ' : '';
  return `${style}${weight}${Math.round(size)}px ${base}`;
}

/** 根据段格式返回颜色（color 标签优先；否则用默认色，可由调用方按模板覆盖） */
export function spanColor(s: FormatSpan, defaultColor: string): string {
  return s.color || defaultColor;
}
