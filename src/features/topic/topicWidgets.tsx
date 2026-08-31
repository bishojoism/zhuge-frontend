// ===== 主题详情页小部件：私密主题滴滴响应条 =====
import { useState } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api } from '../../api/client';

// 私密主题的滴滴响应条：未响应时显示「接受滴滴 / 婉拒」，已响应显示状态徽标
export function DidiResponseBar({ status, discussionId, onChanged }: { status: 'accepted' | 'declined' | null; discussionId: number; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  if (status) {
    return (
      <Group mb="sm" gap={8}>
        <span className={`didi-badge ${status === 'accepted' ? 'didi-ok' : 'didi-no'}`}>
          {status === 'accepted' ? '已接受滴滴' : '已婉拒滴滴'}
        </span>
        <Text size="xs" c="dimmed">
          对方已收到你的回应
        </Text>
      </Group>
    );
  }
  const respond = async (s: 'accepted' | 'declined') => {
    setBusy(true);
    try {
      await api(`/discussions/${discussionId}/didi-response`, { method: 'POST', body: { status: s } });
      onChanged();
    } catch (e) {
      notifications.show({ color: 'red', message: e instanceof Error ? e.message : '操作失败' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Group mb="sm" gap={8}>
      <Text size="sm" c="dimmed">
        对方滴滴了你：
      </Text>
      <Button size="compact-sm" color="green" onClick={() => respond('accepted')} loading={busy}>
        接受滴滴
      </Button>
      <Button size="compact-sm" variant="light" style={{ color: 'var(--st-danger)' }} onClick={() => respond('declined')} loading={busy}>
        婉拒
      </Button>
    </Group>
  );
}
