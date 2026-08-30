// ===== API 客户端：fetch 封装（cookie 会话、错误归一化） =====

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

// 所有请求走 /api 前缀（vite dev 代理 → 线上 Worker）
export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    // 网络层失败（断网/超时等）→ 友好提示，替代裸 "Failed to fetch"
    throw new ApiError('网络连接失败，请检查网络后重试', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((data && (data as { error?: string }).error) || '请求失败', res.status);
  }
  return data as T;
}

// 读取 Worker SSR 注入的首屏数据（window.__INITIAL_DATA__），没有则返回 null
export function readInitData<T>(): T | null {
  try {
    const w = window as unknown as { __INITIAL_DATA__?: T };
    return w.__INITIAL_DATA__ ?? null;
  } catch {
    return null;
  }
}
