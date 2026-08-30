// ===== vConsole 虚拟控制台管理（头像菜单"调试模式"开关 + 页面加载自动恢复） =====
//  - 开启：动态加载 vConsole 并初始化（右下角浮动按钮 + 面板）
//  - 关闭：destroy 销毁实例
//  - 持久化 localStorage('zhuge-debug-mode')：刷新后保持开关状态
//  - 页面加载（main.tsx）调用 maybeEnableVConsole()：dev 自动开 / ?vconsole=1 开 / 已开启恢复

interface VConsoleLike {
  destroy: () => void;
}

const DEBUG_KEY = 'zhuge-debug-mode';

let vc: VConsoleLike | null = null;

export function isDebugMode(): boolean {
  try {
    return localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

/** 确保 vConsole 已初始化（未初始化则动态加载并创建实例） */
export async function ensureVConsole(): Promise<boolean> {
  if (vc) return true;
  try {
    const { default: VConsole } = await import('vconsole');
    vc = new VConsole();
    return true;
  } catch (e) {
    console.warn('vConsole 初始化失败', e);
    return false;
  }
}

/** 销毁 vConsole 实例 */
export function destroyVConsole(): void {
  try {
    vc?.destroy();
  } catch {
    /* 忽略销毁异常 */
  }
  vc = null;
}

/** 调试模式开关：开启 → 初始化并显示；关闭 → 销毁 */
export async function setDebugMode(on: boolean): Promise<boolean> {
  try {
    if (on) localStorage.setItem(DEBUG_KEY, '1');
    else localStorage.removeItem(DEBUG_KEY);
  } catch {
    /* 存储不可用不影响本次会话 */
  }
  if (on) return ensureVConsole();
  destroyVConsole();
  return true;
}

/** 页面加载时调用：dev 自动开 / ?vconsole=1 开 / 开关记忆恢复 */
export async function maybeEnableVConsole(): Promise<void> {
  try {
    const q = new URLSearchParams(window.location.search);
    // ?vconsole=0 显式关闭并清除记忆；?vconsole=1 开启并记忆
    if (q.get('vconsole') === '0') {
      localStorage.removeItem(DEBUG_KEY);
      destroyVConsole();
      return;
    }
    if (q.get('vconsole') === '1') localStorage.setItem(DEBUG_KEY, '1');
    if (import.meta.env.DEV || q.get('vconsole') === '1' || isDebugMode()) {
      await ensureVConsole();
    }
  } catch {
    /* 初始化失败不阻塞应用 */
  }
}
