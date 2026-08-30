// ===== 云草稿：自动保存/清除（防抖由调用方负责） =====
// 保存/清除后同步 SWR 缓存（key /me/drafts），否则 useDrafts 命中旧缓存
// （revalidateIfStale:false 不自动重拉）→ 草稿"云同步失效"
import { api } from '../api/client';
import { mutate } from 'swr';

export async function saveDraft(key: string, data: unknown): Promise<void> {
  await api('/me/drafts', { method: 'POST', body: { key, data } });
  // 后台重验证（不阻塞保存）：让本设备/其他打开弹窗的组件拿到最新草稿
  void mutate('/me/drafts');
}

export async function clearDraft(key: string): Promise<void> {
  await api('/me/drafts?key=' + encodeURIComponent(key), { method: 'DELETE' });
  void mutate('/me/drafts');
}
