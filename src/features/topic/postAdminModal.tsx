// ===== 管理弹窗：删除内容 / 封号 / 封IP（仅管理员） =====
// 参照旧版 openPostAdmin / pickPostAdminAction / submitPostAdmin 实现。
import { useEffect, useState } from 'react';
import { Button, SegmentedControl, Stack, Text, Textarea } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { api } from '../../api/client';
import { useAdminUsers } from '../../api/hooks';
import { openModalOnce } from '../../lib/modals';

export type AdminTargetType = 'discussion' | 'post';

export interface PostAdminModalOptions {
  targetType: AdminTargetType;
  targetId: number;
  authorId: number;
  authorName: string;
  // 删除内容成功后回调（由调用方刷新缓存；主题被删时跳走）
  onDelete?: (targetType: AdminTargetType, targetId: number) => void;
  // 封号/封IP 成功后回调
  onModeration?: () => void;
}

// 打开管理弹窗（调用方需保证已登录且 isAdmin）
export function openPostAdminModal(opts: PostAdminModalOptions): void {
  openModalOnce('post-admin', (m) => {
    m.open({
      title: '管理内容',
      centered: true,
      size: 'md',
      children: <PostAdminModalContent {...opts} />,
    });
  });
}

function PostAdminModalContent({ targetType, targetId, authorId, authorName, onDelete, onModeration }: PostAdminModalOptions) {
  const typeLabel = targetType === 'discussion' ? '主题' : '帖子';
  const [lastIp, setLastIp] = useState('');
  const [isBanned, setIsBanned] = useState(false);
  const [action, setAction] = useState('delete');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 查作者最近 IP / 封号状态（走 SWR 缓存 /admin/users，管理员列表共享）
  const { data: adminUsers } = useAdminUsers();
  useEffect(() => {
    const u = adminUsers?.find((x) => x.id === authorId);
    if (u) {
      setLastIp(u.last_ip || '');
      setIsBanned(!!u.is_banned);
    }
  }, [adminUsers, authorId]);

  const submit = async () => {
    const note = reason.trim();
    if (!note) {
      notifications.show({ message: '请填写原因', color: 'red' });
      return;
    }
    setSubmitting(true);
    try {
      if (action === 'delete') {
        // 后端契约（src/index.js）：body { targetType, targetId, reason }
        await api('/admin/delete-content', {
          method: 'POST',
          body: { targetType, targetId, reason: note },
        });
        modals.closeAll();
        onDelete?.(targetType, targetId);
      } else {
        // 后端契约：body { action: 'ban_user'|'ban_ip', userId, ip, reason }
        await api('/admin/moderation', {
          method: 'POST',
          body: { action, userId: authorId, ip: lastIp, reason: note },
        });
        modals.closeAll();
        onModeration?.();
      }
    } catch (e) {
      notifications.show({ message: e instanceof Error ? e.message : '操作失败', color: 'red' });
      setSubmitting(false);
    }
  };

  // 可执行操作：已封号不再显示封号；无 IP 不显示封IP
  const actions = [
    { value: 'delete', label: `删除${typeLabel}` },
    ...(!isBanned ? [{ value: 'ban_user', label: '封号' }] : []),
    ...(lastIp ? [{ value: 'ban_ip', label: '封IP' }] : []),
  ];

  return (
    <Stack gap="sm">
      <div style={{ fontSize: 13, background: 'var(--bg)', borderRadius: 8, padding: 10 }}>
        <div>
          {typeLabel} #{targetId} · 作者 <b>{authorName}</b>
          {isBanned && (
            <span className="mini-tag" style={{ background: '#c9302c', marginLeft: 6 }}>
              已封号
            </span>
          )}
        </div>
        <div style={{ color: 'var(--muted)', marginTop: 2 }}>最近 IP：{lastIp || '—'}</div>
      </div>
      <Text size="sm" c="dimmed">
        操作：
      </Text>
      <SegmentedControl fullWidth value={action} onChange={setAction} data={actions} />
      <Textarea
        placeholder="填写原因（必填，将通知对方）"
        minRows={3}
        autoFocus
        data-autofocus
        autoComplete="new-password"
        value={reason}
        onChange={(e) => setReason(e.currentTarget.value)}
      />
      <Button fullWidth onClick={submit} loading={submitting}>
        确认
      </Button>
      <Button fullWidth variant="subtle" onClick={() => modals.closeAll()}>
        取消
      </Button>
    </Stack>
  );
}
