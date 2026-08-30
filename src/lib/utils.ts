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
