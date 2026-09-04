// ===== 通知弹窗：SWR 缓存列表（WS 实时刷新）+ 点击标已读跳转 + 全部已读 =====
// 弹窗由 Layout 用 Mantine <Modal opened> 控制（单例，避免 @mantine/modals 全局栈叠加问题）
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActionIcon, Button, Group, Loader, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { mutate as globalMutate } from 'swr';
import { api } from '../../api/client';
import { useNotifications, useMe, useNextStep } from '../../api/hooks';
import { requireLogin } from '../auth/authModals';
import { timeAgo } from '../../lib/utils';
import type { NotificationItem, NotifListResult, NotifType } from '../../types';

// 通知图标：didi → 📨；invite → 🎭（邀请接戏）；coin → 🪙（投币/打赏）；report/report_result → ⚑；
// content_review → 🛡（内容送审，管理员复核）；其余（reply）→ 💬
function notifIcon(type: NotifType): string {
  if (type === 'didi') return '📨';
  if (type === 'invite') return '🎭';
  if (type === 'coin') return '🪙';
  if (type === 'report' || type === 'report_result') return '⚑';
  if (type === 'content_review') return '🛡';
  return '💬';
}

// 文案：优先 content；didi/reply/invite/coin 无 content 时按类型拼接
// 全沉浸：content 已含皮名（后端用皮名生成）；这里兜底用皮名/用户名
function notifText(n: NotificationItem): string {
  if (n.content) return n.content;
  // 触发者：actor（后端统一字段）优先，兼容旧 actor_name
  const who = n.actor_character_name || n.actor || n.actor_name || '有人';
  if (n.type === 'didi') return `${who} 滴滴了你`;
  if (n.type === 'invite') return `${who} 邀请你接戏`;
  if (n.type === 'coin') return `${who} 给你投了币`;
  // 兜底文案与后端一致：公开主题的 reply 通知用「接了你的戏」（UI 动作叫接戏），私密主题用「回复了你」
  if (n.type === 'reply') return n.discussion_is_private ? `${who} 回复了你` : `${who} 接了你的戏`;
  return '新通知';
}

export function NotificationsModalContent({ onClose }: { onClose: () => void }) {
  // 用 useMe()（SWR 全局缓存）读用户，避免弹窗 portal 里 AuthProvider context 不穿透导致误判未登录
  const { user } = useMe();
  const navigate = useNavigate();
  const { data, isLoading } = useNotifications();
  // 「下一步」引导（原首页横幅迁入）：/api/me/next-step——登录态显示首个未完成建议任务/🎉
  // 首帧数据未就绪也渲染占位横幅（骨架），避免面板顶部空白闪帧
  const { data: nextData, isLoading: nextLoading } = useNextStep();
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
  // 再弹一次"点击反馈"：正在重放的那条 id（图标短暂变 ✓ 后再还原）
  const [replayFb, setReplayFb] = useState<number | null>(null);

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

  // 无限滚动：列表底部哨兵进入可视区（面板滚动容器内，IO 会考虑祖先 overflow 裁剪）
  // 自动加载下一页，替代手动"加载更多"按钮
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          void loadMore();
        }
      },
      { rootMargin: '0px 0px 1500px 0px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  // 点击单条：标记已读 → 刷新未读 → 跳转 → 关闭弹窗。
  // 【跳转方式】主题类通知（/d/）跨页面进入时**直接整页走 SSR**：服务端按 URL 里的
  // ?replyNumber= / ?focusPost= 内联目标楼所在页（topicAround），首帧即含目标楼并定位，
  // 不再需要"点击时预取三页 + 种乐观帧"的上下文乐观逻辑，也就不再有"正在打开…"等待。
  // 防重复点击：弹窗关闭前锁住（打开弹窗会重新 mount，ref 自然重置）
  const navLockRef = useRef(false);
  // bfcache 防护：iOS Safari 返回上一页时用 bfcache **原样恢复 JS 堆状态**——
  // 若跳转前点过通知，恢复后 navLockRef 仍是 true、弹窗仍是开的，之后所有通知
  // 点击都会被锁静默拦截（无遮罩、无跳转），表现为"先点#3 再点#2/#4 没反应"。
  // pageshow 在 bfcache 恢复（persisted=true）和普通加载都会触发 → 恢复时解锁。
  useEffect(() => {
    const onShow = () => {
      navLockRef.current = false;
      const overlay = document.getElementById('zhuge-nav-overlay');
      if (overlay) overlay.remove();
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);
  // 跨页整页加载：插入全屏"正在打开…"遮罩（同步插入，不依赖 React 渲染时序）
  const showNavOverlay = () => {
    try {
      const div = document.createElement('div');
      div.id = 'zhuge-nav-overlay';
      div.style.cssText =
        'position:fixed;inset:0;z-index:9999;background:var(--mantine-color-body,#fff);' +
        'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;' +
        'font-family:system-ui,-apple-system,sans-serif;';
      div.innerHTML =
        '<style>@keyframes zhuge-spin{to{transform:rotate(360deg)}}</style>' +
        '<div style="width:28px;height:28px;border:3px solid rgba(127,142,163,.25);border-top-color:#4D698E;' +
        'border-radius:50%;animation:zhuge-spin .8s linear infinite"></div>' +
        '<div style="font-size:14px;color:var(--muted,#7a8699)">正在打开…</div>';
      document.body.appendChild(div);
    } catch { /* 遮罩失败忽略（页面照常跳转） */ }
  };
  // 跨页整页加载：插入全屏"正在打开…"遮罩后【延迟一帧再跳转】。
  // 为什么延迟：iOS Safari（尤其 PWA 全屏）对"同一同步任务里 DOM 插入 + location.assign"
  // 会在绘制下一帧之前就冻结旧页面渲染 —— 遮罩 DOM 插入了但【从未被绘制】，
  // 用户看不到"正在打开…"，只看到旧页面"留在原地"数秒后突然跳走（日志里
  // overlayInDom:true 但视觉无遮罩，正是这个机制）。双 rAF 让浏览器先绘制
  // 一帧（遮罩可见）再发起整页导航，遮罩在整个加载期间都显示。
  const navWithOverlay = (dest: string) => {
    showNavOverlay();
    // 双 rAF：第一次回调在绘制前注册第二次，绘制完成后第二次回调才执行 assign
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.location.assign(dest);
      });
    });
  };

  const markReadAndGo = (n: NotificationItem) => {
    if (navLockRef.current) return;
    navLockRef.current = true;
    // 标记已读：整页跳转会中断普通 fetch（未读状态丢失），用 sendBeacon 可靠发出、
    // 不阻塞跳转；失败静默（未读数由后台刷新/下次查询收敛）
    try {
      navigator.sendBeacon(
        '/api/me/notifications/read',
        new Blob([JSON.stringify({ id: n.id })], { type: 'application/json' })
      );
    } catch {
      void api('/me/notifications/read', { method: 'POST', body: { id: n.id } }).catch(() => {});
    }
    globalMutate('/me/notifications'); // 列表 + 未读徽标（同一 SWR key）
    globalMutate('/me');
    if (n.url) {
      // 主题类通知（接戏/滴滴）→ 整页 SSR / 同页定位；管理类（举报/标签申请）→ SPA 直接跳
      if (n.url.startsWith('/d/')) {
        const targetPath = n.url.split('?')[0];
        const alreadyHere = window.location.pathname === targetPath;
        if (alreadyHere) {
          // 已在同一主题页：直接发 'zhuge:jump' 事件强制定位（TopicPage 监听，不经 URL）。
          // **不再 SPA navigate / 不再清 query**——清 query 的 navigate(replace) 是
          // history.replaceState，iOS Safari 会对其触发滚动恢复归零（scrollRestoration='manual'
          // 在 Safari 上不可靠），表现为"首帧位置正确、随后跳回顶部"。
          // zhuge:jump 不经 URL 变化，不触发 replaceState，定位零跳变。
          // replyNumber 仅接戏类（reply）通知携带：滴滴的 target_number 来自公开原帖楼层，
          // 与私密主题无关，传给私密主题页会发起错误的楼层定位。
          if (n.type === 'reply' && n.post_id) {
            window.dispatchEvent(
              new CustomEvent('zhuge:jump', {
                detail: {
                  replyPostId: n.post_id,
                  replyNumber: n.type === 'reply' ? n.target_number ?? undefined : undefined,
                  replyAuthor: n.actor || n.actor_name || undefined,
                },
              })
            );
          }
          // 非 reply（滴滴/私密定位等）：页面已在目标主题，无需动作
          // **但不能静默关闭**——滴滴通知点了后弹窗直接消失、无任何反馈，
          // 用户以为"点了没反应/没有正在打开"。给一条轻提示确认已在该主题。
          if (n.type !== 'reply') {
            notifications.show({ message: '已在该主题页', color: 'green', autoClose: 1500 });
          }
          onClose();
        } else {
          // 跨页面进入 → 整页走 SSR（首帧即含目标楼，无乐观帧、无预取等待）。
          // 追加楼层号：仅【接戏类（reply）】通知才按楼层定位——target_number 语义是"被回复的楼层"；
          // 滴滴通知跳转的是私密主题，target_number 来自被滴滴的【公开原帖】楼层，与私密主题无关，
          // 追加 replyNumber 会让主题页对私密主题发起错误的楼层定位（实测 url 变成 ?replyNumber=1）
          let dest = n.url;
          if (n.target_number && n.type === 'reply') {
            const u = new URL(n.url, window.location.origin);
            u.searchParams.set('replyNumber', String(n.target_number));
            dest = u.pathname + u.search;
          }
          // 点击即反馈：插入"正在打开…"遮罩，等绘制一帧后整页跳转（见 navWithOverlay 注释）
          navWithOverlay(dest);
        }
      } else {
        navigate(n.url);
        onClose();
      }
    } else if (n.discussion_id) {
      // 无 url 兜底：reply → 构造"回复目标"URL（公开主题内定位 + 自动接戏对方）整页 SSR；
      // 滴滴通知无 url 时直接跳私密主题（不构造 reply=——那是接戏语义，会错误触发自动引用）
      const isReply = n.type === 'reply';
      let dest = `/d/${n.discussion_id}`;
      if (isReply && n.post_id) {
        const qs = new URLSearchParams({ reply: String(n.post_id) });
        if (n.actor || n.actor_name) qs.set('replyAuthor', String(n.actor || n.actor_name));
        // 楼层号：SSR 按 replyNumber 内联目标楼所在页，首帧定位
        if (n.target_number) qs.set('replyNumber', String(n.target_number));
        dest = `/d/${n.discussion_id}?${qs.toString()}`;
      }
      navWithOverlay(dest);
    } else {
      onClose();
    }
  };
  // 全部已读（乐观更新：先本地标记全部已读 + 未读归零，请求后台进行；失败回滚）
  const [markingAll, setMarkingAll] = useState(false);
  const markAllRead = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    // 乐观：本地立即标记已读。base 兜底用弹窗当前 data——若点击瞬间 SWR 缓存刚好被
    // 某次刷新置空（current 无 data），(current?.data || []) 会变成空列表 → 短暂闪
    // "还没有通知"；用有内容的 base 保证乐观帧不空、等 revalidate 收敛。
    const optimistic = (current?: NotifListResult): NotifListResult => {
      const base =
        current && Array.isArray(current.data) && current.data.length > 0 ? current : data;
      return {
        data: (base?.data || []).map((n) => ({ ...n, is_read: 1 })),
        meta: { ...(base?.meta || {}), unread: 0 },
      };
    };
    try {
      await globalMutate('/me/notifications', optimistic, { revalidate: false, rollbackOnError: true });
    } catch {
      /* 乐观更新失败忽略 */
    }
    setMarkingAll(false); // 乐观已生效：按钮立即恢复（不等网络请求，避免"已已读还转圈"）
    void globalMutate('/me'); // 未读徽标（乐观后重拉确认）
    try {
      await api('/me/notifications/read', { method: 'POST', body: { all: true } });
      void globalMutate('/me/notifications');
      void globalMutate('/me');
    } catch {
      // 失败：回滚 + 重拉
      void globalMutate('/me/notifications');
      void globalMutate('/me');
    }
  };

  // "再弹一次"：调服务器重放该条通知的真实推送（NotifyDO 广播 + Web Push）。
  // 与原通知一致：**不弹应用内 toast**；有系统推送权限的设备会再收到系统通知（点击走
  // sw.js notificationclick 跳转对应主题）。服务器只重放推送，不重复插库、不改已读。
  const replayOnce = (n: NotificationItem) => {
    setReplayFb(n.id); // 点击感知：图标短暂变 ✓
    void api(`/me/notifications/${n.id}/replay`, { method: 'POST' })
      .catch(() => {})
      .finally(() => {
        window.setTimeout(() => setReplayFb((cur) => (cur === n.id ? null : cur)), 1200);
      });
  };

  return (
    <div style={{ position: 'relative' }}>
      <Stack gap="xs">
        {/* 「下一步」引导条（原首页横幅迁移至此）：首个未完成建议任务 / 全部完成 🎉；
            数据未就绪时渲染占位骨架（首帧不空顶） */}
        {nextData?.next ? (
          <div className="notif-next" role="note">
            <span className="notif-next-label">下一步</span>
            <span className="notif-next-text">{nextData.next}</span>
          </div>
        ) : nextLoading ? (
          <div className="notif-next" role="note">
            <span className="notif-next-label">下一步</span>
            <span className="notif-next-text">…</span>
          </div>
        ) : null}
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
                {/* 左侧图标列：图标 + 其下方「再弹一次」小按钮（不占正文行宽） */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 3,
                    flexShrink: 0,
                    minWidth: 34,
                  }}
                >
                  {n.actor_character_appearance ? (
                    // 全沉浸：皮上触发 → 显示皮头像
                    <img
                      src={n.actor_character_appearance}
                      alt=""
                      style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    />
                  ) : (
                    <span className="notif-icon">{notifIcon(n.type)}</span>
                  )}
                  {/* 再弹一次：真实服务器重放（插一条新通知并推送）。带边框+底色一眼可点；
                      点击反馈 = 短暂变绿实心 ✓ */}
                  <ActionIcon
                    variant="default"
                    aria-label={replayFb === n.id ? '已再弹一次' : '再弹一次'}
                    title="再弹一次"
                    onClick={(e) => {
                      e.stopPropagation();
                      replayOnce(n);
                    }}
                    style={{
                      width: 26,
                      height: 24,
                      borderRadius: 7,
                      minWidth: 0,
                      ...(replayFb === n.id
                        ? {
                            background: '#2f9e44',
                            borderColor: '#2f9e44',
                            color: '#fff',
                          }
                        : {}),
                    }}
                  >
                    {replayFb === n.id ? '✓' : '↻'}
                  </ActionIcon>
                </div>
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
            {hasMore ? (
              <div ref={sentinelRef} className="load-more">
                {loadingMore ? '加载中…' : '继续上滑加载更多'}
              </div>
            ) : list.length > 0 ? (
              <div className="load-more">没有更多了</div>
            ) : null}
          </Stack>
        )}
      </Stack>
    </div>
  );
}
