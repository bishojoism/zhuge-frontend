// 管理后台 Tab：举报列表
import { Badge, Button, Card, Group, Loader, Stack, Table, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { openModalOnce } from '../../../lib/modals';
import { timeAgo } from '../../../lib/utils';
import { type AdminReportRow } from '../adminApi';
import { ReportActionModal } from '../ReportActionModal';

const STATUS_LABEL: Record<string, string> = { pending: '待处理', rejected: '已驳回', resolved: '已处理' };
const STATUS_COLOR: Record<string, string> = { pending: 'orange', rejected: 'gray', resolved: 'green' };

export function ReportsTab({
  rows,
  loading,
  onView,
}: {
  rows: AdminReportRow[];
  loading: boolean;
  onView: (discussionId: number) => void;
}) {
  const openHandle = (r: AdminReportRow) => {
    openModalOnce('admin-report-' + r.id, (m) => {
      m.open({
        title: `处理举报 #${r.id}`,
        size: 'lg',
        children: <ReportActionModal report={r} onClose={() => modals.closeAll()} />,
      });
    });
  };

  if (loading && rows.length === 0) {
    return (
      <Card withBorder>
        <Stack align="center" py="xl">
          <Loader size="sm" />
        </Stack>
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card withBorder>
        <Text size="sm" c="dimmed" ta="center" py="xl">
          暂无举报
        </Text>
      </Card>
    );
  }

  return (
    <Card withBorder>
      <Table.ScrollContainer minWidth={640}>
        <Table striped highlightOnHover verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>被举报内容</Table.Th>
              <Table.Th>理由</Table.Th>
              <Table.Th>举报人</Table.Th>
              <Table.Th>状态</Table.Th>
              <Table.Th>时间</Table.Th>
              <Table.Th>操作</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>
                  <Text size="sm">
                    {r.target_type === 'discussion' ? '主题' : '帖子'} #{r.target_id}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {r.target_user ? `被举报者：${r.target_user}` : ''}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" style={{ maxWidth: 220, wordBreak: 'break-all' }}>
                    {r.reason}
                  </Text>
                  {r.admin_note ? (
                    <Text size="xs" c="dimmed">
                      处理原因：{r.admin_note}
                    </Text>
                  ) : null}
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{r.reporter}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={STATUS_COLOR[r.status] || 'gray'} variant="light">
                    {STATUS_LABEL[r.status] || r.status}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {timeAgo(r.created_at)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    {r.discussion_id ? (
                      <Button size="compact-xs" variant="default" onClick={() => onView(r.discussion_id!)}>
                        查看内容
                      </Button>
                    ) : null}
                    {r.status === 'pending' && (
                      <Button size="compact-xs" onClick={() => openHandle(r)}>
                        处理
                      </Button>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}
