// ===== 阻止页面缩放 =====
// 防止：捏合缩放、双击缩放、iOS Safari 双指手势、桌面 Ctrl/⌘+滚轮 与 +/- 键缩放。
// 移动端 Chrome/Android 主要靠 viewport meta 的 user-scalable=no + maximum-scale=1 生效；
// iOS Safari 会忽略该 meta，需要 gesturestart/gesturechange 的 preventDefault 拦截。
export function lockZoom(): void {
  // iOS Safari：双指捏合手势（gesture 事件，非标准但 Safari 专属）
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());

  // 双指触摸兜底（Chrome 需配合 meta user-scalable=no 才真正生效）
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false }
  );

  // 桌面：Ctrl/⌘ + 滚轮缩放
  document.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    },
    { passive: false }
  );

  // 桌面：Ctrl/⌘ + +/-/0 键缩放（尽力拦截）
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault();
  });
}
