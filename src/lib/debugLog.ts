// 临时运行日志（滴滴/跳转定位排查用）：sessionStorage 环形缓冲，可读可清。
// 排查完随修复一并移除。
const KEY = 'zhuge_dbg';

function safe(v: unknown): string {
  try {
    return typeof v === 'string' ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function dbg(...parts: unknown[]): void {
  try {
    const line = {
      t: new Date().toISOString().slice(11, 23),
      m: parts.map((p) => safe(p)).join(' ').slice(0, 300),
    };
    let arr: unknown[] = [];
    try {
      arr = JSON.parse(sessionStorage.getItem(KEY) || '[]');
    } catch {
      arr = [];
    }
    arr.push(line);
    if (arr.length > 300) arr = arr.slice(-300);
    sessionStorage.setItem(KEY, JSON.stringify(arr));
  } catch {
    /* 日志失败不影响业务 */
  }
}

export function readDbg(): string {
  try {
    return sessionStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

export function clearDbg(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* 忽略 */
  }
}
