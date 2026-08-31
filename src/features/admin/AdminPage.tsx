// ===== 管理后台（仅管理员）：概览统计 / 举报 / 用户 / IP 日志 =====
// 数据来自后端 /api/admin/*（useAdminStats/useAdminReports/useAdminUsers/useIpLogs）。
// 后端返回字段与本仓库 types.ts 基础类型略有出入，此处按后端实际返回做运行时适配。
// 各 Tab 组件已拆分到 ./tabs/（overview / tagreqs / tags / reports / users）
import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Group, Loader, Stack, Tabs, Text } from '@mantine/core';
import { useAuth } from '../auth/AuthContext';
import {
  useAdminReports,
  useAdminStats,
  useAdminUsers,
  useIpLogs,
} from '../../api/hooks';
import type { AdminIpLogRow, AdminReportRow, AdminUserRow, IpStatRow } from './adminApi';
import { OverviewTab, PromoTab } from './tabs/overview';
import { TagRequestsTab } from './tabs/tagreqs';
import { TagsTab } from './tabs/tags';
import { ReportsTab } from './tabs/reports';
import { UsersTab, IpLogsTab } from './tabs/users';

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
