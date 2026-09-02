// ===== SWR hooks：按领域组织的取数 hooks（数据/缓存/重验证都在这里） =====
import { useEffect } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { api, readInitData } from './client';

// 写操作（发帖/回复/编辑/删除/滴滴等）后的全局缓存同步：
// SSR fallback 是页面加载快照，revalidateIfStale:false 不会自动重拉，
// 因此所有影响"列表/计数"的写操作后都要调用本函数，否则切回列表页看到的还是旧数据（需手动刷新网页）。
// 刷新范围：公开讨论列表（/discussions?...）、我的主题、私密主题、标签、皮、通知。
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
// 防重复：① 本次会话已预加载过的 key 不再请求（模块级 Set，跨路由/页面持久）；
// ② 同一分钟内的重复调用直接跳过（避免路由变化反复调度整批请求打满限流/429）。
let preloadedMinute = 0;
const preloadedKeys = new Set<string>();
export function preloadAllPrimaryLists(tags: Tag[]) {
  const primary = (tags || []).filter((t) => t.position != null && !t.is_hidden);
  const seed = Math.floor(Date.now() / 60000) + 1;
  const nowMinute = Math.floor(Date.now() / 60000);
  // 同一分钟内已预加载过 → 跳过（路由切换/回首页反复触发时不再重复请求）
  if (preloadedMinute === nowMinute) return;
  preloadedMinute = nowMinute;
  const keys: string[] = [];
  // "全部"标签（首页默认 tag=null）优先预加载：其他页面（详情页等）停留时预热首页，
  // 回首页直接命中缓存，零请求零骨架
  for (const sort of ['recommend', 'latest', 'hot'] as const) {
    const qs = new URLSearchParams({ sort, page: '1' });
    if (sort === 'recommend') qs.set('seed', String(seed));
    keys.push('/discussions?' + qs.toString());
  }
  for (const t of primary) {
    for (const sort of ['recommend', 'latest', 'hot'] as const) {
      const qs = new URLSearchParams({ sort, page: '1' });
      qs.set('tag', String(t.id));
      if (sort === 'recommend') qs.set('seed', String(seed));
      keys.push('/discussions?' + qs.toString());
    }
  }
  // 分批预取（每批 3 个，间隔 300ms），避免一次性并发打满限流/连接；
  // 已预加载过的 key 跳过（模块级 Set 跨调用持久），避免重复请求；
  // 用 globalMutate(key, updater) 填充缓存（与 useDiscussions 同 key 同结构）
  const uncached = keys.filter((k) => !preloadedKeys.has(k));
  uncached.forEach((k, i) => {
    preloadedKeys.add(k); // 标记已请求（无论成败，避免重复调度）
    window.setTimeout(() => {
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
  CoinInfo,
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
    }>('/init');
    return { user: r.user, tags: r.tags, drafts: r.drafts, discussions: [], hasMore: true, unread: r.unread };
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

// SSR 只内联主标签（4 个，position 非空），全量 IP 标签（614 个）按需拉取以减小首屏 HTML。
// 这里区分两种情况：
//  - 数据只有主标签（SSR fallback 命中，revalidateIfStale:false 不会自动补拉）→ 挂载后
//    后台补拉一次全量（保证 /my、/private、种子缓存等场景能匹配到 IP 标签颜色/名字）；
//    补拉只做一次（标志位），避免 Layout/HomePage/各页面多实例重复请求。
//  - 已经全量（或弹窗 mutate 后）→ 不重复拉。
let tagsFullRequested = false;
export function useTags(): { tags: Tag[]; isLoading: boolean } {
  const { data, isLoading, mutate } = useSWR<Tag[]>('/tags', async (p: string) => {
    const r = await api<{ data: Tag[] }>(p);
    return r.data;
  });
  // 主标签数量 < 全部有 position 之外的标签 → 判断当前是"只有主标签"的 SSR 快照：
  // 若存在任意 position == null 的标签则为全量；否则判定为瘦身快照，后台补拉全量一次。
  useEffect(() => {
    if (!data || data.length === 0) return;
    const hasSecondary = data.some((t) => t.position == null);
    if (!hasSecondary && !tagsFullRequested) {
      tagsFullRequested = true;
      void mutate(undefined, { revalidate: true }).catch(() => {});
    }
  }, [data, mutate]);
  return { tags: data || [], isLoading };
}

// 讨论列表（feed/列表共用；key 含参数保证不同排序/标签各自缓存）
export interface DiscussionParams {
  sort: 'recommend' | 'latest' | 'hot';
  page: number;
  tag?: number | null;
  seed?: number;
}
export function useDiscussions(params: DiscussionParams) {
  const qs = new URLSearchParams({
    sort: params.sort,
    page: String(params.page),
  });
  if (params.tag) qs.set('tag', String(params.tag));
  if (params.sort === 'recommend' && params.seed) qs.set('seed', String(params.seed));
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

// 我的格币（余额/累计/等级）；每日打开自动领币在 Layout 挂载时调 /me/daily-claim。
// enabled=false（未登录）时 key 为 null 不请求——避免未登录时打 /api/me/coins 返回 401 报错
export function useCoins(enabled: boolean = true) {
  return useSWR<CoinInfo>(enabled ? '/me/coins' : null, async (p: string) => {
    const r = await api<{ data: CoinInfo }>(p);
    return r.data;
  });
}

// 下一步引导（首页横幅）：调用 /api/me/next-step——未登录返回"注册《主格》"，
// 已登录返回首个未完成建议任务 / 全部完成 🎉。与 MCP get_daily_todo 同一 action 逻辑。
// key 依赖登录态：游客拉"注册引导"；0 步自动注册后 user 出现 → key 变化（?uid=）→ 重新拉登录态引导
// （否则 SWR 缓存游客的"注册"横幅不刷新，用户已登录却一直看到"下一步：注册"）
export function useNextStep() {
  const { user } = useMe();
  const enabled = user !== undefined; // 等 /me 加载完成（自动注册可能还没发生）再请求
  const key = enabled ? (user ? `/me/next-step?uid=${user.id}` : '/me/next-step') : null;
  return useSWR<{ next?: string }>(key, async (p: string) => {
    const r = await api<{ data: { next?: string } }>(p);
    return r.data;
  });
}

export function useDrafts(enabled: boolean = true) {
  // enabled=false（未登录）时 key 为 null → 不请求（游客不拉 /me/drafts，避免 401 噪音）
  return useSWR<Record<string, unknown>>(enabled ? '/me/drafts' : null, async (p: string) => {
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
