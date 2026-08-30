// ===== 管理后台：API 契约与请求封装 =====
// 行类型字段以后端实际返回为准（后端 zhuge-worker/src/index.js，/api/admin/* 路由）。
// types.ts 中的 AdminReport/AdminUser/IpLogRow 为基础类型，与后端返回略有出入，
// 这里按后端返回定义本模块专用的行类型，并在页面处做一次运行时适配。
import { api } from '../../api/client';

// GET /api/admin/ip-logs/stats → { data: IpStatRow[] }
// 每个 IP 的访问统计：访问次数 / 最近访问 / 关联用户数
export interface IpStatRow {
  ip: string;
  visits: number;
  last_seen: string;
  users: number;
}

// GET /api/admin/reports → { data: AdminReportRow[] }
// 联表字段：reporter（举报人用户名）、target_user（被举报者用户名）、discussion_id（帖子→所属主题）
export interface AdminReportRow {
  id: number;
  target_type: 'discussion' | 'post';
  target_id: number;
  reason: string;
  status: 'pending' | 'rejected' | 'resolved';
  admin_note: string | null;
  created_at: string;
  handled_at: string | null;
  reporter: string;
  target_user: string | null;
  discussion_id: number | null;
}

// GET /api/admin/users → { data: AdminUserRow[] }
// last_ip = 最近登录 IP（ip_logs 联查）、post_count = 发帖数
export interface AdminUserRow {
  id: number;
  username: string;
  is_admin: number;
  is_banned: number;
  created_at: string;
  last_ip: string | null;
  post_count: number;
}

// GET /api/admin/ip-logs → { data: AdminIpLogRow[] }（user 为联表用户名，可能为空）
export interface AdminIpLogRow {
  id: number;
  ip: string;
  path: string;
  ua: string;
  created_at: string;
  user: string | null;
}

// ---- 动作枚举（与后端校验保持一致） ----
// POST /api/admin/reports/:id/action 的 action
export type ReportAction = 'reject' | 'delete' | 'ban_user' | 'ban_ip';
// POST /api/admin/moderation 的 action
export type ModerationAction = 'ban_user' | 'unban_user' | 'ban_ip' | 'unban_ip';

export const REPORT_ACTION_LABELS: Record<ReportAction, string> = {
  reject: '驳回',
  delete: '删除内容',
  ban_user: '封号',
  ban_ip: '封禁全部IP',
};

export const MOD_ACTION_LABELS: Record<ModerationAction, string> = {
  ban_user: '封号',
  unban_user: '解封',
  ban_ip: '封禁 IP',
  unban_ip: '解封 IP',
};

// ---- 请求封装 ----

// 处理举报：body { action, note }，note 必填（通知举报者与被举报者）
// 动作 'delete' 由后端直接删除目标内容并处理关联数据；'ban_ip' 由后端封禁被举报者的**所有** IP（ip_logs 去重）
export function submitReportAction(reportId: number, action: ReportAction, note: string) {
  return api<{ ok: boolean }>(`/admin/reports/${reportId}/action`, {
    method: 'POST',
    body: { action, note },
  });
}

// 用户管理直接操作：body { action, userId, ip, reason }
// ip 仅封禁/解封 IP 时必填；后端禁止操作自己（管理员）
export function submitModeration(opts: {
  action: ModerationAction;
  userId: number | null;
  ip?: string | null;
  reason: string;
}) {
  return api<{ ok: boolean }>('/admin/moderation', {
    method: 'POST',
    body: { action: opts.action, userId: opts.userId, ip: opts.ip || '', reason: opts.reason },
  });
}

// 直接删除内容：body { targetType, targetId, reason }，reason 必填（通知作者）
// 说明：举报处理流程里的"删除内容"走后端 reports/:id/action action='delete'（与旧 app.js 一致，
// 且能同时把举报置为已处理）；本封装用于需要直接删除内容而不走举报的场景。
export function deleteContent(opts: { targetType: 'discussion' | 'post'; targetId: number; reason: string }) {
  return api<{ ok: boolean; author: string | null }>('/admin/delete-content', {
    method: 'POST',
    body: { targetType: opts.targetType, targetId: opts.targetId, reason: opts.reason },
  });
}

// ===== 宣传数据看板 =====
// GET /api/admin/overview → { data: OverviewStats }
export interface OverviewStats {
  users: number;
  newUsers7d: number;
  discussions: number;
  posts: number;
  didis: number;
  invited: number;
  stickyCount: number;
}
export function getOverview() {
  return api<{ data: OverviewStats }>('/admin/overview');
}

// ===== 主题置顶（站长推荐位） =====
export interface StickyDiscussion {
  id: number;
  title: string;
  is_sticky: number;
  created_at: string;
  comment_count: number;
  author: string;
}
// GET /api/sticky-discussions → { data: StickyDiscussion[] }
export function getStickyDiscussions() {
  return api<{ data: StickyDiscussion[] }>('/sticky-discussions');
}
// POST /api/admin/discussions/:id/sticky → { ok, sticky }
export function setDiscussionSticky(id: number, sticky: boolean) {
  return api<{ ok: boolean; sticky: number }>(`/admin/discussions/${id}/sticky`, {
    method: 'POST',
    body: { sticky },
  });
}

// ===== 标签申请 =====
export interface TagRequestRow {
  id: number;
  name: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  created_at: string;
  handled_at: string | null;
  requester: string;
  handled_by_name: string | null;
}
// GET /api/tag-requests → { data: TagRequestRow[] }
export function getTagRequests() {
  return api<{ data: TagRequestRow[] }>('/tag-requests');
}
// POST /api/tag-requests/:id/handle → { ok }
// 批准时可改名（finalName，默认保持申请名）；note 批准时为标签描述 / 驳回时为原因
export function handleTagRequest(id: number, action: 'approve' | 'reject', note: string, finalName?: string) {
  return api<{ ok: boolean }>(`/tag-requests/${id}/handle`, {
    method: 'POST',
    body: { action, note, ...(action === 'approve' && finalName ? { name: finalName } : {}) },
  });
}

// ===== 标签管理 =====
export interface AdminTagRow {
  id: number;
  name: string;
  description: string | null;
  color: string;
  position: number | null;
  is_hidden: number;
  is_restricted: number;
  is_primary: number;
  discussion_count: number;
  slug: string | null;
  created_at: string;
}
// GET /api/admin/tags → { data: AdminTagRow[] }
export function getAdminTags() {
  return api<{ data: AdminTagRow[] }>('/admin/tags');
}
// POST /api/admin/tags → { data: { id } }
export function createAdminTag(opts: { name: string; description?: string; color?: string; primary?: boolean }) {
  return api<{ data: { id: number } }>('/admin/tags', { method: 'POST', body: opts });
}
// PUT /api/admin/tags/:id → { ok }
export function updateAdminTag(
  id: number,
  patch: { name?: string; description?: string; color?: string; is_hidden?: boolean; primary?: boolean }
) {
  return api<{ ok: boolean }>(`/admin/tags/${id}`, { method: 'PUT', body: patch });
}
// DELETE /api/admin/tags/:id → { ok }
export function deleteAdminTag(id: number) {
  return api<{ ok: boolean }>(`/admin/tags/${id}`, { method: 'DELETE' });
}

// 管理动作完成后需要失效的 SWR key（保持数据新鲜）
export const ADMIN_KEYS = ['/admin/reports', '/admin/users', '/admin/ip-logs', '/admin/ip-logs/stats'] as const;
