// ===== iOS 地址栏收起（通用）：临时解锁 + 加高 → 滚动 1px 触发地址栏收起 → 恢复 =====
// onDone 在收起完成后回调（调用方自行处理滚动锁定）
let iosTimer: number | null = null;
let collapsing = false;

// 收起流程进行中（450ms 窗口）：其他"滚动归位"类逻辑应暂停，
// 否则会立刻把触发收起的 1px 滚动打回 0，导致地址栏收不起来、导航被遮挡
export function isIosUrlBarCollapsing(): boolean {
  return collapsing;
}

export function collapseIosUrlBar(onDone?: () => void): void {
  if (!/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    onDone?.();
    return;
  }
  const vv = window.visualViewport;
  if (!vv || vv.offsetTop <= 0) {
    // 地址栏已收起
    onDone?.();
    return;
  }
  collapsing = true;
  // 临时允许滚动 + 加高页面 → 滚动 1px 触发地址栏收起
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  const pad = document.createElement('div');
  pad.style.cssText = 'height:100px;visibility:hidden;pointer-events:none;';
  document.body.appendChild(pad);
  try {
    window.scrollTo(0, 1);
  } catch {
    /* 忽略 */
  }
  if (iosTimer !== null) window.clearTimeout(iosTimer);
  iosTimer = window.setTimeout(() => {
    collapsing = false;
    pad.remove();
    try {
      window.scrollTo(0, 0);
    } catch {
      /* 忽略 */
    }
    iosTimer = null;
    onDone?.();
  }, 450);
}
