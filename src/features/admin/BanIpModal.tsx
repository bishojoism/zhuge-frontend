// ===== IP 日志：封禁 IP 弹窗 → POST /api/admin/moderation {action:'ban_ip', userId:null, ip, reason} =====
// reason 必填；封禁记录写入 banned_ips（后端 INSERT OR IGNORE）
import { useState } from 'react';
import { Button, Group, Stack, Text, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { mutate } from 'swr';
import { submitModeration } from './adminApi';

interface BanIpModalProps {
  ip: string;
  onClose: () => void;
}

export function BanIpModal({ ip, onClose }: BanIpModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const r = reason.trim();
    if (!r) {
      notifications.show({ message: '请填写原因', color: 'yellow' });
      return;
    }
    setSubmitting(true);
    try {
      await submitModeration({ action: 'ban_ip', userId: null, ip, reason: r });
      notifications.show({ message: `已封禁 IP ${ip}`, color: 'green' });
      await Promise.all(['/admin/ip-logs', '/admin/ip-logs/stats'].map((k) => mutate(k)));
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
        封禁 IP：<b>{ip}</b>
      </Text>
      <Textarea
        label="原因（必填）"
        autoComplete="off"
        value={reason}
        onChange={(e) => setReason(e.currentTarget.value)}
        minRows={3}
        autosize
        autoFocus
        data-autofocus
        placeholder="如：恶意刷帖 / 违规访问"
      />
      <Group justify="flex-end" mt="xs">
        <Button variant="default" onClick={onClose}>
          取消
        </Button>
        <Button color="red" loading={submitting} onClick={submit}>
          确认封禁
        </Button>
      </Group>
    </Stack>
  );
}
