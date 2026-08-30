// ===== 用户管理弹窗：封号/解封/封IP/解封IP → POST /api/admin/moderation =====
// body { action, userId, ip, reason }；reason 必填（通知对方）；IP 动作时 ip 必填（预填最近 IP，可手改）
import { useMemo, useState } from 'react';
import { Button, Group, Select, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { mutate } from 'swr';
import {
  ADMIN_KEYS,
  MOD_ACTION_LABELS,
  submitModeration,
  type AdminUserRow,
  type ModerationAction,
} from './adminApi';

interface UserActionModalProps {
  user: AdminUserRow;
  onClose: () => void;
}

export function UserActionModal({ user, onClose }: UserActionModalProps) {
  // 动作集随用户状态变化：封号↔解封；有最近 IP 才提供封/解 IP
  const options = useMemo(() => {
    const list: { value: ModerationAction; label: string }[] = [
      user.is_banned
        ? { value: 'unban_user', label: '解封' }
        : { value: 'ban_user', label: '封号' },
    ];
    if (user.last_ip) {
      list.push({ value: 'ban_ip', label: '封禁 IP' });
      list.push({ value: 'unban_ip', label: '解封 IP' });
    }
    return list;
  }, [user.is_banned, user.last_ip]);

  const [action, setAction] = useState<ModerationAction>(options[0].value);
  const [ip, setIp] = useState(user.last_ip ?? '');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const needsIp = action === 'ban_ip' || action === 'unban_ip';

  const submit = async () => {
    const r = reason.trim();
    if (!r) {
      notifications.show({ message: '请填写原因', color: 'yellow' });
      return;
    }
    if (needsIp && !ip.trim()) {
      notifications.show({ message: '请填写 IP 地址', color: 'yellow' });
      return;
    }
    setSubmitting(true);
    try {
      await submitModeration({ action, userId: user.id, ip: ip.trim(), reason: r });
      notifications.show({ message: `已${MOD_ACTION_LABELS[action]} ${user.username}`, color: 'green' });
      await Promise.all(ADMIN_KEYS.map((k) => mutate(k)));
      onClose();
    } catch (e) {
      notifications.show({
        message: e instanceof Error ? e.message : '操作失败',
        color: 'red',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack gap="sm">
      <Text size="sm">
        {user.username} · 最近 IP：{user.last_ip || '—'} · 当前状态：{user.is_banned ? '已封号' : '正常'}
      </Text>
      <Select
        label="操作"
        data={options}
        value={action}
        onChange={(v) => {
          if (v) setAction(v as ModerationAction);
        }}
        allowDeselect={false}
      />
      {needsIp && (
        <TextInput
          label="IP 地址"
          autoComplete="off"
          value={ip}
          onChange={(e) => setIp(e.currentTarget.value)}
          placeholder="要封禁/解封的 IP"
        />
      )}
      <Textarea
        label="原因（必填，将通知对方）"
        autoComplete="off"
        value={reason}
        onChange={(e) => setReason(e.currentTarget.value)}
        minRows={3}
        autosize
        autoFocus
        data-autofocus
        placeholder="填写原因…"
      />
      <Group justify="flex-end" mt="xs">
        <Button variant="default" onClick={onClose}>
          取消
        </Button>
        <Button color={action === 'ban_user' || action === 'ban_ip' ? 'red' : undefined} loading={submitting} onClick={submit}>
          确认
        </Button>
      </Group>
    </Stack>
  );
}
