// ===== 通用小工具 =====

export function timeAgo(ts?: string | null): string {
  if (!ts) return '';
  const t = new Date(ts.replace(' ', 'T') + 'Z').getTime();
  if (Number.isNaN(t)) return ts.slice(0, 10);
  const diff = Date.now() - t;
  if (diff < 60e3) return '刚刚';
  if (diff < 3600e3) return Math.floor(diff / 60e3) + ' 分钟前';
  if (diff < 86400e3) return Math.floor(diff / 3600e3) + ' 小时前';
  if (diff < 7 * 86400e3) return Math.floor(diff / 86400e3) + ' 天前';
  return ts.slice(0, 10);
}

export function genderMark(g?: string | null): string {
  if (!g || g === 'secret') return '';
  const map: Record<string, string> = { male: '♂', female: '♀', other: '⚧' };
  return map[g] || '';
}

export function displayName(u?: { author?: string; username?: string; name?: string } | null): string {
  return (u && (u.author || u.username || u.name)) || '?';
}

export function avatarUrlOf(u?: { avatar_url?: string | null; author_avatar?: string | null } | null): string | null {
  return (u && (u.avatar_url || u.author_avatar)) || null;
}

export function initials(name: string): string {
  return (name || '?').charAt(0).toUpperCase();
}

// 标签颜色（按名称匹配）
export function tagColorOf(tags: { name: string; color: string }[], name: string): string {
  const t = tags.find((x) => x.name === name);
  return t ? t.color : '#4D698E';
}

// 标签文字颜色：按背景亮度自动选深/浅色，保证对比度 ≥4.5:1（亮底深字、暗底白字）
export function tagTextColorOf(bg: string): string {
  const h = (bg || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#fff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const lum = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  // 纯黑文字：亮度 ≥0.18 时对比度 ≥4.6:1；纯白文字：亮度 ≤0.18 时对比度 ≥4.5:1
  // （中间亮度区间两种文字都达标，用纯黑而非深灰可覆盖 0.18~0.24 的"灰区"）
  return lum > 0.18 ? '#000000' : '#ffffff';
}

// 选择图片文件（通用）
export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/gif,image/webp';
    input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

// 上传图片（读 DataURL → 大图压缩 → POST /api/upload）→ 返回访问 URL
// 压缩：超过 MAX_IMG_W 宽或超过 MAX_IMG_BYTES 时用 canvas 缩放 + JPEG 重编码，
// 从源头减小 feed/主题页图片体积（原图可能 1MB+，首屏加载慢）。
// GIF（动图）跳过压缩（canvas 会丢失动画），PNG 压缩后变 JPEG 减少体积。
const MAX_IMG_W = 1000; // 最长边像素
const MAX_IMG_BYTES = 400 * 1024; // 超过此字节数才压缩

async function compressImageDataUrl(dataUrl: string, mime: string): Promise<string> {
  // 动图不压缩（保留动画）；本就小于阈值的直接返回
  if (mime === 'image/gif') return dataUrl;
  // 解码失败/超时（如测试环境、损坏文件）→ 原样返回，不阻塞上传
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const i = new Image();
    let done = false;
    const finish = (v: HTMLImageElement | null) => {
      if (!done) { done = true; resolve(v); }
    };
    i.onload = () => finish(i);
    i.onerror = () => finish(null);
    i.src = dataUrl;
    window.setTimeout(() => finish(null), 2000);
  });
  if (!img) return dataUrl;
  const w = img.naturalWidth || 1;
  const h = img.naturalHeight || 1;
  const rawBytes = Math.floor((dataUrl.split(',')[1]?.length || 0) * 3 / 4);
  if (w <= MAX_IMG_W && rawBytes <= MAX_IMG_BYTES) return dataUrl; // 无需压缩
  const scale = Math.min(1, MAX_IMG_W / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  // 透明 PNG 转 JPEG 前铺白底（避免黑底）
  if (mime === 'image/png') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cw, ch);
  }
  ctx.drawImage(img, 0, 0, cw, ch);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export async function uploadImageFile(file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new Error('图片不能超过 5MB');
  const rawDataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
  const mime = (rawDataUrl.match(/^data:([^;,]+)/) || [])[1] || '';
  const dataUrl = await compressImageDataUrl(rawDataUrl, mime);
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ dataUrl }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || '上传失败');
  return (data as { url: string }).url;
}

// 轻量复制（旧代码 share 用）；现在多用 navigator.clipboard
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallthrough */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return true;
  } catch {
    return false;
  }
}

// ===== Punycode（RFC 3492）解码：把 xn-- 形式的国际化域名转回中文/Unicode =====
// 浏览器 location.hostname 对中文域名返回 punycode（如 xn--cnqs3e5vdw9icjz2q1eaa.xyz），
// 海报/分享需要展示中文域名时用此函数转回（不依赖写死的域名文本）。
// 完整实现 RFC 3492（含 punycode 参数：base=36, tmin=1, tmax=26, skew=38, damp=700,
// initial_bias=72, initial_n=128），支持多标签（. 分隔）逐个解码。

const PUNY_BASE = 36;
const PUNY_TMIN = 1;
const PUNY_TMAX = 26;
const PUNY_SKEW = 38;
const PUNY_DAMP = 700;
const PUNY_INITIAL_BIAS = 72;
const PUNY_INITIAL_N = 128;

function punyAdapt(delta: number, numPoints: number, firstTime: boolean): number {
  let d = firstTime ? Math.floor(delta / PUNY_DAMP) : delta >> 1;
  d += Math.floor(d / numPoints);
  let k = 0;
  while (d > ((PUNY_BASE - PUNY_TMIN) * PUNY_TMAX) >> 1) {
    d = Math.floor(d / (PUNY_BASE - PUNY_TMIN));
    k += PUNY_BASE;
  }
  return k + Math.floor(((PUNY_BASE - PUNY_TMIN + 1) * d) / (d + PUNY_SKEW));
}

function decodePunycodeLabel(label: string): string {
  const output: number[] = [];
  let input = label;
  // 分隔符 '-'：最后的 '-' 之前是基本码点（ASCII），之后是增量编码
  const lastDash = input.lastIndexOf('-');
  let n = PUNY_INITIAL_N;
  let i = 0;
  let bias = PUNY_INITIAL_BIAS;
  let consumed = 0;
  if (lastDash >= 0) {
    for (let j = 0; j < lastDash; j++) {
      const c = input.charCodeAt(j);
      if (c >= 0x80) throw new Error('invalid basic code point');
      output.push(c);
    }
    input = input.slice(lastDash + 1);
  }
  while (consumed < input.length) {
    const oldi = i;
    let w = 1;
    for (let k = PUNY_BASE; ; k += PUNY_BASE) {
      if (consumed >= input.length) throw new Error('invalid punycode');
      const digit = input.charCodeAt(consumed++);
      const codePoint = digit - 48 < 10 ? digit - 22 : digit - 65 < 26 ? digit - 65 : digit - 97 < 26 ? digit - 97 : PUNY_BASE;
      if (codePoint >= PUNY_BASE) throw new Error('invalid punycode digit');
      i += codePoint * w;
      const t = k <= bias ? PUNY_TMIN : k >= bias + PUNY_TMAX ? PUNY_TMAX : k - bias;
      if (codePoint < t) break;
      w *= PUNY_BASE - t;
    }
    const outLen = output.length + 1;
    bias = punyAdapt(i - oldi, outLen, oldi === 0);
    n += Math.floor(i / outLen);
    i %= outLen;
    output.splice(i, 0, n);
    i++;
  }
  return String.fromCodePoint(...output);
}

/** 把国际化域名（可含多个标签 + 端口）从 punycode 转回 Unicode；非 xn-- 标签原样保留 */
export function punycodeToUnicode(host: string): string {
  if (!host) return host;
  // 拆端口
  const m = host.match(/^(.*?)(:\d+)?$/);
  const hostPart = m ? m[1] : host;
  const port = m && m[2] ? m[2] : '';
  const labels = hostPart.split('.');
  const decoded = labels.map((lab) => {
    if (lab.toLowerCase().startsWith('xn--')) {
      try {
        return decodePunycodeLabel(lab.slice(4));
      } catch {
        return lab; // 解码失败原样返回
      }
    }
    return lab;
  });
  return decoded.join('.') + port;
}
