// ===== 云草稿：自动保存/清除（防抖由调用方负责） =====
import { api } from '../api/client';

export async function saveDraft(key: string, data: unknown): Promise<void> {
  await api('/me/drafts', { method: 'POST', body: { key, data } });
}

export async function clearDraft(key: string): Promise<void> {
  await api('/me/drafts?key=' + encodeURIComponent(key), { method: 'DELETE' });
}
