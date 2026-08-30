// ===== 主题记录导出：文字（.txt，含链接） / 图片（PNG，可选样式 + 二维码） =====
// 图片导出（精修版）：渐变头部 + 品牌 + 标题装饰、圆角卡片 + 柔和阴影 + 头像圆标 + 楼层徽章、
// 页脚二维码卡。超长时按比例缩放适配（上限 15000px）。
import { Button, SimpleGrid, Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { openModalOnce } from '../../lib/modals';
import { stripBBCode } from '../../lib/bbcode';
import type { Discussion, Gender, Post } from '../../types';
import { displayName } from '../../lib/utils';

const W = 720; // 逻辑宽度
const RENDER_SCALE = 2; // 输出分辨率倍率（清晰度，实际输出 W*2 宽）
const PAGE_PAD = 24;
const CONTENT_W = W - PAGE_PAD * 2;
const MAX_H = 15000;
const QR_SIZE = 132;
const FOOTER_H = 230;
const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';

interface ExportPost extends Post {
  reply_to_author?: string | null;
  gender?: Gender;
}

// 加载头像图片（同源 /img/，失败返回 null）
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// ===== 图片记录样式（配色方案） =====
export interface LogStyle {
  id: string;
  name: string;
  bg: [string, string]; // 页面竖向渐变
  header: [string, string]; // 头部渐变
  accent: string; // 强调色（徽章/装饰）
  title: string;
  body: string;
  meta: string;
  card: string; // 卡片底色
  cardBorder: string; // 卡片描边
  shadow: string; // 卡片阴影
}

export const LOG_STYLES: LogStyle[] = [
  { id: 'paper', name: '暖纸', bg: ['#fbf7f1', '#f1e9dd'], header: ['#f6ead8', '#fdf7ee'], accent: '#c98a6b', title: '#463a30', body: '#5c534a', meta: '#9a8e80', card: '#fffdf9', cardBorder: 'rgba(201,138,107,.30)', shadow: 'rgba(122,88,58,.14)' },
  { id: 'mist', name: '晨雾', bg: ['#f3f8fc', '#e4edf6'], header: ['#e9f2f9', '#f5fafd'], accent: '#5b8db8', title: '#2f4358', body: '#4a5c70', meta: '#7d8fa3', card: '#fcfefe', cardBorder: 'rgba(91,141,184,.28)', shadow: 'rgba(70,110,150,.12)' },
  { id: 'sakura', name: '樱花', bg: ['#fdf3f7', '#f8e3eb'], header: ['#fbeaf0', '#fef7f9'], accent: '#d47d9e', title: '#6b3a4a', body: '#7d4a5c', meta: '#a87f8f', card: '#fffafc', cardBorder: 'rgba(212,125,158,.30)', shadow: 'rgba(150,80,110,.12)' },
  { id: 'forest', name: '森林', bg: ['#f2f9f2', '#dcebdc'], header: ['#e7f3e7', '#f4fbf4'], accent: '#4e8a5c', title: '#2f4a35', body: '#46604e', meta: '#7d9485', card: '#fbfefb', cardBorder: 'rgba(78,138,92,.30)', shadow: 'rgba(60,110,75,.12)' },
  { id: 'sunset', name: '落日', bg: ['#fdf4e8', '#f7ddc3'], header: ['#fbead5', '#fef8f0'], accent: '#d98e4a', title: '#5c3b22', body: '#6e4c2e', meta: '#a18463', card: '#fffaf3', cardBorder: 'rgba(217,142,74,.32)', shadow: 'rgba(140,90,40,.13)' },
  { id: 'night', name: '星夜', bg: ['#202d49', '#141a2c'], header: ['#293a5c', '#1a2440'], accent: '#8fb4e8', title: '#e9effc', body: '#c7d3ec', meta: '#8b9cc0', card: 'rgba(255,255,255,.06)', cardBorder: 'rgba(255,255,255,.12)', shadow: 'rgba(0,0,0,.35)' },
  { id: 'ink', name: '墨韵', bg: ['#2c2c34', '#1a1a21'], header: ['#383840', '#23232b'], accent: '#c9a86b', title: '#edeae3', body: '#d0ccc3', meta: '#94918a', card: 'rgba(255,255,255,.05)', cardBorder: 'rgba(255,255,255,.10)', shadow: 'rgba(0,0,0,.35)' },
  { id: 'minimal', name: '极简', bg: ['#ffffff', '#f4f4f4'], header: ['#fafafa', '#ffffff'], accent: '#111111', title: '#111111', body: '#333333', meta: '#8a8a8a', card: '#ffffff', cardBorder: 'rgba(0,0,0,.08)', shadow: 'rgba(0,0,0,.06)' },
];

function safeFilePart(title: string): string {
  return (title || '主题').replace(/[\\/:*?"<>|\n\r]/g, '').slice(0, 30) || '主题';
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ===== 文字记录导出（.txt，含主题链接）=====
export function exportTextLog(d: Discussion, posts: ExportPost[]): void {
  const url = location.origin + '/d/' + d.id;
  const lines: string[] = [];
  lines.push(`《${d.title}》`);
  lines.push(`${d.is_private ? '（私密主题）' : ''}创建于 ${String(d.created_at || '').slice(0, 16)} · 共 ${posts.length} 条`);
  lines.push(`链接：${url}`);
  lines.push('='.repeat(30));
  for (const p of posts) {
    lines.push('');
    lines.push(
      `【${p.number}楼】${displayName(p)} · ${String(p.created_at || '').slice(0, 16)}${p.reply_to_author ? `（回复 @${p.reply_to_author}）` : ''}`
    );
    if (p.content) lines.push(stripBBCode(p.content));
    if (p.image_url) lines.push(`[图片] ${location.origin}${p.image_url}`);
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, `主格-${safeFilePart(d.title)}-${String(d.created_at || '').slice(0, 10)}-文字记录.txt`);
}

// ===== 绘制工具 =====
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, font: string, maxWidth: number): string[] {
  ctx.font = font;
  const out: string[] = [];
  for (const para of String(text || '').split('\n')) {
    if (!para) {
      out.push('');
      continue;
    }
    let line = '';
    for (const ch of para) {
      if (ctx.measureText(line + ch).width > maxWidth) {
        out.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    out.push(line);
  }
  return out.length ? out : [''];
}

function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, bg: string, fg: string, font: string, h = 24, pad = 12): number {
  ctx.font = font;
  const w = ctx.measureText(text).width + pad * 2;
  ctx.fillStyle = bg;
  rr(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + pad, y + h / 2 + 0.5);
  ctx.textBaseline = 'alphabetic';
  return w;
}

// ===== 图片记录导出（精修版 PNG）=====
export async function exportImageLog(d: Discussion, posts: ExportPost[], style: LogStyle): Promise<void> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const topicUrl = location.origin + '/d/' + d.id;

  const qrCanvas = document.createElement('canvas');
  try {
    // 动态导入 qrcode：仅导出图片时才下载，避免拖进主题页主包
    const { default: QRCode } = await import('qrcode');
    await QRCode.toCanvas(qrCanvas, topicUrl, {
      width: QR_SIZE,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#1c1c1c', light: '#ffffff' },
    });
  } catch {
    /* 忽略 */
  }

  // 预加载全部头像（真实头像优先，无则用首字头像）
  const avatarImgs = await Promise.all(
    posts.map((p) => {
      const url = p.author_avatar || '';
      return url ? loadImage(url) : Promise.resolve(null);
    })
  );

  const metaFont = (px: number) => `${px}px ${FONT}`;
  const bodyFont = (px: number) => `${px}px ${FONT}`;

  // ---- 布局测量 ----
  const headerBrandH = 36; // 品牌行
  const titleLines = wrap(ctx, d.title || '', bodyFont(32), CONTENT_W).length;
  const metaRowH = 34;
  const headerDividerH = 40;
  const headerH = 34 + headerBrandH + titleLines * 44 + 22 + metaRowH + headerDividerH;

  interface Block {
    name: string;
    floor: string;
    time: string;
    ref: string;
    bodyLines: string[];
    hasImage: boolean;
    h: number;
  }
  const blocks: Block[] = [];
  let cardsH = 0;
  const cardW = W - PAGE_PAD * 2;
  const cardBodyW = cardW - 44;
  const avatarRowH = 52;
  for (const p of posts) {
    const who = displayName(p);
    const floor = `${p.number}楼`;
    const time = String(p.created_at || '').slice(0, 16);
    const ref = p.reply_to_author ? `回复 @${p.reply_to_author}` : '';
    const bodyLines = wrap(ctx, stripBBCode(p.content || ''), bodyFont(17), cardBodyW);
    const hasImage = !!p.image_url;
    const bodyH = bodyLines.length * 27;
    const imgH = hasImage ? 20 : 0;
    const h = 20 + avatarRowH + 10 + bodyH + imgH + 18;
    cardsH += h + 16;
    blocks.push({ name: who, floor, time, ref, bodyLines, hasImage, h });
  }
  const footerH = FOOTER_H;
  const totalH = 16 + headerH + cardsH + footerH + 16;

  // 超长 → 整体缩放；再乘 2x 渲染倍率提升清晰度
  const scale = totalH > MAX_H ? MAX_H / totalH : 1;
  canvas.width = Math.round(W * RENDER_SCALE * scale);
  canvas.height = Math.round(totalH * RENDER_SCALE * scale);
  ctx.scale(scale * RENDER_SCALE, scale * RENDER_SCALE);

  // ---- 背景 ----
  const bg = ctx.createLinearGradient(0, 0, 0, totalH);
  bg.addColorStop(0, style.bg[0]);
  bg.addColorStop(1, style.bg[1]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, totalH);

  let y = 16;

  // ---- 头部 ----
  const hg = ctx.createLinearGradient(0, y, 0, y + headerH);
  hg.addColorStop(0, style.header[0]);
  hg.addColorStop(1, style.header[1]);
  ctx.fillStyle = hg;
  rr(ctx, PAGE_PAD, y, CONTENT_W, headerH, 26);
  ctx.fill();
  // 品牌行：主格 Logo + 名称
  const logoX = PAGE_PAD + 22;
  const logoY = y + 18;
  const lg = ctx.createLinearGradient(logoX, logoY, logoX + 30, logoY + 30);
  lg.addColorStop(0, style.accent);
  lg.addColorStop(1, lighten(style.accent, 0.25));
  ctx.fillStyle = lg;
  rr(ctx, logoX, logoY, 30, 30, 9);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = bodyFont(18);
  // 居中绘制（textAlign=center + textBaseline=middle）
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('主', logoX + 15, logoY + 15);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = style.title;
  ctx.font = bodyFont(17);
  ctx.textBaseline = 'middle';
  ctx.fillText('主格 · 主题记录', logoX + 40, logoY + 16);
  ctx.textBaseline = 'alphabetic';
  y += headerBrandH + 8;

  // 标题（加大加粗 + 底部装饰线）
  const titleX = PAGE_PAD + 22;
  ctx.fillStyle = style.title;
  ctx.font = bodyFont(32);
  let ty = y + 6;
  const tLines = wrap(ctx, d.title || '', bodyFont(32), CONTENT_W - 44);
  for (const ln of tLines) {
    ctx.fillText(ln, titleX, ty + 30);
    ty += 44;
  }
  // 标题下装饰（强调色渐变线 + 菱形）
  const decY = ty - 8;
  const dg = ctx.createLinearGradient(PAGE_PAD + 22, 0, PAGE_PAD + 220, 0);
  dg.addColorStop(0, style.accent);
  dg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = dg;
  rr(ctx, PAGE_PAD + 22, decY, 190, 4, 2);
  ctx.fill();
  // 菱形
  ctx.fillStyle = style.accent;
  ctx.save();
  ctx.translate(PAGE_PAD + 22 + 208, decY + 2);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-5, -5, 10, 10);
  ctx.restore();
  y = decY + 20;

  // 元信息 pills
  let px = PAGE_PAD + 22;
  const pillFont = metaFont(13);
  const pillY = y;
  const pushPill = (text: string, filled: boolean) => {
    const w = pill(ctx, text, px, pillY, filled ? style.accent : 'rgba(255,255,255,0)',
      filled ? '#ffffff' : style.meta, pillFont, 26, 14);
    if (!filled) {
      // 描边 pill
      ctx.strokeStyle = style.cardBorder;
      ctx.lineWidth = 1;
      rr(ctx, px, pillY, w, 26, 13);
      ctx.stroke();
    }
    px += w + 10;
  };
  if (d.is_private) pushPill('私密', true);
  pushPill(`创建于 ${String(d.created_at || '').slice(0, 10)}`, false);
  pushPill(`共 ${posts.length} 条`, false);
  y += metaRowH + 8;
  // 头部与卡片分隔
  y += 14;

  // ---- 帖子卡片 ----
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const p = posts[i];
    // 卡片阴影
    ctx.shadowColor = style.shadow;
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = style.card;
    rr(ctx, PAGE_PAD, y, cardW, b.h, 20);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    // 卡片描边
    ctx.strokeStyle = style.cardBorder;
    ctx.lineWidth = 1.2;
    rr(ctx, PAGE_PAD, y, cardW, b.h, 20);
    ctx.stroke();

    const cx0 = PAGE_PAD + 22;
    // 头像圆标（真实头像裁圆；无头像时渐变圆 + 居中首字）
    const avR = 20;
    const avX = cx0 + avR;
    const avY = y + 20 + avR;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avX, avY, avR, 0, Math.PI * 2);
    ctx.clip();
    const avatarImg = avatarImgs[i];
    if (avatarImg) {
      // 覆盖式居中绘制（正方形裁圆）
      const s = Math.max((avR * 2) / avatarImg.width, (avR * 2) / avatarImg.height);
      const dw = avatarImg.width * s;
      const dh = avatarImg.height * s;
      ctx.drawImage(avatarImg, avX - dw / 2, avY - dh / 2, dw, dh);
    } else {
      const av = ctx.createLinearGradient(avX - avR, avY - avR, avX + avR, avY + avR);
      av.addColorStop(0, lighten(style.accent, 0.15));
      av.addColorStop(1, style.accent);
      ctx.fillStyle = av;
      ctx.fillRect(avX - avR, avY - avR, avR * 2, avR * 2);
      // 首字精确居中（textAlign=center + textBaseline=middle）
      ctx.fillStyle = '#ffffff';
      ctx.font = bodyFont(17);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.name.charAt(0).toUpperCase(), avX, avY);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
    // 头像描边（深色样式上更清晰）
    ctx.strokeStyle = style.cardBorder;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(avX, avY, avR, 0, Math.PI * 2);
    ctx.stroke();
    // 性别徽标（右下角，♂蓝 / ♀粉 / ⚧紫，白色光晕；保密不显示）
    const g = p.gender || p.author_gender;
    const gColor = g === 'male' ? '#3d6fb5' : g === 'female' ? '#e0608f' : g === 'other' ? '#8f5fb5' : '';
    const gSym = g === 'male' ? '♂' : g === 'female' ? '♀' : g === 'other' ? '⚧' : '';
    if (gSym) {
      const gx = avX + avR - 4;
      const gy = avY + avR - 4;
      ctx.save();
      ctx.font = bodyFont(15);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(255,255,255,.95)';
      ctx.shadowBlur = 5;
      ctx.fillStyle = gColor;
      ctx.fillText(gSym, gx, gy);
      ctx.restore();
      ctx.fillStyle = gColor;
      ctx.font = bodyFont(15);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(gSym, gx, gy);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // 楼层徽章
    const fx = avX + avR + 14;
    const fy = y + 20;
    pill(ctx, b.floor, fx, fy, style.accent, '#ffffff', bodyFont(12.5), 22, 11);
    // 作者 + 时间
    ctx.fillStyle = style.title;
    ctx.font = bodyFont(16);
    ctx.textBaseline = 'middle';
    ctx.fillText(b.name, fx + 52, fy + 11 + 2);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = style.meta;
    ctx.font = metaFont(12);
    ctx.textBaseline = 'middle';
    const timeText = b.time + (b.ref ? '  ·  ' + b.ref : '');
    ctx.fillText(timeText, fx + 52, fy + 34);
    ctx.textBaseline = 'alphabetic';

    // 正文
    ctx.fillStyle = style.body;
    ctx.font = bodyFont(17);
    let by = y + 20 + avatarRowH + 8;
    for (const ln of b.bodyLines) {
      ctx.fillText(ln, cx0, by + 20);
      by += 27;
    }
    if (b.hasImage) {
      ctx.fillStyle = style.meta;
      ctx.font = metaFont(12.5);
      ctx.fillText('[配图] ' + location.origin + p.image_url, cx0, by + 18);
    }
    y += b.h + 16;
  }

  // ---- 页脚：二维码卡 + 品牌 ----
  const footerTop = y + 4;
  const qrCard = 168;
  const qcX = (W - qrCard) / 2;
  const qcY = footerTop + 8;
  ctx.shadowColor = style.shadow;
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#ffffff';
  rr(ctx, qcX, qcY, qrCard, qrCard, 22);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  try {
    if (qrCanvas.width > 0) ctx.drawImage(qrCanvas, qcX + 18, qcY + 18, QR_SIZE, QR_SIZE);
  } catch {
    /* 忽略 */
  }
  // 二维码下方文字
  ctx.fillStyle = style.meta;
  ctx.font = metaFont(13);
  ctx.textAlign = 'center';
  ctx.fillText('扫码查看完整记录', W / 2, qcY + qrCard + 24);
  ctx.fillStyle = style.meta;
  ctx.font = metaFont(12);
  ctx.fillText('由《主格》导出 · 文字角色扮演（语C）平台', W / 2, qcY + qrCard + 46);
  ctx.textAlign = 'left';

  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, `主格-${safeFilePart(d.title)}-${String(d.created_at || '').slice(0, 10)}-图片记录.png`);
    notifications.show({ message: `已导出图片记录（${posts.length} 条）` });
  }, 'image/png');
}

// 颜色变亮/变暗工具（hex → 按 ratio 向白色混合）
function lighten(hex: string, ratio: number): string {
  const h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return hex;
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const m = c.map((v) => Math.round(v + (255 - v) * ratio));
  return '#' + m.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ===== 图片导出样式选择弹窗 =====
function StyleGrid({ onPick }: { onPick: (s: LogStyle) => void }) {
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        选择图片记录的配色样式：
      </Text>
      <SimpleGrid cols={2} spacing="sm">
        {LOG_STYLES.map((s) => (
          <Button
            key={s.id}
            variant="default"
            styles={{ root: { height: 72, background: `linear-gradient(135deg, ${s.bg[0]}, ${s.bg[1]})`, border: '1px solid rgba(0,0,0,.08)' } }}
            onClick={() => onPick(s)}
          >
            <span style={{ color: s.title, fontWeight: 700, fontSize: 15 }}>{s.name}</span>
          </Button>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

export function openImageExportModal(d: Discussion, posts: ExportPost[]): void {
  openModalOnce('image-export', (m) => {
    m.open({
      title: '导出图片记录 · 选择样式',
      centered: true,
      size: 'md',
      children: (
        <StyleGrid
          onPick={(s) => {
            modals.closeAll();
            void exportImageLog(d, posts, s);
          }}
        />
      ),
    });
  });
}
