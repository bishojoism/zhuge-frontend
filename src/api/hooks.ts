// ===== SWR hooks：按领域组织的取数 hooks（数据/缓存/重验证都在这里） =====
import { useEffect } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { api, readInitData } from './client';

// 写操作（发帖/回复/编辑/删除/滴滴等）后的全局缓存同步：
// SSR fallback 是页面加载快照，revalidateIfStale:false 不会自动重拉，
// 因此所有影响"列表/计数"的写操作后都要调用本函数，否则切回列表页看到的还是旧数据（需手动刷新网页）。
// 刷新范围：公开讨论列表（/discussions?...）、我的主题、私密主题、标签、角色卡、通知。
export function refreshListsAfterWrite() {
  const matches = (k: unknown) =>
    typeof k === 'string' &&
    (k.startsWith('/discussions?') ||
      k.startsWith('/me/discussions') ||
      k.startsWith('/me/private') ||
      k.startsWith('/tags') ||
      k.startsWith('/me/characters') ||
      k.startsWith('/me/notifications'));
  return globalMutate(matches, undefined, { revalidate: true }).catch(() => {});
}

// 预加载所有主标签 × 全部三种排序的首页数据（page=1），填充 SWR 缓存：
// 在任一标签下浏览时，后台把"全部主标签 × recommend/latest/hot"的列表都拉好，
// 切换标签/排序时 SWR 直接命中缓存，秒切零加载。
// recommend 用当前分钟 seed（与前端 newSeed 一致）→ 同分钟内切换命中。
// 注意：只预取公开页数据；分页 page=1（首页数据，滑动加载后续页时才请求）。
export function preloadAllPrimaryLists(tags: Tag[]) {
  const primary = (tags || []).filter((t) => t.position != null && !t.is_hidden);
  if (!primary.length) return;
  const seed = Math.floor(Date.now() / 60000) + 1;
  const keys: string[] = [];
  for (const t of primary) {
    for (const sort of ['recommend', 'latest', 'hot'] as const) {
      const qs = new URLSearchParams({ sort, page: '1' });
      qs.set('tag', String(t.id));
      if (sort === 'recommend') qs.set('seed', String(seed));
      keys.push('/discussions?' + qs.toString());
    }
  }
  // 分批预取（每批 3 个，间隔 300ms），避免一次性并发打满限流/连接；
  // 用 globalMutate(key, updater) 填充缓存（与 useDiscussions 同 key 同结构）
  keys.forEach((k, i) => {
    window.setTimeout(() => {
      // globalMutate(key, updater)：updater 收到 currentData（SWR 语义），这里直接用闭包 k 请求
      void globalMutate<DiscussionListResult>(k, async () => {
        const r = await api<{ data: Discussion[]; meta: { hasMore: boolean } }>(k);
        return { data: r.data, meta: r.meta };
      }, { revalidate: false }).catch(() => {});
    }, i * 300 + 1500); // 首屏渲染后开始（1.5s 起，逐批间隔 300ms）
  });
}
// 管理后台类型（adminApi 只 import api，无循环依赖）
import type {
  AdminTagRow,
  OverviewStats,
  StickyDiscussion,
  TagRequestRow,
} from '../features/admin/adminApi';
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
  MyBadgesResult,
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

// 主题详情（帖子分页）：key 含 page/order（'new'=从新到旧 desc / 'old'=从旧到新 asc），
// 每页独立缓存，前端滚动加载 + 预取下一页；SSR 内联的是 page=1&order=new
export function useTopic(id: number | string | undefined, page: number = 1, order: 'new' | 'old' = 'new') {
  const key = id ? `/discussions/${id}?page=${page}&order=${order}` : null;
  return useSWR<DiscussionDetail>(key, async (p: string) => {
    const r = await api<{ data: DiscussionDetail }>(p);
    return r.data;
  });
}

export function useUnread(enabled: boolean = true): { unread: number; mutate: () => void } {
  // 与 useNotifications 共用同一个 SWR key 和 fetcher（/me/notifications → {data, meta}），
  // 否则两个 hook 用不同 fetcher/结构写同一个缓存，弹窗会读到"数字"导致列表永远为空
  // enabled=false（未登录）时 key 为 null → 不请求（首屏零 API）
  // refreshInterval 60s：所有界面后台定期刷新通知数据，通知弹窗随时打开都是最新
  const { data, mutate } = useSWR<NotifListResult>(enabled ? '/me/notifications' : null, fetcher, {
    refreshInterval: enabled ? 60000 : 0,
  });
  // 通知列表预加载：SSR fallback 只内联了 unread 数（data 为空列表），而全局
  // revalidateIfStale:false 会抑制挂载后的自动重新验证 → 通知列表一直是空的，
  // 点铃铛打开弹窗时才现拉，先闪"还没有通知"再转 loading。
  // 登录就绪时强制重拉一次，把真实通知列表预加载进缓存（弹窗打开即显示，无闪烁）。
  useEffect(() => {
    if (enabled) void mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
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

// 我的徽章 + 邀请统计（邀请弹窗 / 徽章弹窗共用，SWR 缓存去重）
// 类型复用 types.ts 的 MyBadgesResult

export function useMyBadges() {
  return useSWR<MyBadgesResult>('/me/badges', async (p: string) => {
    const r = await api<{ data: MyBadgesResult }>(p);
    return r.data;
  });
}

// 我的邀请明细（谁通过我的链接注册）
export interface InvitedUser {
  id: number;
  username: string;
  created_at: string;
}

export function useMyInvites() {
  return useSWR<InvitedUser[]>('/me/invites', async (p: string) => {
    const r = await api<{ data: InvitedUser[] }>(p);
    return r.data;
  });
}

// 我的 API 令牌列表（开放 API 弹窗）
export interface ApiTokenRow {
  id: number;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

export function useApiTokens() {
  return useSWR<ApiTokenRow[]>('/me/api-tokens', async (p: string) => {
    const r = await api<{ data: ApiTokenRow[] }>(p);
    return r.data;
  });
}

// ===== 管理后台次级数据（SWR 缓存/去重；与 adminApi.ts 的请求封装共用 key） =====
export function useAdminOverview() {
  return useSWR<OverviewStats>('/admin/overview', async (p: string) => {
    const r = await api<{ data: OverviewStats }>(p);
    return r.data;
  });
}

export function useStickyDiscussions() {
  return useSWR<StickyDiscussion[]>('/sticky-discussions', async (p: string) => {
    const r = await api<{ data: StickyDiscussion[] }>(p);
    return r.data;
  });
}

export function useTagRequests() {
  return useSWR<TagRequestRow[]>('/tag-requests', async (p: string) => {
    const r = await api<{ data: TagRequestRow[] }>(p);
    return r.data;
  });
}

export function useAdminTags() {
  return useSWR<AdminTagRow[]>('/admin/tags', async (p: string) => {
    const r = await api<{ data: AdminTagRow[] }>(p);
    return r.data;
  });
}
