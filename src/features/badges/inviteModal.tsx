// ===== 邀请好友弹窗：头像菜单「邀请好友」入口 =====
// 展示专属邀请链接 + 复制按钮 + 邀请海报 + 已邀请人数/明细 + 邀请徽章规则
import { useEffect, useState } from 'react';
import { Button, Divider, Group, Loader, Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { api } from '../../api/client';
import { openModalOnce } from '../../lib/modals';
import type { MyBadgesResult } from '../../types';

interface InvitedUser {
  id: number;
  username: string;
  created_at: string;
}

export function openInviteModal(userId: number, username: string): void {
  openModalOnce('invite', (m) => {
    m.open({
      modalId: 'invite',
      title: '邀请好友',
      centered: true,
      size: 'sm',
      children: <InviteContent userId={userId} username={username} />,
    });
  });
}

function InviteContent({ userId, username }: { userId: number; username: string }) {
  const [inviteCount, setInviteCount] = useState<number | null>(null);
  const [invited, setInvited] = useState<InvitedUser[] | null>(null);

  useEffect(() => {
    api<{ data: MyBadgesResult }>('/me/badges')
      .then((r) => setInviteCount(r.data.inviteCount))
      .catch(() => setInviteCount(0));
    api<{ data: InvitedUser[] }>('/me/invites')
      .then((r) => setInvited(r.data))
      .catch(() => setInvited([]));
  }, []);

  const inviteLink = `${window.location.origin}/?invite=${userId}`;

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      notifications.show({ message: '邀请链接已复制', color: 'green' });
    } catch {
      notifications.show({ message: '复制失败，请手动复制', color: 'red' });
    }
  };

  const openPoster = () => {
    modals.closeAll();
    import('./posterModal').then((m) => m.openInvitePosterModal(userId, username));
  };

  // 群宣文案：一键复制粘贴到 QQ 语C群 / 贴吧 / 朋友圈
  const qunCopy = () => {
    const text = `【语C】文字角色扮演平台《主格》来啦！
━━━━━━━━━━━━
✨ 开戏 · 接戏 · 滴滴私密对戏
💌 一键「滴滴」创建仅你俩可见的私密主题
🎭 建角色卡，以角色身份演绎，戏感拉满
🏅 成就徽章 + 邀请好友得进阶徽章
━━━━━━━━━━━━
三步上手：① 创建角色卡 ② 开戏/接戏 ③ 滴滴私密对戏
点链接免费注册：${inviteLink}
我在《主格》等你来对戏～`;
    navigator.clipboard
      .writeText(text)
      .then(() => notifications.show({ message: '群宣文案已复制，去粘贴吧', color: 'green' }))
      .catch(() => notifications.show({ message: '复制失败，请手动复制', color: 'red' }));
  };

  return (
    <Stack gap="md" py="xs">
      <Text size="sm" c="dimmed">
        把链接或海报发给朋友，TA 注册《主格》后，你们双方都能获得成就徽章。
      </Text>
      <Stack gap={6} style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: '10px 12px' }}>
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" fw={600}>
            🤝 我的邀请链接
          </Text>
          {inviteCount === null ? (
            <Loader size={14} />
          ) : (
            <Text size="xs" c="dimmed">
              已邀请 {inviteCount} 位
            </Text>
          )}
        </Group>
        <Group gap={8} wrap="nowrap">
          <Text
            size="xs"
            c="dimmed"
            style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}
          >
            {inviteLink}
          </Text>
          <Button size="compact-sm" variant="default" onClick={copyInvite}>
            复制
          </Button>
        </Group>
        <Group gap={8} wrap="nowrap">
          <Button size="compact-sm" variant="default" leftSection={<span>📢</span>} onClick={qunCopy}>
            复制群宣文案
          </Button>
          <Button size="compact-sm" variant="subtle" leftSection={<span>🖼</span>} onClick={openPoster}>
            邀请海报
          </Button>
        </Group>
      </Stack>

      {/* 邀请明细：谁通过我的链接注册了 */}
      <Divider label="我的邀请" labelPosition="left" />
      {invited === null ? (
        <Loader size={14} />
      ) : invited.length === 0 ? (
        <Text size="xs" c="dimmed">
          还没有好友通过你的链接注册。把链接发到语C群试试？
        </Text>
      ) : (
        <Stack gap={4}>
          {invited.map((u) => (
            <Group key={u.id} justify="space-between" wrap="nowrap">
              <Text size="sm">{u.username}</Text>
              <Text size="xs" c="dimmed">
                {(u.created_at || '').slice(0, 10)}
              </Text>
            </Group>
          ))}
        </Stack>
      )}

      <Text size="xs" c="dimmed">
        邀请 1 位得「🤝 以文会友」，满 3 位得「⭐ 门庭若市」进阶徽章。更多成就见「我的徽章」。
      </Text>
    </Stack>
  );
}
