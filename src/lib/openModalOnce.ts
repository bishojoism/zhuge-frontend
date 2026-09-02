// ===== 弹窗打开防抖（全局单例）：防止快速连点导致同一弹窗叠加 =====
// @mantine/modals 7.x 的 OPEN reducer 不做 modalId 去重（无条件追加），
// 快速连点「开戏/登录/注册/皮」等按钮会叠加多个相同弹窗。
// openModalOnce：350ms 内重复调用（同一 key）直接忽略；不同 key 先关旧的再开。
let lastOpenKey = '';
let lastOpenTime = 0;

export function openModalOnce(key: string, openFn: () => void): void {
  const now = Date.now();
  if (key === lastOpenKey && now - lastOpenTime < 350) return; // 连点去重
  lastOpenKey = key;
  lastOpenTime = now;
  openFn();
}
