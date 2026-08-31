// 管理后台 Tab：概览统计 + 宣传/置顶管理
import { useState } from 'react';
import { Badge, Button, Card, Group, Loader, Stack, Table, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  useAdminOverview,
  useStickyDiscussions,
  refreshListsAfterWrite,
} from '../../../api/hooks';
import { timeAgo } from '../../../lib/utils';
import {
  type AdminReportRow,
  type AdminUserRow,
  type IpStatRow,
  setDiscussionSticky,
} from '../adminApi';

// 统计小卡片
export function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card withBorder>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={700} size="xl">
        {value}
      </Text>
    </Card>
  );
}

// ============ 概览统计 ============
export function OverviewTab({
  ipStats,
  userRows,
  reportRows,
}: {
  ipStats: IpStatRow[];
  userRows: AdminUserRow[];
  reportRows: AdminReportRow[];
}) {
  const totalVisits = ipStats.reduce((s, r) => s + (Number(r.visits) || 0), 0);
  const bannedUsers = userRows.filter((u) => u.is_banned).length;
  const admins = userRows.filter((u) => u.is_admin).length;
  const pendingReports = reportRows.filter((r) => r.status === 'pending').length;
  // 后端管理接口未提供主题总数；帖子总数由用户列表的 post_count 求和得到
  const totalPosts = userRows.reduce((s, u) => s + (Number(u.post_count) || 0), 0);

  return (
    <Stack gap="md">
      <Group grow>
        <StatCard label="用户总数" value={userRows.length} />
        <StatCard label="帖子总数" value={totalPosts} />
        <StatCard label="封禁用户" value={bannedUsers} />
        <StatCard label="待处理举报" value={pendingReports} />
      </Group>
      <Group grow>
        <StatCard label="独立 IP 数" value={ipStats.length} />
        <StatCard label="IP 访问总次数" value={totalVisits} />
      </Group>
      <Card withBorder>
        <Text fw={600} mb="sm">
          IP 访问统计 TOP
        </Text>
        {ipStats.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="lg">
            暂无访问记录
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={520}>
            <Table striped highlightOnHover verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>IP</Table.Th>
                  <Table.Th>访问次数</Table.Th>
                  <Table.Th>关联用户数</Table.Th>
                  <Table.Th>最近访问</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {ipStats.slice(0, 50).map((r) => (
                  <Table.Tr key={r.ip}>
                    <Table.Td>
                      <Text size="sm" style={{ wordBreak: 'break-all' }}>
                        {r.ip}
                      </Text>
                    </Table.Td>
                    <Table.Td>{r.visits} 次</Table.Td>
                    <Table.Td>{Number(r.users) || 0}</Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {timeAgo(r.last_seen)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
    </Stack>
  );
}

// ============ 宣传 / 置顶管理 ============
export function PromoTab() {
  // SWR 缓存：宣传数据 / 置顶列表跨 tab 切换复用
  const { data: stats, mutate: mutateStats } = useAdminOverview();
  const { data: stickyList, mutate: mutateSticky } = useStickyDiscussions();
  const [topicId, setTopicId] = useState('');
  const [busy, setBusy] = useState(false);

  const doSticky = async (id: number, sticky: boolean) => {
    setBusy(true);
    try {
      await setDiscussionSticky(id, sticky);
      notifications.show({ message: sticky ? `已置顶主题 #${id}` : `已取消置顶 #${id}`, color: 'green' });
      void mutateSticky();
      void mutateStats();
      void refreshListsAfterWrite(); // 首页列表置顶/取消即时生效，无需刷新网页
    } catch (e) {
      notifications.show({ message: e instanceof Error ? e.message : '操作失败', color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="md">
      {/* 宣传数据看板 */}
      <Text fw={600}>宣传数据</Text>
      <Group grow>
        <StatCard label="用户总数" value={stats?.users ?? '…'} />
        <StatCard label="7 天新增" value={stats?.newUsers7d ?? '…'} />
        <StatCard label="主题总数" value={stats?.discussions ?? '…'} />
        <StatCard label="帖子总数" value={stats?.posts ?? '…'} />
      </Group>
      <Group grow>
        <StatCard label="滴滴总数" value={stats?.didis ?? '…'} />
        <StatCard label="邀请注册" value={stats?.invited ?? '…'} />
        <StatCard label="置顶主题" value={stats?.stickyCount ?? '…'} />
      </Group>

      {/* 置顶管理（站长推荐位） */}
      <Card withBorder>
        <Text fw={600} mb="sm">
          主题置顶（推荐位：置顶主题固定显示在 feed 最前）
        </Text>
        <Group gap="sm" wrap="nowrap" mb="md">
          <TextInput
            placeholder="输入主题 ID"
            value={topicId}
            onChange={(e) => setTopicId(e.currentTarget.value.replace(/\D/g, ''))}
            style={{ width: 140 }}
            autoComplete="off"
          />
          <Button size="compact-sm" variant="default" loading={busy} onClick={() => topicId && doSticky(Number(topicId), true)}>
            置顶
          </Button>
          <Button size="compact-sm" variant="subtle" loading={busy} onClick={() => topicId && doSticky(Number(topicId), false)}>
            取消置顶
          </Button>
        </Group>
        {stickyList === undefined ? (
          <Loader size="sm" />
        ) : stickyList.length === 0 ? (
          <Text size="sm" c="dimmed">
            暂无置顶主题
          </Text>
        ) : (
          <Stack gap={6}>
            {stickyList.map((d) => (
              <Group key={d.id} justify="space-between" wrap="nowrap">
                <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                  <Badge size="xs" variant="light">
                    #{d.id}
                  </Badge>
                  <Text size="sm" truncate style={{ flex: 1 }}>
                    {d.title}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {d.author} · {d.comment_count} 接戏
                  </Text>
                </Group>
                <Button size="compact-xs" variant="subtle" color="red" loading={busy} onClick={() => doSticky(d.id, false)}>
                  取消置顶
                </Button>
              </Group>
            ))}
          </Stack>
        )}
      </Card>
    </Stack>
  );
}
