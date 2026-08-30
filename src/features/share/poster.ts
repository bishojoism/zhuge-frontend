// 《主格》精美海报生成器 v3（TypeScript 移植版）
// Canvas 原生绘制，高清 PNG 海报，12 套精工模板
// 海报信息只包含：主题标题 + 主题内容（+ 配图），不出现站名/作者/链接
// 尺寸：900x1200（3:4 竖版）

const W = 900;
const H = 1200;
const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';

// ---------- 基础工具 ----------

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const ch of para) {
      if (ctx.measureText(line + ch).width > maxWidth) {
        lines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    lines.push(line);
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function makeRnd(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function noise(ctx: CanvasRenderingContext2D, seed: number, alpha: number, size = 3): void {
  const rnd = makeRnd(seed);
  ctx.save();
  for (let i = 0; i < 700; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    ctx.globalAlpha = rnd() * alpha;
    ctx.fillStyle = rnd() > 0.5 ? '#ffffff' : '#000000';
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

// 标题+图片+内容 标准布局
interface DrawContentOpts {
  titleColor: string;
  titleFont: string;
  titleGlow?: string;
  contentColor: string;
  contentFont: string;
  startY: number;
  titleLineGap: number;
  contentGap: number;
  maxTitle?: number;
  maxContent?: number;
  align?: CanvasTextAlign;
}

function drawContent(ctx: CanvasRenderingContext2D, data: PosterDrawData, opts: DrawContentOpts): number {
  const {
    titleColor, titleFont, titleGlow,
    contentColor, contentFont,
    startY, titleLineGap, contentGap, maxTitle = 4, maxContent = 9,
    align = 'center',
  } = opts;

  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  const tLines = wrapText(ctx, data.title, W - 160).slice(0, maxTitle);
  if (titleGlow) {
    ctx.shadowColor = titleGlow;
    ctx.shadowBlur = 26;
  }
  ctx.fillStyle = titleColor;
  ctx.font = titleFont;
  let y = startY;
  const tx = align === 'center' ? W / 2 : 110;
  for (const line of tLines) {
    ctx.fillText(line, tx, y);
    y += titleLineGap;
  }

  // 图片（标题下方，最多占画布高度 42%）
  let imgY = y;
  if (data.image && data.image.naturalWidth > 0) {
    const maxW = W - 180;
    const maxH = H * 0.42;
    const ratio = Math.min(maxW / data.image.naturalWidth, maxH / data.image.naturalHeight, 1);
    const iw = data.image.naturalWidth * ratio;
    const ih = data.image.naturalHeight * ratio;
    const ix = tx - (align === 'center' ? iw / 2 : 0);
    const iy = y + contentGap * 0.6;
    ctx.save();
    // 圆角裁切
    roundRect(ctx, ix, iy, iw, ih, 14);
    ctx.clip();
    ctx.drawImage(data.image, ix, iy, iw, ih);
    ctx.restore();
    // 描边
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 2;
    roundRect(ctx, ix, iy, iw, ih, 14);
    ctx.stroke();
    imgY = iy + ih;
  }
  ctx.restore();

  let endY = y;
  if (data.excerpt) {
    ctx.save();
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillStyle = contentColor;
    ctx.font = contentFont;
    const cLines = wrapText(ctx, data.excerpt, W - 210).slice(0, maxContent);
    let cy = (data.image && data.image.naturalWidth > 0 ? imgY : y) + contentGap;
    for (const line of cLines) {
      ctx.fillText(line, tx, cy);
      cy += 42;
    }
    endY = cy;
    ctx.restore();
  }
  return endY;
}

// 描边标题（霓虹/金典用）
interface StrokeTitleOpts {
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  font: string;
  startY: number;
  lineGap: number;
  maxTitle?: number;
  glowColor?: string;
}

function strokeTitle(ctx: CanvasRenderingContext2D, data: PosterDrawData, opts: StrokeTitleOpts): number {
  const { strokeColor, strokeWidth, fillColor, font, startY, lineGap, maxTitle = 4, glowColor } = opts;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const lines = wrapText(ctx, data.title, W - 160).slice(0, maxTitle);
  ctx.font = font;
  if (glowColor) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 30;
  }
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = strokeColor;
  ctx.fillStyle = fillColor;
  let y = startY;
  for (const line of lines) {
    ctx.strokeText(line, W / 2, y);
    ctx.fillText(line, W / 2, y);
    y += lineGap;
  }
  ctx.restore();
  return y;
}

// ============ 1. 流光（深邃渐变 + 光晕粒子 + 发光标题） ============
function drawTemplateFlow(ctx: CanvasRenderingContext2D, data: PosterDrawData): void {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0f0c29');
  bg.addColorStop(0.5, '#302b63');
  bg.addColorStop(1, '#24243e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  glow(ctx, W * 0.25, H * 0.15, 380, 'rgba(124,92,255,.35)');
  glow(ctx, W * 0.85, H * 0.45, 420, 'rgba(64,156,255,.28)');
  glow(ctx, W * 0.5, H * 0.92, 460, 'rgba(255,94,182,.22)');

  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#ffffff';
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.45);
  ctx.fillRect(-W, -H * 0.32, W * 3, 130);
  ctx.fillRect(-W, H * 0.18, W * 3, 60);
  ctx.restore();

  const rnd = makeRnd(data.seed || 7);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W, y = rnd() * H, r = 1 + rnd() * 2.6;
    ctx.globalAlpha = 0.15 + rnd() * 0.6;
    ctx.fillStyle = rnd() > 0.4 ? '#fff' : '#c9b8ff';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 顶部金线
  const grad = ctx.createLinearGradient(W / 2 - 160, 0, W / 2 + 160, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,.65)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 160, 178);
  ctx.lineTo(W / 2 + 160, 178);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.beginPath();
  ctx.moveTo(W / 2, 170);
  ctx.lineTo(W / 2 + 8, 178);
  ctx.lineTo(W / 2, 186);
  ctx.lineTo(W / 2 - 8, 178);
  ctx.closePath();
  ctx.fill();

  drawContent(ctx, data, {
    titleColor: '#ffffff', titleFont: `bold 60px ${FONT}`, titleGlow: 'rgba(160,140,255,.85)',
    contentColor: 'rgba(255,255,255,.94)', contentFont: `27px ${FONT}`,
    startY: 260, titleLineGap: 82, contentGap: 56,
  });
}

// ============ 2. 墨韵（水墨山水 + 印章 + 回纹边框） ============
function drawTemplateInk(ctx: CanvasRenderingContext2D, data: PosterDrawData): void {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#faf6ec');
  bg.addColorStop(1, '#f2ead8');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 远山
  const mountains = [
    { y: 220, h: 320, a: 0.10, c: '#6b5b46' },
    { y: 300, h: 400, a: 0.14, c: '#5a4c3a' },
    { y: 400, h: 500, a: 0.18, c: '#4a3e30' },
  ];
  for (const m of mountains) {
    ctx.save();
    ctx.globalAlpha = m.a;
    ctx.fillStyle = m.c;
    const rnd = makeRnd(data.seed || 7 + m.y);
    ctx.beginPath();
    ctx.moveTo(0, m.y + m.h);
    let px = 0;
    while (px < W) {
      const peakH = m.h * (0.35 + rnd() * 0.55);
      const segW = 90 + rnd() * 130;
      ctx.quadraticCurveTo(px + segW / 2, m.y - peakH, px + segW, m.y + rnd() * 30);
      px += segW;
    }
    ctx.lineTo(W, m.y + m.h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 云
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(W * 0.3, 330, 260, 70, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.12;
  ctx.beginPath();
  ctx.ellipse(W * 0.75, 260, 200, 55, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 印章（纯装饰图形，不写字）
  ctx.fillStyle = '#c0392b';
  roundRect(ctx, W / 2 - 34, 96, 68, 68, 8);
  ctx.fill();
  ctx.fillStyle = '#faf6ec';
  // 印章内：菱形 + 圆点装饰
  ctx.beginPath();
  ctx.moveTo(W / 2, 118);
  ctx.lineTo(W / 2 + 13, 130);
  ctx.lineTo(W / 2, 142);
  ctx.lineTo(W / 2 - 13, 130);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(W / 2, 158, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(156,61,46,.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 70, 208);
  ctx.lineTo(W / 2 + 70, 208);
  ctx.stroke();
  ctx.fillStyle = '#9c3d2e';
  ctx.beginPath();
  ctx.moveTo(W / 2, 196);
  ctx.lineTo(W / 2 + 6, 208);
  ctx.lineTo(W / 2, 220);
  ctx.lineTo(W / 2 - 6, 208);
  ctx.closePath();
  ctx.fill();

  // 回纹边框
  const B = 46, L = 92;
  ctx.strokeStyle = 'rgba(60,45,30,.75)';
  ctx.lineWidth = 2.5;
  for (const [cx, cy, dx, dy] of [[B, B, 1, 1], [W - B, B, -1, 1], [B, H - B, 1, -1], [W - B, H - B, -1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * L, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * L);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(60,45,30,.3)';
  ctx.lineWidth = 1;
  roundRect(ctx, B + 14, B + 14, W - (B + 14) * 2, H - (B + 14) * 2, 6);
  ctx.stroke();

  drawContent(ctx, data, {
    titleColor: '#3a2d1f', titleFont: `bold 56px ${FONT}`,
    contentColor: 'rgba(58,45,31,.85)', contentFont: `27px ${FONT}`,
    startY: 280, titleLineGap: 80, contentGap: 50,
  });

  ctx.strokeStyle = 'rgba(156,61,46,.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 70, H - 90);
  ctx.lineTo(W / 2 + 70, H - 90);
  ctx.stroke();
}

// ============ 3. 星夜（星云 + 流星 + 月牙） ============
function drawTemplateStar(ctx: CanvasRenderingContext2D, data: PosterDrawData): void {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#070b1f');
  bg.addColorStop(0.55, '#101a3f');
  bg.addColorStop(1, '#241040');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  glow(ctx, W * 0.7, H * 0.25, 430, 'rgba(88,60,200,.30)');
  glow(ctx, W * 0.2, H * 0.75, 380, 'rgba(40,120,220,.22)');
  glow(ctx, W * 0.85, H * 0.85, 300, 'rgba(220,120,80,.16)');

  const rnd = makeRnd(data.seed || 7);
  for (let i = 0; i < 150; i++) {
    const x = rnd() * W, y = rnd() * H, r = 0.6 + rnd() * 2.4;
    ctx.globalAlpha = 0.2 + rnd() * 0.8;
    ctx.fillStyle = rnd() > 0.3 ? '#ffffff' : '#ffe9b8';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 四芒星
  for (let i = 0; i < 5; i++) {
    const x = rnd() * W, y = 80 + rnd() * 400;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#ffffff';
    ctx.translate(x, y);
    for (let k = 0; k < 4; k++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(3, -6, 0, -14);
      ctx.quadraticCurveTo(-3, -6, 0, 0);
      ctx.fill();
    }
    ctx.restore();
  }

  // 流星
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W * 0.62, 120);
  ctx.lineTo(W * 0.78, 260);
  ctx.stroke();
  ctx.globalAlpha = 0.15;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(W * 0.62, 120);
  ctx.lineTo(W * 0.72, 210);
  ctx.stroke();
  ctx.restore();

  // 月牙
  ctx.beginPath();
  ctx.arc(W * 0.18, 170, 46, 0, Math.PI * 2);
  ctx.fillStyle = '#f5e9c9';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(W * 0.18 + 20, 158, 40, 0, Math.PI * 2);
  ctx.fillStyle = '#101a3f';
  ctx.fill();

  drawContent(ctx, data, {
    titleColor: '#ffffff', titleFont: `bold 58px ${FONT}`, titleGlow: 'rgba(139,122,255,.9)',
    contentColor: 'rgba(235,230,255,.92)', contentFont: `27px ${FONT}`,
    startY: 320, titleLineGap: 80, contentGap: 54,
  });
}

// ============ 4. 纸笺（奶油渐变 + 柔光 + 横幅） ============
function drawTemplatePaper(ctx: CanvasRenderingContext2D, data: PosterDrawData): void {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#fdf6ec');
  bg.addColorStop(0.55, '#f7efe3');
  bg.addColorStop(1, '#f0e6d6');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  glow(ctx, W * 0.15, 140, 300, 'rgba(255,190,120,.30)');
  glow(ctx, W * 0.88, H * 0.5, 340, 'rgba(160,200,255,.25)');
  glow(ctx, W * 0.3, H * 0.95, 320, 'rgba(255,170,190,.22)');

  const banner = ctx.createLinearGradient(0, 0, W, 0);
  banner.addColorStop(0, '#e8b4b8');
  banner.addColorStop(0.5, '#b8c4e8');
  banner.addColorStop(1, '#a8d8c0');
  roundRect(ctx, 60, 66, W - 120, 130, 65);
  ctx.fillStyle = banner;
  ctx.fill();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(W / 2 + (i - 1) * 26, 96, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  drawContent(ctx, data, {
    titleColor: '#3d3a50', titleFont: `bold 54px ${FONT}`,
    contentColor: 'rgba(61,58,80,.85)', contentFont: `26px ${FONT}`,
    startY: 280, titleLineGap: 76, contentGap: 48,
  });

  const line = ctx.createLinearGradient(W / 2 - 120, 0, W / 2 + 120, 0);
  line.addColorStop(0, 'rgba(150,130,160,0)');
  line.addColorStop(0.5, 'rgba(150,130,160,.6)');
  line.addColorStop(1, 'rgba(150,130,160,0)');
  ctx.strokeStyle = line;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 120, H - 96);
  ctx.lineTo(W / 2 + 120, H - 96);
  ctx.stroke();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#b8a9c9';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(W / 2 + (i - 2) * 22, H - 76, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ============ 5. 霓虹（赛博霓虹 + 描边标题） ============
function drawTemplateNeon(ctx: CanvasRenderingContext2D, data: PosterDrawData): void {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0a0a14');
  bg.addColorStop(0.6, '#10102a');
  bg.addColorStop(1, '#0a0a1a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 扫描线
  ctx.save();
  for (let y = 0; y < H; y += 6) {
    ctx.globalAlpha = 0.03;
    ctx.fillStyle = '#00f0ff';
    ctx.fillRect(0, y, W, 2);
  }
  ctx.restore();

  // 网格
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 90) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 90) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();

  // 霓虹光晕
  glow(ctx, W * 0.2, H * 0.2, 350, 'rgba(0,240,255,.18)');
  glow(ctx, W * 0.85, H * 0.8, 400, 'rgba(255,0,200,.16)');

  // 霓虹边框（青色发光双线）
  ctx.save();
  ctx.strokeStyle = 'rgba(0,240,255,.5)';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 18;
  roundRect(ctx, 50, 50, W - 100, H - 100, 12);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,0,200,.4)';
  ctx.lineWidth = 1;
  roundRect(ctx, 66, 66, W - 132, H - 132, 8);
  ctx.stroke();
  ctx.restore();

  // 霓虹描边标题
  strokeTitle(ctx, data, {
    strokeColor: '#00f0ff', strokeWidth: 4, fillColor: '#ffffff',
    font: `bold 62px ${FONT}`, startY: 300, lineGap: 84, glowColor: 'rgba(0,240,255,.9)',
  });

  // 内容
  if (data.excerpt) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(220,235,255,.9)';
    ctx.font = `27px ${FONT}`;
    const lines = wrapText(ctx, data.excerpt, W - 210).slice(0, 8);
    let y = 300 + Math.min(4, wrapText(ctx, data.title, W - 160).length) * 84 + 56;
    for (const line of lines) {
      ctx.fillText(line, W / 2, y);
      y += 42;
    }
    ctx.restore();
  }
}

// ============ 6. 樱花（粉系 + 飘落花瓣） ============
function drawTemplateSakura(ctx: CanvasRenderingContext2D, data: PosterDrawData): void {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#fdeef4');
  bg.addColorStop(0.6, '#fbe3ec');
  bg.addColorStop(1, '#f6d8e4');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  glow(ctx, W * 0.2, 120, 320, 'rgba(255,180,200,.4)');
  glow(ctx, W * 0.85, H * 0.6, 380, 'rgba(255,200,180,.3)');

  // 花枝剪影（右上角）
  ctx.save();
  ctx.strokeStyle = 'rgba(120,80,90,.5)';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(W, 40);
  ctx.quadraticCurveTo(W - 160, 80, W - 220, 200);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W - 140, 130);
  ctx.quadraticCurveTo(W - 200, 160, W - 260, 140);
  ctx.stroke();
  ctx.restore();

  // 飘落花瓣
  const rnd = makeRnd(data.seed || 7);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W, y = rnd() * H, r = 4 + rnd() * 6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rnd() * Math.PI);
    ctx.globalAlpha = 0.35 + rnd() * 0.4;
    ctx.fillStyle = '#ff9fb5';
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 顶部细线 + 小花
  ctx.save();
  ctx.strokeStyle = 'rgba(180,110,130,.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 90, 190);
  ctx.lineTo(W / 2 + 90, 190);
  ctx.stroke();
  for (const ox of [-90, 0, 90]) {
    ctx.fillStyle = '#ff8fab';
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      ctx.lineTo(W / 2 + ox + Math.cos(a) * 9, 190 + Math.sin(a) * 9);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  drawContent(ctx, data, {
    titleColor: '#6d3a4e', titleFont: `bold 54px ${FONT}`,
    contentColor: 'rgba(109,58,78,.85)', contentFont: `26px ${FONT}`,
    startY: 280, titleLineGap: 76, contentGap: 48,
  });

  // 底部花瓣装饰
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#ff9fb5';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(W / 2 + (i - 2.5) * 34, H - 86, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ============ 7. 极简（留白 + 细线 + 大字） ============
function drawTemplateMono(ctx: CanvasRenderingContext2D, data: PosterDrawData): void {
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(0, 0, W, H);

  // 极细边框
  ctx.save();
  ctx.strokeStyle = 'rgba(30,30,30,.35)';
  ctx.lineWidth = 1;
  roundRect(ctx, 60, 60, W - 120, H - 120, 4);
  ctx.stroke();
  ctx.restore();

  // 左上角小方块
  ctx.fillStyle = '#111';
  ctx.fillRect(88, 88, 18, 18);

  // 标题（左对齐大字）
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#111';
  ctx.font = `bold 66px ${FONT}`;
  const tLines = wrapText(ctx, data.title, W - 260).slice(0, 4);
  let y = 280;
  for (const line of tLines) {
    ctx.fillText(line, 110, y);
    y += 90;
  }
  ctx.restore();

  if (data.excerpt) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(17,17,17,.65)';
    ctx.font = `27px ${FONT}`;
    const cLines = wrapText(ctx, data.excerpt, W - 280).slice(0, 9);
    let cy = y + 60;
    for (const line of cLines) {
      ctx.fillText(line, 110, cy);
      cy += 44;
    }
    ctx.restore();
  }

  // 底部装饰横线
  ctx.save();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(110, H - 130);
  ctx.lineTo(340, H - 130);
  ctx.stroke();
  ctx.restore();
}

// ============ 8. 森林（墨绿 + 树影 + 光斑） ============
function drawTemplateForest(ctx: CanvasRenderingContext2D, data: PosterDrawData): void {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0e2a1e');
  bg.addColorStop(0.5, '#14352a');
  bg.addColorStop(1, '#0c2418');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  glow(ctx, W * 0.5, H * 0.3, 420, 'rgba(160,220,140,.14)');
  glow(ctx, W * 0.15, H * 0.8, 360, 'rgba(60,140,110,.18)');

  // 树影剪影（底部）
  const rnd = makeRnd(data.seed || 7);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  for (let i = 0; i < 9; i++) {
    const x = i * 110 + rnd() * 40;
    const th = 220 + rnd() * 260;
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.quadraticCurveTo(x + 22, H - th * 0.55, x + 42, H - th);
    ctx.quadraticCurveTo(x + 64, H - th * 0.6, x + 88, H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 光斑（透过树叶）
  for (let i = 0; i < 20; i++) {
    const x = rnd() * W, y = rnd() * H * 0.6, r = 6 + rnd() * 14;
    ctx.globalAlpha = 0.06 + rnd() * 0.1;
    ctx.fillStyle = '#d8f0c0';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 顶部细线
  ctx.save();
  ctx.strokeStyle = 'rgba(200,230,180,.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 100, 170);
  ctx.lineTo(W / 2 + 100, 170);
  ctx.stroke();
  ctx.fillStyle = '#d8f0c0';
  ctx.beginPath();
  ctx.arc(W / 2, 170, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawContent(ctx, data, {
    titleColor: '#eaf5e2', titleFont: `bold 56px ${FONT}`, titleGlow: 'rgba(160,220,140,.6)',
    contentColor: 'rgba(225,240,215,.9)', contentFont: `27px ${FONT}`,
    startY: 260, titleLineGap: 80, contentGap: 52,
  });
}

// ============ 9. 海洋（蓝绿渐变 + 波浪 + 气泡） ============
function drawTemplateOcean(ctx: CanvasRenderingContext2D, data: PosterDrawData): void {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b3d5c');
  bg.addColorStop(0.6, '#0d5c7a');
  bg.addColorStop(1, '#08394f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  glow(ctx, W * 0.5, H * 0.25, 400, 'rgba(120,220,255,.18)');
  glow(ctx, W * 0.8, H * 0.85, 360, 'rgba(40,160,180,.2)');

  // 波浪线（多层）
  ctx.save();
  const waveCols = ['rgba(255,255,255,.10)', 'rgba(255,255,255,.14)', 'rgba(255,255,255,.08)'];
  for (let w = 0; w < 3; w++) {
    ctx.strokeStyle = waveCols[w];
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const baseY = 900 + w * 80;
    for (let x = 0; x <= W; x += 8) {
      const y = baseY + Math.sin(x * 0.02 + w * 1.4) * 18 + Math.sin(x * 0.05) * 8;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  // 气泡
  const rnd = makeRnd(data.seed || 7);
  for (let i = 0; i < 18; i++) {
    const x = rnd() * W, y = rnd() * H, r = 4 + rnd() * 12;
    ctx.save();
    ctx.globalAlpha = 0.15 + rnd() * 0.25;
    ctx.strokeStyle = '#bfe8ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 顶部小气泡线
  ctx.save();
  ctx.strokeStyle = 'rgba(190,230,255,.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 90, 180);
  ctx.lineTo(W / 2 + 90, 180);
  ctx.stroke();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#bfe8ff';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(W / 2 + (i - 1) * 30, 180, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  drawContent(ctx, data, {
    titleColor: '#eaf7ff', titleFont: `bold 58px ${FONT}`, titleGlow: 'rgba(120,220,255,.8)',
    contentColor: 'rgba(225,245,255,.92)', contentFont: `27px ${FONT}`,
    startY: 270, titleLineGap: 80, contentGap: 52,
  });
}

// ============ 10. 落日（橙粉渐变 + 太阳 + 飞鸟） ============
function drawTemplateSunset(ctx: CanvasRenderingContext2D, data: PosterDrawData): void {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#3a1c54');
  bg.addColorStop(0.4, '#8b3d63');
  bg.addColorStop(0.7, '#d96b52');
  bg.addColorStop(1, '#f2a05e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 太阳（发光圆）
  ctx.save();
  glow(ctx, W / 2, 430, 260, 'rgba(255,190,110,.55)');
  const sun = ctx.createRadialGradient(W / 2, 430, 10, W / 2, 430, 110);
  sun.addColorStop(0, '#fff3d6');
  sun.addColorStop(0.6, '#ffcf8a');
  sun.addColorStop(1, '#ffab5e');
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(W / 2, 430, 110, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 云线
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(W * 0.25, 330, 180, 26, -0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(W * 0.8, 500, 140, 20, 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 飞鸟剪影
  ctx.save();
  ctx.strokeStyle = 'rgba(40,20,40,.7)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  const rnd = makeRnd(data.seed || 7);
  for (let i = 0; i < 7; i++) {
    const x = 120 + rnd() * 660, y = 300 + rnd() * 250;
    const wing = 12 + rnd() * 8;
    ctx.beginPath();
    ctx.moveTo(x - wing, y);
    ctx.quadraticCurveTo(x - wing * 0.3, y - 8, x, y);
    ctx.quadraticCurveTo(x + wing * 0.3, y - 8, x + wing, y);
    ctx.stroke();
  }
  ctx.restore();

  drawContent(ctx, data, {
    titleColor: '#fff6e8', titleFont: `bold 58px ${FONT}`, titleGlow: 'rgba(255,170,90,.8)',
    contentColor: 'rgba(255,246,232,.92)', contentFont: `27px ${FONT}`,
    startY: 620, titleLineGap: 80, contentGap: 50,
  });

  // 底部渐变暗条
  const bot = ctx.createLinearGradient(0, H - 160, 0, H);
  bot.addColorStop(0, 'rgba(60,20,50,0)');
  bot.addColorStop(1, 'rgba(60,20,50,.45)');
  ctx.fillStyle = bot;
  ctx.fillRect(0, H - 160, W, 160);
}

// ============ 11. 金典（深色奢华 + 金色双线） ============
function drawTemplateGold(ctx: CanvasRenderingContext2D, data: PosterDrawData): void {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1a1208');
  bg.addColorStop(0.5, '#2a1e0e');
  bg.addColorStop(1, '#170f06');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  glow(ctx, W * 0.5, H * 0.3, 460, 'rgba(212,175,55,.14)');
  glow(ctx, W * 0.2, H * 0.85, 320, 'rgba(212,175,55,.10)');

  // 金色双线边框（带装饰角）
  ctx.save();
  const gold = (a: number) => `rgba(212,175,55,${a})`;
  ctx.strokeStyle = gold(0.8);
  ctx.lineWidth = 3;
  roundRect(ctx, 52, 52, W - 104, H - 104, 6);
  ctx.stroke();
  ctx.strokeStyle = gold(0.35);
  ctx.lineWidth = 1;
  roundRect(ctx, 72, 72, W - 144, H - 144, 4);
  ctx.stroke();
  // 四角菱形
  ctx.fillStyle = gold(0.9);
  for (const [cx, cy] of [[52, 52], [W - 52, 52], [52, H - 52], [W - 52, H - 52]]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx + 10, cy);
    ctx.lineTo(cx, cy + 10);
    ctx.lineTo(cx - 10, cy);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 顶部装饰线 + 菱形
  ctx.save();
  ctx.strokeStyle = gold(0.6);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 90, 180);
  ctx.lineTo(W / 2 + 90, 180);
  ctx.stroke();
  ctx.fillStyle = gold(0.85);
  ctx.beginPath();
  ctx.moveTo(W / 2, 168);
  ctx.lineTo(W / 2 + 8, 180);
  ctx.lineTo(W / 2, 192);
  ctx.lineTo(W / 2 - 8, 180);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  strokeTitle(ctx, data, {
    strokeColor: 'rgba(212,175,55,.95)', strokeWidth: 3, fillColor: '#ffe9a8',
    font: `bold 60px ${FONT}`, startY: 280, lineGap: 84, glowColor: 'rgba(212,175,55,.8)',
  });

  if (data.excerpt) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(240,225,180,.9)';
    ctx.font = `27px ${FONT}`;
    const lines = wrapText(ctx, data.excerpt, W - 220).slice(0, 8);
    const titleLines = wrapText(ctx, data.title, W - 160).length;
    let y = 280 + Math.min(4, titleLines) * 84 + 58;
    for (const line of lines) {
      ctx.fillText(line, W / 2, y);
      y += 44;
    }
    ctx.restore();
  }
}

// ============ 12. 糖果（多彩色块 + 波点） ============
function drawTemplateCandy(ctx: CanvasRenderingContext2D, data: PosterDrawData): void {
  // 多彩渐变底
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#ffd9e8');
  bg.addColorStop(0.35, '#ffe8c9');
  bg.addColorStop(0.7, '#d8f0d2');
  bg.addColorStop(1, '#cfe4ff');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 大圆角色块装饰（四角）
  const blobs: Array<[number, number, number, string, number]> = [
    [W * 0.05, 60, 190, '#ff9fc0', 0.5],
    [W * 0.78, 40, 160, '#ffd166', 0.5],
    [W * 0.02, H * 0.72, 210, '#8fd0a8', 0.45],
    [W * 0.8, H * 0.75, 200, '#8fb8ff', 0.45],
  ];
  for (const [bx, by, br, color, a] of blobs) {
    ctx.globalAlpha = a;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 波点
  const rnd = makeRnd(data.seed || 7);
  const dots = ['#ff9fc0', '#ffd166', '#8fd0a8', '#8fb8ff', '#c9a8ff'];
  for (let i = 0; i < 40; i++) {
    const x = rnd() * W, y = rnd() * H, r = 3 + rnd() * 7;
    ctx.globalAlpha = 0.35 + rnd() * 0.35;
    ctx.fillStyle = dots[i % dots.length];
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 顶部彩虹条
  ctx.save();
  const rainbow = ['#ff8fb5', '#ffd166', '#8fd0a8', '#8fb8ff', '#c9a8ff'];
  for (let i = 0; i < rainbow.length; i++) {
    ctx.fillStyle = rainbow[i];
    roundRect(ctx, W / 2 - 110 + i * 44, 140, 40, 14, 7);
    ctx.fill();
  }
  ctx.restore();

  drawContent(ctx, data, {
    titleColor: '#4a3a55', titleFont: `bold 54px ${FONT}`,
    contentColor: 'rgba(74,58,85,.8)', contentFont: `26px ${FONT}`,
    startY: 270, titleLineGap: 76, contentGap: 48,
  });

  // 底部彩虹点
  ctx.globalAlpha = 0.7;
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = rainbow[i % rainbow.length];
    ctx.beginPath();
    ctx.arc(W / 2 + (i - 2.5) * 32, H - 90, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------- 模板注册表（12 套） ----------

export interface PosterAuthor {
  name: string;
  avatarUrl: string | null;
  gender?: string | null;
  /** 预加载好的头像图（无则用首字圆） */
  avatarImg?: HTMLImageElement | null;
}

export interface PosterDrawData {
  title: string;
  excerpt: string;
  image: HTMLImageElement | null;
  seed: number;
  author?: PosterAuthor;
}

export interface PosterTemplate {
  key: string;
  name: string;
  draw: (ctx: CanvasRenderingContext2D, data: PosterDrawData) => void;
}

export const TEMPLATES: PosterTemplate[] = [
  { key: 'flow', name: '流光', draw: drawTemplateFlow },
  { key: 'ink', name: '墨韵', draw: drawTemplateInk },
  { key: 'star', name: '星夜', draw: drawTemplateStar },
  { key: 'paper', name: '纸笺', draw: drawTemplatePaper },
  { key: 'neon', name: '霓虹', draw: drawTemplateNeon },
  { key: 'sakura', name: '樱花', draw: drawTemplateSakura },
  { key: 'mono', name: '极简', draw: drawTemplateMono },
  { key: 'forest', name: '森林', draw: drawTemplateForest },
  { key: 'ocean', name: '海洋', draw: drawTemplateOcean },
  { key: 'sunset', name: '落日', draw: drawTemplateSunset },
  { key: 'gold', name: '金典', draw: drawTemplateGold },
  { key: 'candy', name: '糖果', draw: drawTemplateCandy },
];

// ---------- 主入口 ----------

export interface DrawShareCardOpts {
  title: string;
  content: string;
  imageUrl?: string | null;
  templateId: string;
  /** 作者信息：以角色发帖时是角色的外貌/姓名/性别，否则是皮下头像/用户名/性别 */
  author?: { name: string; avatarUrl?: string | null; gender?: string | null };
}

// 性别徽标（与站内一致）：♂/♀ 彩色字符；深色底板上用亮色保证可读
function genderSymbol(gender?: string | null): { sym: string; color: string } | null {
  if (gender === 'male') return { sym: '♂', color: '#9cc3f0' };
  if (gender === 'female') return { sym: '♀', color: '#f5a9c6' };
  return null;
}

// 底部作者栏：头像（或首字）+ 姓名 + 性别徽标，半透明底板保证所有模板可读
function drawAuthorBar(ctx: CanvasRenderingContext2D, author: PosterAuthor): void {
  const name = author.name || '';
  const badge = genderSymbol(author.gender);
  ctx.save();
  ctx.font = `600 22px ${FONT}`;
  const nameW = ctx.measureText(name).width;
  const av = 40;
  const pad = 16;
  // 徽标为彩色字符（无圆底），宽度按字符实测
  ctx.font = `600 24px ${FONT}`;
  const badgeW = badge ? ctx.measureText(badge.sym).width : 0;
  ctx.font = `600 22px ${FONT}`;
  const gapAfterAvatar = 14;
  const gapBeforeBadge = 8;
  const w = av + gapAfterAvatar + nameW + (badge ? gapBeforeBadge + badgeW : 0) + pad * 2;
  const h = 54;
  const x = W / 2 - w / 2;
  const y = H - 90;

  // 底板
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();

  const ax = x + pad;
  const ay = y + (h - av) / 2;
  // 头像（圆形裁切）或首字圆
  if (author.avatarImg && author.avatarImg.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax + av / 2, ay + av / 2, av / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(author.avatarImg, ax, ay, av, av);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ax + av / 2, ay + av / 2, av / 2 - 0.75, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#8b9cb0';
    ctx.beginPath();
    ctx.arc(ax + av / 2, ay + av / 2, av / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `600 20px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((name[0] || '?').toUpperCase(), ax + av / 2, ay + av / 2 + 1);
  }

  // 姓名
  ctx.fillStyle = 'rgba(255,255,255,.97)';
  ctx.font = `600 22px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, ax + av + gapAfterAvatar, y + h / 2 + 1);

  // 性别徽标：彩色 ♂/♀ 字符（与站内一致，无圆底）
  if (badge) {
    const bx = ax + av + gapAfterAvatar + nameW + gapBeforeBadge;
    ctx.fillStyle = badge.color;
    ctx.font = `600 24px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(badge.sym, bx, y + h / 2 + 1);
  }
  ctx.restore();
}

// 由标题生成稳定的随机种子（同一主题每次重绘装饰一致，不同主题略有差异）
function seedOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 2147483647) || 7;
}

// 加载图片（跨域匿名，失败返回 null）
function loadImg(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * 绘制海报到 canvas（900x1200，3:4 竖版）。
 * - 图片为空或加载失败时降级为纯文字版，不抛错
 * - 返回 Promise，有配图/头像时等图片加载完再绘制
 */
export function drawShareCard(canvas: HTMLCanvasElement, opts: DrawShareCardOpts): Promise<void> {
  const tpl = TEMPLATES.find((t) => t.key === opts.templateId) ?? TEMPLATES[0];
  const paint = (image: HTMLImageElement | null, avatarImg: HTMLImageElement | null) => {
    // 2x 渲染提升清晰度（逻辑坐标不变，输出 1800x2400）
    canvas.width = W * 2;
    canvas.height = H * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(2, 2);
    ctx.clearRect(0, 0, W, H);
    const author: PosterAuthor | undefined = opts.author
      ? { name: opts.author.name, avatarUrl: opts.author.avatarUrl || null, gender: opts.author.gender || null, avatarImg }
      : undefined;
    tpl.draw(ctx, {
      title: opts.title || '',
      excerpt: opts.content || '',
      image,
      seed: seedOf(opts.title),
      author,
    });
    // 作者栏统一绘制在模板之上（底部）
    if (author) drawAuthorBar(ctx, author);
  };

  const tasks: Promise<HTMLImageElement | null>[] = [];
  if (opts.imageUrl) tasks.push(loadImg(opts.imageUrl));
  else tasks.push(Promise.resolve(null));
  if (opts.author?.avatarUrl) tasks.push(loadImg(opts.author.avatarUrl));
  else tasks.push(Promise.resolve(null));

  return Promise.all(tasks).then(([image, avatarImg]) => {
    paint(image, avatarImg);
  });
}

export { W, H };
