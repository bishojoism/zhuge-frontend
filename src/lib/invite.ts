// 邀请人捕获/消费（?invite=&lt;uid&gt; 链接触达即存；注册成功后消费，单设备单次生效）
const KEY = 'zhuge-invite';

export function readInvitedBy(): number | undefined {
  try {
    const v = localStorage.getItem(KEY);
    if (v && /^\d{1,10}$/.test(v)) return Number(v);
  } catch {
    /* 忽略 */
  }
  return undefined;
}

export function consumeInvite(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 忽略 */
  }
}
