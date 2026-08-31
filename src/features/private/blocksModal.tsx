// ===== 屏蔽管理弹窗（头像菜单 → 屏蔽管理）：查看自己屏蔽的用户，可取消屏蔽 =====
import { useEffect, useState } from 'react';
import { ActionIcon, Box, Button, Group, Loader, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api } from '../../api/client';
import { openModalOnce } from '../../lib/modals';
import { refreshListsAfterWrite } from '../../api/hooks';
import { openAuthorDidiStats } from './authorDidiStats';
import { IconUserCheck, IconUserOff } from '@tabler/icons-react';

interface BlockedUser {
  blocked_id: number;
  username: string;
}

export function openBlocksModal(): void {
  openModalOnce('blocks-manage', (m) => {
    m.open({
      title: '屏蔽管理',
      size: 420,
      children: <BlocksManagerContent onClose={() => m.closeAll()} />,
    });
  });
}

function BlocksManagerContent({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<BlockedUser[] | null>(null);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    api<{ data: BlockedUser[] }>('/me/blocks')
      .then((r) => setList(r.data))
      .catch(() => setError(true));
  }, []);

  // 取消屏蔽：本地移除 + 全局列表刷新（对方主题/帖子/通知恢复显示）
  const unblock = async (u: BlockedUser) => {
    setBusyId(u.blocked_id);
    try {
      await api(`/me/blocks/${u.blocked_id}`, { method: 'DELETE' });
      setList((prev) => (prev ? prev.filter((x) => x.blocked_id !== u.blocked_id) : prev));
      notifications.show({ message: `已取消屏蔽 ${u.username}，其内容恢复显示` });
      void refreshListsAfterWrite();
    } catch (e) {
      notifications.show({ message: e instanceof Error ? e.message : '操作失败', color: 'red' });
    } finally {
      setBusyId(null);
    }
  };

  if (error) {
    return (
      <Text size="sm" c="dimmed">
        加载失败
      </Text>
    );
  }
  if (!list) {
    return (
      <Stack align="center" py="lg">
        <Loader size="sm" />
      </Stack>
    );
  }
  if (list.length === 0) {
    return (
      <Stack align="center" gap={4} py="lg">
        <IconUserOff size={28} style={{ opacity: 0.4 }} />
        <Text size="sm" c="dimmed">
          你还没有屏蔽任何用户
        </Text>
        <Text size="xs" c="dimmed">
          在用户名片中点击「屏蔽该用户」后，对方的主题、帖子、通知将不再显示。
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap={6}>
      <Text size="xs" c="dimmed">
        共 {list.length} 人。点击用户名可查看对方名片；取消屏蔽后其内容恢复显示。
      </Text>
      {list.map((u) => (
        <Group key={u.blocked_id} gap="sm" wrap="nowrap" justify="space-between" w="100%">
          <Group
            gap="sm"
            wrap="nowrap"
            style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
            onClick={() => {
              // 先关当前弹窗再开名片（openModalOnce 自带关闭动画等待 + 互斥），避免叠加
              onClose();
              openAuthorDidiStats(u.blocked_id, u.username);
            }}
          >
            <Box
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: '#8b9cb0',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: 14,
                flexShrink: 0,
              }}
            >
              {(u.username[0] || '?').toUpperCase()}
            </Box>
            <Text size="sm" fw={500} truncate>
              {u.username}
            </Text>
          </Group>
          <Button
            size="xs"
            variant="light"
            color="gray"
            leftSection={<IconUserCheck size={14} />}
            loading={busyId === u.blocked_id}
            onClick={() => void unblock(u)}
          >
            取消屏蔽
          </Button>
        </Group>
      ))}
    </Stack>
  );
}
