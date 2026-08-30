// ===== 弹窗内输入框自动聚焦（iOS 兼容） =====
// iOS Safari/Firefox：React commit 时的 autoFocus / 延时聚焦都不弹键盘（焦点不在用户手势内）。
// 兜底方案：
//  1) wakeIosKeyboard()：在用户手势（点击打开弹窗）内同步聚焦一个屏幕外临时输入框，把键盘"叫醒"，
//     之后真实输入框接管焦点时键盘保持弹出；
//  2) focusModalInput()：弹窗入场结束（onEntered）后聚焦真实输入框；若仍未聚焦，
//     弹窗内首次触摸任意空白处也会聚焦（真实手势，必然弹键盘），不拦截按钮/链接/输入框等交互元素。
export function wakeIosKeyboard(): void {
  if (!/iPhone|iPad|iPod/i.test(navigator.userAgent)) return;
  // 屏幕外临时输入框：在手势内同步 focus 即可弹出键盘（可见性不影响）
  const temp = document.createElement('input');
  temp.setAttribute('aria-hidden', 'true');
  temp.tabIndex = -1;
  temp.style.cssText =
    'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(temp);
  try {
    temp.focus();
  } catch {
    /* 忽略 */
  }
  // 真实输入框接管焦点后移除临时框（保险起见 1.5s 兜底移除）
  window.setTimeout(() => {
    if (temp.parentNode) temp.parentNode.removeChild(temp);
  }, 1500);
}

export function focusModalInput(selector: string, retries = 8, interval = 60): void {
  const attempt = (n: number) => {
    const el = document.querySelector<HTMLElement>(`.mantine-Modal-content ${selector}`);
    if (el) {
      try {
        el.focus();
        // 键盘弹出时把光标放到位（部分 iOS 版本需要）
        const input = el as HTMLInputElement;
        if (typeof input.setSelectionRange === 'function') {
          try {
            input.setSelectionRange(0, 0);
          } catch {
            /* 忽略 */
          }
        }
      } catch {
        /* 忽略 */
      }
      return;
    }
    if (n < retries) window.setTimeout(() => attempt(n + 1), interval);
  };
  attempt(0);

  // 兜底：弹窗内首次触摸空白处 → 聚焦输入框（真实手势；不拦截交互元素）
  const modal = document.querySelector('.mantine-Modal-content');
  if (modal && !modal.getAttribute('data-autofocus-trap')) {
    modal.setAttribute('data-autofocus-trap', '1');
    const onFirstTouch = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest && t.closest('button, a, input, select, textarea, [role="button"]')) {
        return; // 让交互元素正常响应，不抢焦点
      }
      const el = document.querySelector<HTMLElement>(`.mantine-Modal-content ${selector}`);
      if (el) {
        try {
          el.focus();
        } catch {
          /* 忽略 */
        }
      }
      modal.removeEventListener('touchstart', onFirstTouch, true);
      modal.removeEventListener('click', onFirstTouch, true);
    };
    modal.addEventListener('touchstart', onFirstTouch, { capture: true, passive: true });
    modal.addEventListener('click', onFirstTouch, { capture: true });
  }
}

// 供 modals.open 使用：弹窗入场动画结束后聚焦（找不到会按 60ms 间隔重试 ~8 次）
// 注意：onEntered 必须放在 transitionProps 里，Mantine 的 Modal 才会在入场动画结束时调用
export function focusOnEnter(selector: string): { transitionProps: { onEntered: () => void } } {
  return { transitionProps: { onEntered: () => focusModalInput(selector) } };
}
