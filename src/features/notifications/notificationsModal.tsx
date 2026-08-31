// ===== 通知弹窗：SWR 缓存列表（WS 实时刷新）+ 点击标已读跳转 + 全部已读 =====
// 弹窗由 Layout 用 Mantine <Modal opened> 控制（单例，避免 @mantine/modals 全局栈叠加问题）
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Group, Loader, Stack, Text } from '@mantine/core';
import { mutate } from 'swr';
import { api } from '../../api/client';
import { useNotifications, useMe, useTags } from '../../api/hooks';
import { requireLogin } from '../auth/authModals';
import { seedTopicCacheFromList } from '../home/composer';
import { timeAgo } from '../../lib/utils';
import type { DiscussionDetail, NotificationItem, NotifListResult, NotifType } from '../../types';

// 通知图标：didi → 📨；invite → 🎭（邀请接戏）；coin → 🪙（投币/打赏）；report/report_result → ⚑；其余（reply）→ 💬
function notifIcon(type: NotifType): string {
  if (type === 'didi') return '📨';
  if (type === 'invite') return '🎭';
  if (type === 'coin') return '🪙';
  if (type === 'report' || type === 'report_result') return '⚑';
  return '💬';
}

// 文案：优先 content；didi/reply/invite/coin 无 content 时按类型拼接
// 全沉浸：content 已含角色名（后端用角色名生成）；这里兜底用角色名/用户名
function notifText(n: NotificationItem): string {
  if (n.content) return n.content;
  const who = n.actor_character_name || n.actor_name || '有人';
  if (n.type === 'didi') return `${who} 滴滴了你`;
  if (n.type === 'invite') return `${who} 邀请你接戏`;
  if (n.type === 'coin') return `${who} 给你投了币`;
  if (n.type === 'reply') return `${who} 回复了你`;
  return '新通知';
}

export function NotificationsModalContent({ onClose }: { onClose: () => void }) {
  // 用 useMe()（SWR 全局缓存）读用户，避免弹窗 portal 里 AuthProvider context 不穿透导致误判未登录
  const { user } = useMe();
  const navigate = useNavigate();
  const { data, isLoading } = useNotifications();
  const { tags } = useTags();
  // 分页：SWR 只拿第 1 页（20 条），"加载更多"追加本地 state（弹窗每次打开重新 mount，state 自然重置）
  const [extra, setExtra] = useState<NotificationItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // 第 1 页数据变化（已读后 mutate/重拉）→ 重置追加页，避免与第 1 页重复或错乱
  useEffect(() => {
    setExtra([]);
    setPage(1);
    setHasMore(!!data?.meta?.hasMore);
  }, [data]);
  const list = [...(data?.data ?? []), ...extra];
  // 防重复：StrictMode 下 effect 会执行两次，且 user 在加载中/未登录间跳动时可能连续触发
  const promptedRef = useRef(false);

  // 未登录：提示登录（只提示一次；由外层 onClose 关闭本弹窗）
  useEffect(() => {
    if (user === null && !promptedRef.current) {
      promptedRef.current = true;
      onClose();
      requireLogin('查看通知');
    }
    if (user) promptedRef.current = false;
  }, [user, onClose]);

  if (user === null) return null;

  // 加载更多（第 page+1 页，追加去重）
  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const r = await api<NotifListResult>(`/me/notifications?page=${next}`);
      const nextItems = r.data || [];
      setExtra((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        return [...prev, ...nextItems.filter((n) => !seen.has(n.id))];
      });
      setPage(next);
      setHasMore(!!r.meta?.hasMore);
    } catch {
      /* 加载更多失败：保留现状，可重试 */
    } finally {
      setLoadingMore(false);
    }
  };

  // 点击单条：立即显示"正在打开…"加载反馈（跳转前）→ 标记已读 → 刷新 → 跳转 → 关闭弹窗
  // 接戏/滴滴通知：带 state 让主题页自动引用对方（回复框自动 @对方）
  const [navigating, setNavigating] = useState(false);

  // 通知点入乐观渲染：用通知携带的主题上下文种入详情缓存（首帖 + 目标楼所在页楼层 + 回复链，
  // 负 id 标记），主题页首帧直接显示完整楼层序列（目标楼前后楼层都在 → 页面高度正确，
  // 定位直接到位，不等真实数据也不跳变），后台 revalidate 拉真实替换。
  // useTopicPagination 检测到乐观帖会强制重验，与列表点进主题同机制。
  // targetPagePosts：目标楼所在页的真实楼层（预取），并入乐观帧让页面高度与真实一致。
  const seedTopicFromNotif = (
    n: NotificationItem,
    targetPagePosts?: Array<{ number: number; content: string; author: string }>
  ) => {
    if (!n.discussion_id || !n.discussion_title) return;
    // 乐观帧楼层：目标楼所在页（含目标楼前后楼层）+ 被回复楼 + 触发回复，去重后按楼层号并入
    const extraPosts: Array<{ number: number; content: string; author: string }> = [];
    const seen = new Set<number>();
    const pushPost = (number: number, content: string, author: string) => {
      if (!number || seen.has(number)) return;
      seen.add(number);
      extraPosts.push({ number, content, author });
    };
    if (Array.isArray(targetPagePosts)) {
      for (const p of targetPagePosts) pushPost(p.number, p.content, p.author || '有人');
    }
    if (n.target_reply_to_number && n.target_reply_to_excerpt) {
      pushPost(n.target_reply_to_number, n.target_reply_to_excerpt, n.target_reply_to_author || '有人');
    }
    if (n.target_number && n.target_excerpt) {
      pushPost(n.target_number, n.target_excerpt, n.target_author || n.actor || n.actor_name || '有人');
    }
    seedTopicCacheFromList({
      id: n.discussion_id,
      title: n.discussion_title,
      author: n.discussion_author || undefined,
      author_avatar: n.discussion_author_avatar ?? undefined,
      excerpt: n.discussion_excerpt || undefined,
      image_url: n.discussion_image_url ?? null,
      is_private: n.discussion_is_private || 0,
      comment_count: n.discussion_comment_count || 1,
      tags: n.discussion_tags || undefined,
    }, tags, extraPosts.length ? extraPosts : undefined);
  };

  const markReadAndGo = async (n: NotificationItem) => {
    if (navigating) return; // 防重复点击
    setNavigating(true);
    // 标记已读异步化：不等待网络请求完成再跳转（否则每次点通知都有 0.2-0.5s"正在打开…"等待）。
    // 跳转不依赖已读结果（失败静默），未读数由后台刷新/下次查询收敛。
    void api('/me/notifications/read', { method: 'POST', body: { id: n.id } }).catch(() => {});
    mutate('/me/notifications'); // 列表 + 未读徽标（同一 SWR key）
    mutate('/me');
    if (n.url) {
      // 主题类通知（接戏/滴滴）→ 先种乐观缓存再跳转；管理类（举报/标签申请）→ 直接跳
      if (n.url.startsWith('/d/')) {
        // 已在同一主题页时【跳过种子】：详情缓存里已是真实数据（含已加载楼层），
        // 种子会把 page1 覆盖成"少量乐观帖"→ 页面闪变、目标楼 DOM 短暂消失，反而定位不到。
        // 只在跨页面进入（缓存无该主题真实数据）时才种乐观首帧。
        const targetPath = n.url.split('?')[0];
        const alreadyHere = window.location.pathname === targetPath;
        console.log('[zhuge-jump] markReadAndGo', { url: n.url, targetPath, alreadyHere, cur: window.location.pathname + window.location.search, targetNumber: n.target_number });
        if (!alreadyHere) {
          // 预取目标楼之前的楼层 + 目标楼所在页：合并去重后乐观帧楼层完整（首帖 + 1..N），
          // 页面高度从一开始就与真实一致 → 首帧定位直接到位（不再"乐观帧太矮定位不到位、
          // 等真实楼层到达再跳"）。失败静默 → 退回仅种回复链的乐观帧（原行为）。
          // 只拉目标页不够：目标楼若在最后一页（如 25 楼主题），该页仅含少数楼层，
          // 乐观帧仍缺大部分楼层、页面太矮。补 asc 第 1 页（1-20 楼）覆盖常见主题。
          let targetPagePosts: Array<{ number: number; content: string; author: string }> | undefined;
          if (n.post_id && n.discussion_id) {
            try {
              const [page1Res, aroundRes] = await Promise.allSettled([
                api<{ data: DiscussionDetail }>(`/discussions/${n.discussion_id}?page=1&order=old`),
                api<{ data: DiscussionDetail }>(
                  `/discussions/${n.discussion_id}?page=1&order=old&aroundPostId=${n.post_id}`
                ),
              ]);
              const merged = new Map<number, { number: number; content: string; author: string }>();
              for (const r of [page1Res, aroundRes]) {
                if (r.status !== 'fulfilled') continue;
                for (const p of (r.value.data.posts || [])) {
                  if (!merged.has(p.number)) {
                    merged.set(p.number, { number: p.number, content: p.content, author: p.author || '' });
                  }
                }
              }
              targetPagePosts = [...merged.values()].sort((a, b) => a.number - b.number);
              console.log('[zhuge-jump] prefetched floors', {
                postId: n.post_id,
                posts: targetPagePosts.length,
                numbers: targetPagePosts.slice(0, 3).map((p) => p.number),
                last: targetPagePosts[targetPagePosts.length - 1]?.number,
              });
            } catch {
              /* 预取失败：走原乐观帧 */
            }
          }
          seedTopicFromNotif(n, targetPagePosts);
        }
        // 相同 URL 时 React Router navigate 是 no-op（不触发 TopicPage 定位 effect）：
        // 发自定义事件强制定位（TopicPage 监听 'zhuge:jump'）
        if (n.url === window.location.pathname + window.location.search) {
          console.log('[zhuge-jump] same URL → dispatch zhuge:jump', n.post_id);
          window.dispatchEvent(
            new CustomEvent('zhuge:jump', {
              detail: { replyPostId: n.post_id, replyNumber: n.target_number ?? undefined, replyAuthor: n.actor_name || undefined },
            })
          );
        } else {
          // 追加楼层号：TopicPage 定位优先按楼层号命中乐观种子（负 id 帖也带真实楼层号），
          // 直接滚动零请求，不再等 around 拉目标页
          if (n.target_number) {
            const u = new URL(n.url, window.location.origin);
            u.searchParams.set('replyNumber', String(n.target_number));
            navigate(u.pathname + u.search);
          } else {
            navigate(n.url);
          }
        }
      } else {
        navigate(n.url);
      }
    } else if (n.discussion_id) {
      seedTopicFromNotif(n);
      const isReply = n.type === 'reply' || n.type === 'didi';
      if (isReply && n.post_id) {
        // 用 URL query 传回复目标（系统推送同款方式，TopicPage 读 ?reply=&replyAuthor=）：
        // React Router navigate state 在弹窗场景偶发丢失，query 方式可靠
        const qs = new URLSearchParams({ reply: String(n.post_id) });
        if (n.actor_name) qs.set('replyAuthor', n.actor_name);
        // 楼层号：定位优先按楼层号命中乐观种子（负 id 帖也带真实楼层号），直接滚动零请求
        if (n.target_number) qs.set('replyNumber', String(n.target_number));
        navigate(`/d/${n.discussion_id}?${qs.toString()}`);
      } else {
        navigate(`/d/${n.discussion_id}`);
      }
    }
    onClose();
  };

  // 全部已读（乐观更新：先本地标记全部已读 + 未读归零，请求后台进行；失败回滚）
  const [markingAll, setMarkingAll] = useState(false);
  const markAllRead = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    // 乐观：本地立即标记已读
    const optimistic = (current?: NotifListResult): NotifListResult => ({
      data: (current?.data || []).map((n) => ({ ...n, is_read: 1 })),
      meta: { unread: 0 },
    });
    try {
      await mutate('/me/notifications', optimistic, { revalidate: false, rollbackOnError: true });
    } catch {
      /* 乐观更新失败忽略 */
    }
    setMarkingAll(false); // 乐观已生效：按钮立即恢复（不等网络请求，避免"已已读还转圈"）
    void mutate('/me'); // 未读徽标（乐观后重拉确认）
    try {
      await api('/me/notifications/read', { method: 'POST', body: { all: true } });
      void mutate('/me/notifications');
      void mutate('/me');
    } catch {
      // 失败：回滚 + 重拉
      void mutate('/me/notifications');
      void mutate('/me');
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <Stack gap="xs">
        {list.length > 0 && (
          <Group justify="flex-end">
            <Button variant="subtle" size="compact-sm" onClick={markAllRead} loading={markingAll} loaderProps={{ size: 'xs' }}>
              全部已读
            </Button>
          </Group>
        )}
        {isLoading && list.length === 0 ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
          </Group>
        ) : list.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            还没有通知
          </Text>
        ) : (
          <Stack gap={4}>
            {list.map((n) => (
              <div
                key={n.id}
                className={`notif-item${n.is_read ? '' : ' unread'}`}
                onClick={() => markReadAndGo(n)}
              >
                {n.actor_character_appearance ? (
                  // 全沉浸：以角色触发 → 显示角色头像
                  <img
                    src={n.actor_character_appearance}
                    alt=""
                    style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : (
                  <span className="notif-icon">{notifIcon(n.type)}</span>
                )}
                <div className="notif-body">
                  <div className="notif-text">{notifText(n)}</div>
                  {/* 被回复/被滴滴帖子的内容摘要（"回复了什么"）：通知更完整，点入前先看到上下文 */}
                  {n.target_excerpt ? (
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--muted)',
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 260,
                      }}
                    >
                      {n.target_author ? `@${n.target_author}：` : ''}
                      {n.target_excerpt}
                    </div>
                  ) : null}
                  <div className="notif-time">
                    {n.actor_character_name ? `${n.actor_character_name} · ` : ''}
                    {timeAgo(n.created_at)}
                  </div>
                </div>
                {!n.is_read && <span className="notif-dot" />}
              </div>
            ))}
            {hasMore && (
              <Button
                variant="subtle"
                size="compact-sm"
                fullWidth
                mt={4}
                onClick={loadMore}
                loading={loadingMore}
                loaderProps={{ size: 'xs' }}
              >
                加载更多
              </Button>
            )}
          </Stack>
        )}
      </Stack>

      {/* 跳转前加载反馈：点击通知后立即出现，标记已读完成即跳转 */}
      {navigating && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(255,255,255,.72)',
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            zIndex: 3,
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
          }}
        >
          <Loader size="md" />
          <Text size="sm" c="dimmed">
            正在打开…
          </Text>
        </div>
      )}
    </div>
  );
}
