// ===== 今日任务弹窗：每日可获得格币的任务列表（完成状态）+ 余额 / 等级 + 连续签到/补签 =====
import { useState } from 'react';
import { Button, Group, List, Loader, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { openModalOnce } from '../../lib/modals';
import { useCoins } from '../../api/hooks';
import { api } from '../../api/client';
import { levelLabel } from '../../lib/coins';

export function openTasksModal(): void {
  openModalOnce('tasks-info', (m) => {
    m.open({
      title: '今日任务',
      size: 400,
      children: <TasksContent />,
    });
  });
}

function TasksContent() {
  const { data, mutate } = useCoins();
  const [making, setMaking] = useState(false);
  const balance = data?.balance ?? 0;
  const level = data?.level ?? 1;
  const tasks = data?.tasks ?? [];
  const doneCount = tasks.filter((t) => t.done).length;
  const streak = data?.streak;
  const canMakeup = !!streak?.canMakeup;

  const doMakeup = async () => {
    if (making) return;
    setMaking(true);
    try {
      await api('/me/checkin/makeup', { method: 'POST' });
      notifications.show({ message: `补签成功，连签已续上（-${streak?.makeupCost ?? 2} 格币）`, color: 'green' });
      await mutate();
    } catch (e) {
      notifications.show({ message: e instanceof Error ? e.message : '补签失败', color: 'red' });
    } finally {
      setMaking(false);
    }
  };

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm">
          余额：<Text component="span" fw={700} style={{ color: 'var(--primary)' }}>{balance}</Text> 格币
        </Text>
        <Text size="sm">
          等级：<Text component="span" fw={700}>{levelLabel(level)}</Text>
        </Text>
      </Group>

      {/* 连续签到 / 补签 */}
      <Group justify="space-between" wrap="nowrap" style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: '8px 12px' }}>
        <Text size="sm">
          🔥 连续签到 <Text component="span" fw={700} style={{ color: 'var(--st-ok)' }}>{streak?.days ?? 0}</Text> 天
          {streak?.best ? (
            <Text component="span" size="xs" c="dimmed">
              {' '}· 最高 {streak.best} 天
            </Text>
          ) : null}
        </Text>
        {streak === undefined ? (
          <Loader size={14} />
        ) : canMakeup ? (
          <Button size="compact-xs" variant="light" color="clay" onClick={doMakeup} loading={making}>
            补签（{streak?.makeupCost ?? 2} 币）
          </Button>
        ) : streak.claimedToday ? (
          <Text size="xs" c="dimmed">
            今日已签 ✓
          </Text>
        ) : (
          <Text size="xs" c="dimmed">
            今日未签（打开即领）
          </Text>
        )}
      </Group>

      <Text size="xs" c="dimmed">
        今日任务 {doneCount}/{tasks.length} 已完成（每日 0 点重置；收到投币/打赏也能获得格币）
      </Text>
      {tasks.map((t) => (
        <Group key={t.key} justify="space-between" wrap="nowrap" gap={8}>
          <Text size="sm" style={{ opacity: t.done ? 0.55 : 1 }}>
            {t.done ? '✅' : '⬜'} {t.label} <Text component="span" fw={600}>+{t.amount}</Text>
          </Text>
          <Text size="xs" c={t.done ? 'dimmed' : 'green'}>
            {t.done ? '已完成' : '待完成'}
          </Text>
        </Group>
      ))}
      <List size="xs" spacing={2} c="dimmed">
        <List.Item>投币固定 1 币/次；打赏可自定义（1-10000），均收 10% 税，作者实得 90%。</List.Item>
        <List.Item>等级按累计获得币计算（不消耗余额），Lv.2 起在作者名旁显示等级徽章。</List.Item>
        <List.Item>连续签到：每天打开自动 +1 天；断签恰好一天时可花 2 格币补签续上。</List.Item>
      </List>
    </Stack>
  );
}
