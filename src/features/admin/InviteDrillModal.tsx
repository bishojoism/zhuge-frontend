// ===== 管理员：邀请穿透弹窗 =====
// 查看某用户作为邀请人拉来的注册者：邀请数 / 活跃 / 明细 / IP 去重 / 与邀请人同 IP 标记
// GET /api/admin/users/:id/invites
import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Group, Loader, Stack, Table, Text } from '@mantine/core';
import { api } from '../../api/client';
import { timeAgo } from '../../lib/utils';
import type { AdminUserRow } from './adminApi';

interface InviteeRow {
  id: number;
  username: string;
  created_at: string;
  post_count: number;
  last_ip: string | null;
  sameIpAsInviter: boolean;
}

interface InviteDrillData {
  inviter: { id: number; username: string };
  total: number;
  active: number;
  distinctIps: number;
  invitees: InviteeRow[];
}

// 模块级 30s 缓存：重复打开同一用户的邀请穿透秒开（数据变化不敏感，短 TTL 足够）
const drillCache = new Map<number, { exp: number; data: InviteDrillData }>();

export function InviteDrillModal({ user, onClose }: { user: AdminUserRow; onClose: () => void }) {
  const [data, setData] = useState<InviteDrillData | null>(() => {
    const hit = drillCache.get(user.id);
    return hit && hit.exp > Date.now() ? hit.data : null;
  });
  const [error, setError] = useState(false);

  useEffect(() => {
    const hit = drillCache.get(user.id);
    if (hit && hit.exp > Date.now()) {
      setData(hit.data);
      return;
    }
    api<{ data: InviteDrillData }>(`/admin/users/${user.id}/invites`)
      .then((r) => {
        drillCache.set(user.id, { exp: Date.now() + 30_000, data: r.data });
        setData(r.data);
      })
      .catch(() => setError(true));
  }, [user.id]);

  // 可疑度：多个被邀请人挤在极少数 IP，或有人与邀请人同 IP
  const suspicious =
    data &&
    ((data.total > 1 && data.distinctIps === 1) ||
      data.invitees.some((i) => i.sameIpAsInviter));

  if (error) {
    return (
      <Text size="sm" c="dimmed">
        加载失败
      </Text>
    );
  }
  if (!data) {
    return (
      <Stack align="center" py="lg">
        <Loader size="sm" />
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      <Group gap={8}>
        <Badge color="clay" variant="light">
          邀请 {data.total} 人
        </Badge>
        <Badge color={data.active > 0 ? 'teal' : 'gray'} variant="light">
          活跃 {data.active}
        </Badge>
        <Badge color={data.distinctIps > 0 ? 'blue' : 'gray'} variant="light">
          IP 去重 {data.distinctIps}
        </Badge>
      </Group>
      {data.total > 0 && (
        <Text size="xs" c="dimmed">
          {data.total} 个被邀请人共使用 {data.distinctIps} 个不同 IP；与邀请人（{data.inviter.username}）同 IP 者标 ⚠
        </Text>
      )}
      {suspicious ? (
        <Alert color="red" variant="light" title="疑似刷邀请" styles={{ root: { padding: 8 } }}>
          {data.invitees.some((i) => i.sameIpAsInviter)
            ? '存在与邀请人同 IP 的注册（自邀/同设备嫌疑）。'
            : ''}
          {data.total > 1 && data.distinctIps === 1 ? '所有被邀请人都挤在同一个 IP。' : ''}
        </Alert>
      ) : null}
      {data.invitees.length === 0 ? (
        <Text size="sm" c="dimmed">
          还没有人通过 {data.inviter.username} 的邀请链接注册。
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={420}>
          <Table striped highlightOnHover verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>被邀请人</Table.Th>
                <Table.Th>注册时间</Table.Th>
                <Table.Th>帖子</Table.Th>
                <Table.Th>最近 IP</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.invitees.map((i) => (
                <Table.Tr key={i.id}>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Text size="sm" fw={500}>
                        {i.username}
                      </Text>
                      {i.sameIpAsInviter ? (
                        <Badge color="red" variant="light" size="xs">
                          ⚠ 同邀请人 IP
                        </Badge>
                      ) : null}
                      {i.post_count > 0 ? (
                        <Badge color="teal" variant="light" size="xs">
                          活跃
                        </Badge>
                      ) : null}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {timeAgo(i.created_at)}
                    </Text>
                  </Table.Td>
                  <Table.Td>{i.post_count ?? 0}</Table.Td>
                  <Table.Td>
                    <Text size="sm" style={{ wordBreak: 'break-all' }}>
                      {i.last_ip || '—'}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Button size="compact-sm" variant="default" onClick={onClose} style={{ alignSelf: 'flex-end' }}>
        关闭
      </Button>
    </Stack>
  );
}
