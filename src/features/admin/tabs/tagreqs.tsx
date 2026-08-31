// 管理后台 Tab：标签申请管理
import { useState } from 'react';
import { Badge, Button, Card, Group, Loader, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTagRequests, refreshListsAfterWrite } from '../../../api/hooks';
import { openPromptModal } from '../../../lib/promptModal';
import { type TagRequestRow, handleTagRequest } from '../adminApi';

export function TagRequestsTab() {
  // SWR 缓存：申请列表跨 tab 切换复用；处理后 mutate
  const { data: rows, mutate } = useTagRequests();
  const [busyId, setBusyId] = useState<number | null>(null);

  const act = async (r: TagRequestRow, action: 'approve' | 'reject') => {
    if (action === 'approve') {
      // 批准：可编辑标签名（预填申请名）+ 填标签描述
      const res = await openPromptModal({
        title: `批准标签「${r.name}」`,
        fields: [
          { key: 'name', label: '标签名（可修改）', initial: r.name, placeholder: '2-20 字' },
          { key: 'desc', label: '标签描述（可选）', type: 'textarea', placeholder: '一句话描述这个标签' },
        ],
        confirmText: '批准创建',
      });
      if (!res) return;
      const finalName = (res.name || '').trim();
      if (finalName.length < 2) {
        notifications.show({ message: '标签名至少 2 个字', color: 'red' });
        return;
      }
      setBusyId(r.id);
      try {
        await handleTagRequest(r.id, 'approve', (res.desc || '').trim(), finalName);
        notifications.show({ message: `已创建标签「${finalName}」`, color: 'green' });
        void mutate();
        void refreshListsAfterWrite(); // 首页标签栏 /tags 即时出现新标签，无需刷新网页
      } catch (e) {
        notifications.show({ message: e instanceof Error ? e.message : '操作失败', color: 'red' });
      } finally {
        setBusyId(null);
      }
      return;
    }
    // 驳回：填原因
    const res = await openPromptModal({
      title: `驳回标签「${r.name}」`,
      fields: [{ key: 'note', label: '驳回原因（可选）', type: 'textarea', placeholder: '告诉申请者为什么驳回' }],
      confirmText: '确认驳回',
      danger: true,
    });
    if (!res) return;
    setBusyId(r.id);
    try {
      await handleTagRequest(r.id, 'reject', (res.note || '').trim());
      notifications.show({ message: `已驳回「${r.name}」`, color: 'green' });
      void mutate();
    } catch (e) {
      notifications.show({ message: e instanceof Error ? e.message : '操作失败', color: 'red' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Stack gap="md">
      <Text fw={600}>用户申请的标签（批准后自动创建为 IP 标签）</Text>
      {rows === undefined ? (
        <Loader size="sm" />
      ) : rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          暂无待处理的标签申请
        </Text>
      ) : (
        <Stack gap={8}>
          {rows.map((r) => (
            <Card key={r.id} withBorder>
              <Group justify="space-between" wrap="nowrap">
                <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                  <Group gap={6} wrap="nowrap">
                    <Text size="sm" fw={600}>
                      {r.name}
                    </Text>
                    {r.status === 'pending' ? (
                      <Badge size="xs" color="orange">
                        待处理
                      </Badge>
                    ) : r.status === 'approved' ? (
                      <Badge size="xs" color="green">
                        已批准
                      </Badge>
                    ) : (
                      <Badge size="xs" color="gray">
                        已驳回
                      </Badge>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed">
                    @{r.requester} 申请于 {(r.created_at || '').slice(0, 10)}
                    {r.reason ? ` · 说明：${r.reason}` : ''}
                  </Text>
                  {r.admin_note ? (
                    <Text size="xs" c="dimmed">
                      {r.status === 'approved' ? '标签描述' : '驳回原因'}：{r.admin_note}
                    </Text>
                  ) : null}
                </Stack>
                {r.status === 'pending' ? (
                  <Group gap={6} wrap="nowrap">
                    <Button size="compact-sm" variant="default" loading={busyId === r.id} onClick={() => act(r, 'approve')}>
                      批准
                    </Button>
                    <Button size="compact-sm" variant="subtle" color="red" loading={busyId === r.id} onClick={() => act(r, 'reject')}>
                      驳回
                    </Button>
                  </Group>
                ) : null}
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
