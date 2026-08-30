// ===== 全局弹窗互斥工具（所有模态弹窗的唯一打开入口） =====
// 背景：@mantine/modals 7.x 的 OPEN reducer 不做 modalId 去重（见 reducer.mjs：
//   OPEN → modals: [...state.modals, action.modal]），且 CLOSE_ALL 后弹窗有 ~200ms
//   退出动画。任何"连续 OPEN 之间没有完整关闭"的时序（连点、双击、跨入口快速
//   切换、动画窗口内二次触发）都会导致多个弹窗叠加。
// 方案（机制级互斥，不依赖各调用点自觉）：
//   1. 同 id 400ms 防抖：连点/双击只打开一次；
//   2. 打开前 closeAll + 等待退出动画（260ms）完成再打开，杜绝动画叠加；
//   3. 动画等待期间再次 closeAll，清理窗口内其他入口新开的弹窗。
import { modals } from '@mantine/modals';
import { wakeIosKeyboard } from './modalFocus';

const CLOSE_ANIM_MS = 260; // Mantine Modal 退出动画 200ms + 余量
const DEBOUNCE_MS = 400; // 同 id 防抖窗口

interface LastOpen {
  id: string;
  at: number;
}

let lastOpen: LastOpen = { id: '', at: 0 };
let pendingTimer: number | null = null;

/**
 * 打开一个模态弹窗（单例互斥）。openFn 接收 modals，在其中调用 open/openConfirmModal。
 * wakeKeyboard：弹窗内需要自动聚焦输入框时传 true —— wakeIosKeyboard 必须在用户点击
 * 手势内同步调用 iOS 才弹键盘，因此放在本函数的同步阶段（而非延迟的 openFn 里）。
 */
export function openModalOnce(
  id: string,
  openFn: (m: typeof modals) => void,
  wakeKeyboard = false
): void {
  const now = Date.now();
  // 同 id 防抖：400ms 内重复打开直接忽略
  if (lastOpen.id === id && now - lastOpen.at < DEBOUNCE_MS) return;
  lastOpen = { id, at: now };

  // 取消上一个未执行的延迟打开（快速切换不同弹窗时只保留最新意图）
  if (pendingTimer !== null) {
    window.clearTimeout(pendingTimer);
    pendingTimer = null;
  }

  // 手势内同步叫醒 iOS 键盘（必须在这里，不能延迟到 openFn）
  if (wakeKeyboard) wakeIosKeyboard();
  modals.closeAll();
  pendingTimer = window.setTimeout(() => {
    pendingTimer = null;
    modals.closeAll(); // 等待期间可能有其他入口打开弹窗，再清一次
    openFn(modals);
  }, CLOSE_ANIM_MS);
}
