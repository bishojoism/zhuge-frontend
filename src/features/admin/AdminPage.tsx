// ===== 管理后台（仅管理员）：概览统计 / 举报 / 用户 / IP 日志 =====
// 数据来自后端 /api/admin/*（useAdminStats/useAdminReports/useAdminUsers/useIpLogs）。
// 后端返回字段与本仓库 types.ts 基础类型略有出入，此处按后端实际返回做运行时适配。
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { mutate } from 'swr';
import { useAuth } from '../auth/AuthContext';
import { useAdminReports, useAdminStats, useAdminUsers, useIpLogs } from '../../api/hooks';
import { openModalOnce } from '../../lib/modals';
import { openPromptModal } from '../../lib/promptModal';
import { timeAgo } from '../../lib/utils';
import {
  type AdminIpLogRow,
  type AdminReportRow,
  type AdminUserRow,
  type IpStatRow,
  type OverviewStats,
  type StickyDiscussion,
  type TagRequestRow,
  type AdminTagRow,
  getOverview,
  getStickyDiscussions,
  setDiscussionSticky,
  getTagRequests,
  handleTagRequest,
  getAdminTags,
  createAdminTag,
  updateAdminTag,
  deleteAdminTag,
} from './adminApi';
import { ReportActionModal } from './ReportActionModal';
import { UserActionModal } from './UserActionModal';
import { BanIpModal } from './BanIpModal';

const STATUS_LABEL: Record<string, string> = { pending: '待处理', rejected: '已驳回', resolved: '已处理' };
const STATUS_COLOR: Record<string, string> = { pending: 'orange', rejected: 'gray', resolved: 'green' };

export default function AdminPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  // 支持 ?tab= 指定初始页签（通知里的标签申请/举报跳转到这里）
  const [searchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const initialTab = ['overview', 'promo', 'tags', 'tagreqs', 'reports', 'users', 'iplogs'].includes(urlTab || '')
    ? (urlTab as string)
    : 'overview';

  // 权限守卫：非管理员 → 提示并跳回首页（同时渲染空态，避免闪现空白）
  useEffect(() => {
    if (!loading && (!user || !user.isAdmin)) {
      navigate('/', { replace: true });
    }
  }, [loading, user, navigate]);

  const stats = useAdminStats();
  const reports = useAdminReports();
  const users = useAdminUsers();
  const ipLogs = useIpLogs();

  // 后端实际返回：/admin/ip-logs/stats → { data: IpStatRow[] }；其余列表 → { data: Row[] }
  const ipStats = useMemo(
    () => (stats.data as unknown as { data?: IpStatRow[] } | undefined)?.data ?? [],
    [stats.data]
  );
  const reportRows = useMemo(
    () => (reports.data as unknown as AdminReportRow[] | undefined) ?? [],
    [reports.data]
  );
  const userRows = useMemo(
    () => (users.data as unknown as AdminUserRow[] | undefined) ?? [],
    [users.data]
  );
  const logRows = useMemo(
    () => (ipLogs.data as unknown as AdminIpLogRow[] | undefined) ?? [],
    [ipLogs.data]
  );

  if (loading) {
    return (
      <Stack align="center" py={80}>
        <Loader />
      </Stack>
    );
  }
  if (!user || !user.isAdmin) {
    return <div className="empty">仅管理员可访问</div>;
  }

  return (
    <Stack gap="md" pt="md">
      <Group justify="space-between">
        <Button variant="subtle" onClick={() => navigate('/')}>
          ← 返回
        </Button>
        <Text fw={600} size="lg">
          管理后台
        </Text>
        <div style={{ width: 72 }} />
      </Group>

      <Tabs defaultValue={initialTab} key={initialTab}>
        <Tabs.List grow>
          <Tabs.Tab value="overview">概览统计</Tabs.Tab>
          <Tabs.Tab value="promo">宣传 / 置顶</Tabs.Tab>
          <Tabs.Tab value="tags">标签管理</Tabs.Tab>
          <Tabs.Tab value="tagreqs">标签申请</Tabs.Tab>
          <Tabs.Tab value="reports">举报</Tabs.Tab>
          <Tabs.Tab value="users">用户</Tabs.Tab>
          <Tabs.Tab value="iplogs">IP 日志</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview" pt="md">
          <OverviewTab ipStats={ipStats} userRows={userRows} reportRows={reportRows} />
        </Tabs.Panel>

        <Tabs.Panel value="promo" pt="md">
          <PromoTab />
        </Tabs.Panel>

        <Tabs.Panel value="tagreqs" pt="md">
          <TagRequestsTab />
        </Tabs.Panel>

        <Tabs.Panel value="tags" pt="md">
          <TagsTab />
        </Tabs.Panel>

        <Tabs.Panel value="reports" pt="md">
          <ReportsTab rows={reportRows} loading={reports.isLoading} onView={(id) => navigate('/d/' + id)} />
        </Tabs.Panel>

        <Tabs.Panel value="users" pt="md">
          <UsersTab rows={userRows} loading={users.isLoading} meId={user.id} />
        </Tabs.Panel>

        <Tabs.Panel value="iplogs" pt="md">
          <IpLogsTab rows={logRows} loading={ipLogs.isLoading} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

// ============ 概览统计 ============
function OverviewTab({
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

function StatCard({ label, value }: { label: string; value: number | string }) {
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

// ============ 宣传 / 置顶管理 ============
function PromoTab() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [stickyList, setStickyList] = useState<StickyDiscussion[] | null>(null);
  const [topicId, setTopicId] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = () => {
    getOverview().then((r) => setStats(r.data)).catch(() => {});
    getStickyDiscussions().then((r) => setStickyList(r.data)).catch(() => setStickyList([]));
  };
  useEffect(reload, []);

  const doSticky = async (id: number, sticky: boolean) => {
    setBusy(true);
    try {
      await setDiscussionSticky(id, sticky);
      notifications.show({ message: sticky ? `已置顶主题 #${id}` : `已取消置顶 #${id}`, color: 'green' });
      reload();
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
        {stickyList === null ? (
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

// ============ 标签申请管理 ============
function TagRequestsTab() {
  const [rows, setRows] = useState<TagRequestRow[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const reload = () => getTagRequests().then((r) => setRows(r.data)).catch(() => setRows([]));
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        reload();
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
      reload();
    } catch (e) {
      notifications.show({ message: e instanceof Error ? e.message : '操作失败', color: 'red' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Stack gap="md">
      <Text fw={600}>用户申请的标签（批准后自动创建为 IP 标签）</Text>
      {rows === null ? (
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

// ============ 标签管理 ============
function TagsTab() {
  const [rows, setRows] = useState<AdminTagRow[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [q, setQ] = useState('');

  const reload = () => getAdminTags().then((r) => setRows(r.data)).catch(() => setRows([]));
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const err = (e: unknown) => notifications.show({ message: e instanceof Error ? e.message : '操作失败', color: 'red' });

  // 搜索过滤：名称/描述包含关键词（大小写不敏感）
  const kw = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!rows) return null;
    if (!kw) return rows;
    return rows.filter((t) => t.name.toLowerCase().includes(kw) || (t.description || '').toLowerCase().includes(kw));
  }, [rows, kw]);

  const create = async () => {
    const res = await openPromptModal({
      title: '新建标签',
      fields: [
        { key: 'name', label: '标签名', placeholder: '2-20 字' },
        { key: 'type', label: '类型', type: 'select', options: ['IP 次标签', '主标签'] },
        { key: 'desc', label: '标签描述（可选）', type: 'textarea', placeholder: '一句话描述' },
      ],
      confirmText: '创建',
    });
    if (!res) return;
    const n = (res.name || '').trim();
    if (n.length < 2) {
      notifications.show({ message: '标签名至少 2 个字', color: 'red' });
      return;
    }
    setBusyId(-1);
    try {
      await createAdminTag({ name: n, description: (res.desc || '').trim(), primary: res.type === '主标签' });
      notifications.show({ message: `已创建标签「${n}」`, color: 'green' });
      reload();
    } catch (e) {
      err(e);
    } finally {
      setBusyId(null);
    }
  };

  const rename = async (t: AdminTagRow) => {
    const res = await openPromptModal({
      title: `改名「${t.name}」`,
      fields: [{ key: 'name', label: '新名称', initial: t.name, placeholder: '2-20 字' }],
      confirmText: '保存',
    });
    if (!res) return;
    setBusyId(t.id);
    try {
      await updateAdminTag(t.id, { name: (res.name || '').trim() });
      reload();
    } catch (e) {
      err(e);
    } finally {
      setBusyId(null);
    }
  };

  const toggleHide = async (t: AdminTagRow) => {
    setBusyId(t.id);
    try {
      await updateAdminTag(t.id, { is_hidden: !t.is_hidden });
      notifications.show({ message: t.is_hidden ? `已显示「${t.name}」` : `已隐藏「${t.name}」`, color: 'green' });
      reload();
    } catch (e) {
      err(e);
    } finally {
      setBusyId(null);
    }
  };

  const togglePrimary = async (t: AdminTagRow) => {
    setBusyId(t.id);
    try {
      await updateAdminTag(t.id, { primary: !(t.position != null) });
      notifications.show({ message: t.position != null ? `「${t.name}」已改回次标签` : `「${t.name}」已设为主标签`, color: 'green' });
      reload();
    } catch (e) {
      err(e);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (t: AdminTagRow) => {
    modals.openConfirmModal({
      title: '删除标签',
      centered: true,
      children: (
        <Text size="sm">
          确定删除「{t.name}」？该标签与主题的关联会被清除，不可恢复。
        </Text>
      ),
      labels: { confirm: '删除', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        setBusyId(t.id);
        try {
          await deleteAdminTag(t.id);
          notifications.show({ message: `已删除「${t.name}」`, color: 'green' });
          reload();
        } catch (e) {
          err(e);
        } finally {
          setBusyId(null);
        }
      },
    });
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={600}>标签管理（{rows ? rows.length : '…'} 个）</Text>
        <Button size="compact-sm" variant="default" loading={busyId === -1} onClick={create}>
          ＋ 新建标签
        </Button>
      </Group>
      <TextInput
        placeholder="搜索标签名 / 描述…"
        autoComplete="off"
        value={q}
        onChange={(e) => setQ(e.currentTarget.value)}
      />
      {rows === null ? (
        <Loader size="sm" />
      ) : filtered === null || filtered.length === 0 ? (
        <Text size="sm" c="dimmed">
          无匹配标签
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={620}>
          <Table striped highlightOnHover verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ID</Table.Th>
                <Table.Th>名称</Table.Th>
                <Table.Th>类型</Table.Th>
                <Table.Th>颜色</Table.Th>
                <Table.Th>主题数</Table.Th>
                <Table.Th>状态</Table.Th>
                <Table.Th>操作</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((t) => (
                <Table.Tr key={t.id}>
                  <Table.Td>{t.id}</Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {t.name}
                    </Text>
                    {t.description ? (
                      <Text size="xs" c="dimmed">
                        {t.description}
                      </Text>
                    ) : null}
                  </Table.Td>
                  <Table.Td>{t.position != null ? '主标签' : 'IP 标签'}</Table.Td>
                  <Table.Td>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        background: t.color || '#8b9cb0',
                        border: '1px solid rgba(0,0,0,.15)',
                      }}
                    />
                  </Table.Td>
                  <Table.Td>{t.discussion_count}</Table.Td>
                  <Table.Td>
                    {t.is_hidden ? (
                      <Badge size="xs" color="gray">
                        隐藏
                      </Badge>
                    ) : t.is_restricted ? (
                      <Badge size="xs" color="orange">
                        受限
                      </Badge>
                    ) : (
                      <Badge size="xs" color="green">
                        正常
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      <Button size="compact-xs" variant="subtle" loading={busyId === t.id} onClick={() => rename(t)}>
                        改名
                      </Button>
                      <Button size="compact-xs" variant="subtle" loading={busyId === t.id} onClick={() => togglePrimary(t)}>
                        {t.position != null ? '改次' : '设主'}
                      </Button>
                      <Button size="compact-xs" variant="subtle" loading={busyId === t.id} onClick={() => toggleHide(t)}>
                        {t.is_hidden ? '显示' : '隐藏'}
                      </Button>
                      {t.id !== 1 ? (
                        <Button size="compact-xs" variant="subtle" color="red" loading={busyId === t.id} onClick={() => remove(t)}>
                          删除
                        </Button>
                      ) : null}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
}

// ============ 举报列表 ============
function ReportsTab({
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

// ============ 用户列表 ============
function UsersTab({ rows, loading, meId }: { rows: AdminUserRow[]; loading: boolean; meId: number }) {
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
          autoComplete="off"
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
function IpLogsTab({ rows, loading }: { rows: AdminIpLogRow[]; loading: boolean }) {
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
          <TextInput placeholder="按 IP…" autoComplete="off" value={f.ip} onChange={(e) => setF({ ...f, ip: e.currentTarget.value })} />
          <TextInput placeholder="按接口…" autoComplete="off" value={f.path} onChange={(e) => setF({ ...f, path: e.currentTarget.value })} />
          <TextInput placeholder="按用户…" autoComplete="off" value={f.user} onChange={(e) => setF({ ...f, user: e.currentTarget.value })} />
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
