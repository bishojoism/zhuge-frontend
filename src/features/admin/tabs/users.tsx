// 管理后台 Tab：用户列表 + IP 日志
import { useMemo, useState } from 'react';
import { Badge, Button, Card, Group, Loader, Stack, Table, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { openModalOnce } from '../../../lib/modals';
import { timeAgo } from '../../../lib/utils';
import { type AdminIpLogRow, type AdminUserRow } from '../adminApi';
import { UserActionModal } from '../UserActionModal';
import { BanIpModal } from '../BanIpModal';

// ============ 用户列表 ============
export function UsersTab({ rows, loading, meId }: { rows: AdminUserRow[]; loading: boolean; meId: number }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter((u) => u.username.toLowerCase().includes(kw));
  }, [rows, q]);

  const openManage = (u: AdminUserRow) => {
    openModalOnce('admin-user-' + u.id, (m) => {
      m.open({
        title: `管理用户：${u.username}`,
        children: <UserActionModal user={u} onClose={() => modals.closeAll()} />,
      });
    });
  };

  return (
    <Card withBorder>
      <Stack gap="sm">
        <TextInput
          placeholder="按用户名搜索…"
          autoComplete="new-password"
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          leftSection={<span style={{ fontSize: 13, opacity: 0.6 }}>🔍</span>}
          style={{ maxWidth: 320 }}
        />
        {loading && rows.length === 0 ? (
          <Stack align="center" py="xl">
            <Loader size="sm" />
          </Stack>
        ) : filtered.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="xl">
            {rows.length === 0 ? '暂无用户' : '无匹配用户'}
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={640}>
            <Table striped highlightOnHover verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>用户名</Table.Th>
                  <Table.Th>注册时间</Table.Th>
                  <Table.Th>帖子数</Table.Th>
                  <Table.Th>最近 IP</Table.Th>
                  <Table.Th>状态</Table.Th>
                  <Table.Th>操作</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtered.map((u) => (
                  <Table.Tr key={u.id}>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        <Text size="sm" fw={500}>
                          {u.username}
                        </Text>
                        {!!u.is_admin && (
                          <Badge color="clay" variant="light" size="xs">
                            管理员
                          </Badge>
                        )}
                        {!!u.is_banned && (
                          <Badge color="red" variant="light" size="xs">
                            已封号
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {timeAgo(u.created_at)}
                      </Text>
                    </Table.Td>
                    <Table.Td>{u.post_count ?? 0}</Table.Td>
                    <Table.Td>
                      <Text size="sm" style={{ wordBreak: 'break-all' }}>
                        {u.last_ip || '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {u.is_banned ? '已封禁' : '正常'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="compact-xs"
                        variant="default"
                        disabled={u.id === meId}
                        onClick={() => openManage(u)}
                      >
                        {u.id === meId ? '（自己）' : '操作'}
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Stack>
    </Card>
  );
}

// ============ IP 日志 ============
export function IpLogsTab({ rows, loading }: { rows: AdminIpLogRow[]; loading: boolean }) {
  const [f, setF] = useState({ ip: '', path: '', user: '' });
  const filtered = useMemo(() => {
    const ip = f.ip.trim().toLowerCase();
    const path = f.path.trim().toLowerCase();
    const user = f.user.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!ip || r.ip.toLowerCase().includes(ip)) &&
        (!path || r.path.toLowerCase().includes(path)) &&
        (!user || (r.user || '').toLowerCase().includes(user))
    );
  }, [rows, f]);

  const openBan = (ip: string) => {
    openModalOnce('admin-ban-' + ip, (m) => {
      m.open({
        title: '封禁 IP',
        children: <BanIpModal ip={ip} onClose={() => modals.closeAll()} />,
      });
    });
  };

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Group gap="sm" wrap="wrap" className="admin-filters">
          <TextInput placeholder="按 IP…" autoComplete="new-password" value={f.ip} onChange={(e) => setF({ ...f, ip: e.currentTarget.value })} />
          <TextInput placeholder="按接口…" autoComplete="new-password" value={f.path} onChange={(e) => setF({ ...f, path: e.currentTarget.value })} />
          <TextInput placeholder="按用户…" autoComplete="new-password" value={f.user} onChange={(e) => setF({ ...f, user: e.currentTarget.value })} />
        </Group>
        {loading && rows.length === 0 ? (
          <Stack align="center" py="xl">
            <Loader size="sm" />
          </Stack>
        ) : filtered.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="xl">
            {rows.length === 0 ? '暂无访问记录' : '无匹配记录'}
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={720}>
            <Table striped highlightOnHover verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>IP</Table.Th>
                  <Table.Th>用户</Table.Th>
                  <Table.Th>路径</Table.Th>
                  <Table.Th>UA</Table.Th>
                  <Table.Th>时间</Table.Th>
                  <Table.Th>操作</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtered.map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td>
                      <Text size="sm" style={{ wordBreak: 'break-all' }}>
                        {r.ip}
                      </Text>
                    </Table.Td>
                    <Table.Td>{r.user ? <Badge color="slate" variant="light">{r.user}</Badge> : <Text size="sm" c="dimmed">—</Text>}</Table.Td>
                    <Table.Td>
                      <Text size="sm" style={{ maxWidth: 200, wordBreak: 'break-all' }}>
                        {r.path}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed" truncate style={{ maxWidth: 180 }}>
                        {r.ua || '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                        {timeAgo(r.created_at)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Button size="compact-xs" color="red" variant="light" onClick={() => openBan(r.ip)}>
                        封IP
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Stack>
    </Card>
  );
}
