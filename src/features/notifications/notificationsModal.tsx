// ===== 通知弹窗：SWR 缓存列表（WS 实时刷新）+ 点击标已读跳转 + 全部已读 =====
// 弹窗由 Layout 用 Mantine <Modal opened> 控制（单例，避免 @mantine/modals 全局栈叠加问题）
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Group, Loader, Stack, Text } from '@mantine/core';
import { mutate } from 'swr';
import { api } from '../../api/client';
import { useNotifications, useMe } from '../../api/hooks';
import { requireLogin } from '../auth/authModals';
import { timeAgo } from '../../lib/utils';
import type { NotificationItem, NotifType } from '../../types';

// 通知图标：didi → 📨；report/report_result → ⚑；其余（reply）→ 💬
function notifIcon(type: NotifType): string {
  if (type === 'didi') return '📨';
  if (type === 'report' || type === 'report_result') return '⚑';
  return '💬';
}

// 文案：优先 content；didi/reply 无 content 时按类型拼接
// 全沉浸：content 已含角色名（后端用角色名生成）；这里兜底用角色名/用户名
function notifText(n: NotificationItem): string {
  if (n.content) return n.content;
  const who = n.actor_character_name || n.actor_name || '有人';
  if (n.type === 'didi') return `${who} 滴滴了你`;
  if (n.type === 'reply') return `${who} 回复了你`;
  return '新通知';
}

export function NotificationsModalContent({ onClose }: { onClose: () => void }) {
  // 用 useMe()（SWR 全局缓存）读用户，避免弹窗 portal 里 AuthProvider context 不穿透导致误判未登录
  const { user } = useMe();
  const navigate = useNavigate();
  const { data, isLoading } = useNotifications();
  const list = data?.data ?? [];
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

  // 点击单条：立即显示"正在打开…"加载反馈（跳转前）→ 标记已读 → 刷新 → 跳转 → 关闭弹窗
  // 接戏/滴滴通知：带 state 让主题页自动引用对方（回复框自动 @对方）
  const [navigating, setNavigating] = useState(false);
  const markReadAndGo = async (n: NotificationItem) => {
    if (navigating) return; // 防重复点击
    setNavigating(true);
    try {
      await api('/me/notifications/read', { method: 'POST', body: { id: n.id } });
    } catch {
      // 静默失败，不打断跳转
    }
    mutate('/me/notifications'); // 列表 + 未读徽标（同一 SWR key）
    mutate('/me');
    if (n.url) {
      navigate(n.url);
    } else if (n.discussion_id) {
      const isReply = n.type === 'reply' || n.type === 'didi';
      if (isReply && n.post_id) {
        // 用 URL query 传回复目标（系统推送同款方式，TopicPage 读 ?reply=&replyAuthor=）：
        // React Router navigate state 在弹窗场景偶发丢失，query 方式可靠
        const qs = new URLSearchParams({ reply: String(n.post_id) });
        if (n.actor_name) qs.set('replyAuthor', n.actor_name);
        navigate(`/d/${n.discussion_id}?${qs.toString()}`);
      } else {
        navigate(`/d/${n.discussion_id}`);
      }
    }
    onClose();
  };

  // 全部已读（请求期间按钮显示加载中，防重复点击）
  const [markingAll, setMarkingAll] = useState(false);
  const markAllRead = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await api('/me/notifications/read', { method: 'POST', body: { all: true } });
    } catch {
      // 静默失败
    }
    mutate('/me/notifications');
    mutate('/me');
    setMarkingAll(false);
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
                  <div className="notif-time">
                    {n.actor_character_name ? `${n.actor_character_name} · ` : ''}
                    {timeAgo(n.created_at)}
                  </div>
                </div>
                {!n.is_read && <span className="notif-dot" />}
              </div>
            ))}
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
