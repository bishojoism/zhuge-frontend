// ===== SWR hooks：按领域组织的取数 hooks（数据/缓存/重验证都在这里） =====
import useSWR from 'swr';
import { api, readInitData } from './client';
import type {
  AdminReport,
  AdminStats,
  AdminUser,
  DeviceAuthRequest,
  Discussion,
  DiscussionDetail,
  DiscussionListResult,
  InitData,
  IpLogRow,
  MyTopicItem,
  NotifListResult,
  DidiStats,
  PrivateItem,
  SecurityInfo,
  Tag,
  User,
} from '../types';

// 通用 fetcher：路径即 key
export const fetcher = <T>(path: string): Promise<T> => api<T>(path);

// 首屏初始化数据（SSR 内联优先，否则请求 /api/init）
export function useInitData(): { data: InitData | null | undefined; isLoading: boolean } {
  const { data, isLoading } = useSWR<InitData | null>('/init', async (p: string) => {
    const inline = readInitData<InitData>();
    if (inline) return inline;
    const r = await api<{
      user: User | null;
      tags: Tag[];
      drafts: Record<string, unknown>;
      unread: number;
      deviceAuthPending: number;
    }>('/init');
    return { user: r.user, tags: r.tags, drafts: r.drafts, discussions: [], hasMore: true, unread: r.unread, deviceAuthPending: r.deviceAuthPending };
  });
  return { data, isLoading };
}

export function useMe(): { user: User | null | undefined; isLoading: boolean; mutate: () => Promise<unknown> } {
  const { data, isLoading, mutate } = useSWR<User | null>('/me', async (p: string) => {
    const r = await api<{ data: User | null }>(p);
    return r.data;
  });
  return { user: data, isLoading, mutate: () => mutate() };
}

export function useTags(): { tags: Tag[]; isLoading: boolean } {
  const { data, isLoading } = useSWR<Tag[]>('/tags', async (p: string) => {
    const r = await api<{ data: Tag[] }>(p);
    return r.data;
  });
  return { tags: data || [], isLoading };
}

// 讨论列表（feed/列表共用；key 含参数保证不同排序/标签各自缓存）
export interface DiscussionParams {
  sort: 'recommend' | 'latest' | 'hot';
  page: number;
  tag?: number | null;
  seed?: number;
  q?: string;
}
export function useDiscussions(params: DiscussionParams) {
  const qs = new URLSearchParams({
    sort: params.sort,
    page: String(params.page),
  });
  if (params.tag) qs.set('tag', String(params.tag));
  if (params.sort === 'recommend' && params.seed) qs.set('seed', String(params.seed));
  if (params.q) qs.set('q', params.q);
  const key = '/discussions?' + qs.toString();
  const { data, isLoading, mutate } = useSWR<DiscussionListResult>(key, async (p: string) => {
    const r = await api<{ data: Discussion[]; meta: { hasMore: boolean } }>(p);
    return { data: r.data, meta: r.meta };
  });
  return { result: data, isLoading, mutate, key };
}

export function useTopic(id: number | string | undefined) {
  const key = id ? `/discussions/${id}` : null;
  return useSWR<DiscussionDetail>(key, async (p: string) => {
    const r = await api<{ data: DiscussionDetail }>(p);
    return r.data;
  });
}

export function useUnread(enabled: boolean = true): { unread: number; mutate: () => void } {
  // 与 useNotifications 共用同一个 SWR key 和 fetcher（/me/notifications → {data, meta}），
  // 否则两个 hook 用不同 fetcher/结构写同一个缓存，弹窗会读到"数字"导致列表永远为空
  // enabled=false（未登录）时 key 为 null → 不请求（首屏零 API）
  const { data, mutate } = useSWR<NotifListResult>(enabled ? '/me/notifications' : null, fetcher);
  return { unread: data?.meta?.unread || 0, mutate: () => mutate() };
}

export function useNotifications(enabled: boolean = true) {
  return useSWR<NotifListResult>(enabled ? '/me/notifications' : null, fetcher);
}

export function usePrivateList() {
  return useSWR<{ data: PrivateItem[]; meta?: { didiStats?: DidiStats } }>('/me/private', async (p: string) => {
    const r = await api<{ data: PrivateItem[]; meta?: { didiStats?: DidiStats } }>(p);
    return r;
  });
}

// 我的主题（公开，我发布的）
export function useMyDiscussions() {
  return useSWR<MyTopicItem[]>('/me/discussions', async (p: string) => {
    const r = await api<{ data: MyTopicItem[] }>(p);
    return r.data;
  });
}

export function useSecurity() {
  return useSWR<SecurityInfo>('/me/security', async (p: string) => {
    const r = await api<{ data: SecurityInfo }>(p);
    return r.data;
  });
}

export function useDrafts() {
  return useSWR<Record<string, unknown>>('/me/drafts', async (p: string) => {
    const r = await api<{ data: Record<string, unknown> }>(p);
    return r.data;
  });
}

// 管理后台
export function useAdminStats() {
  return useSWR<AdminStats>('/admin/ip-logs/stats', fetcher);
}
export function useAdminReports() {
  return useSWR<AdminReport[]>('/admin/reports', async (p: string) => {
    const r = await api<{ data: AdminReport[] }>(p);
    return r.data;
  });
}
export function useAdminUsers() {
  return useSWR<AdminUser[]>('/admin/users', async (p: string) => {
    const r = await api<{ data: AdminUser[] }>(p);
    return r.data;
  });
}
export function useIpLogs() {
  return useSWR<IpLogRow[]>('/admin/ip-logs', async (p: string) => {
    const r = await api<{ data: IpLogRow[] }>(p);
    return r.data;
  });
}

// 设备授权请求
export function useDeviceAuthRequests() {
  return useSWR<DeviceAuthRequest[]>('/device/auth-requests/mine', async (p: string) => {
    const r = await api<{ data: DeviceAuthRequest[] }>(p);
    return r.data;
  });
}
