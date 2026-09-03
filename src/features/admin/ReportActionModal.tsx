// ===== 举报处理弹窗：选动作 + 填原因 → POST /api/admin/reports/:id/action =====
// 动作：reject 驳回 / delete 删除内容（后端直接删并通知）/ ban_user 封号 / ban_ip 封禁 IP（后端取被举报者最近 IP）
// 原因 note 必填，通知举报者与被举报者；预填举报理由，可修改
import { useState } from 'react';
import { Button, Group, Select, Stack, Text, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { mutate } from 'swr';
import {
  ADMIN_KEYS,
  REPORT_ACTION_LABELS,
  submitReportAction,
  type AdminReportRow,
  type ReportAction,
} from './adminApi';

interface ReportActionModalProps {
  report: AdminReportRow;
  onClose: () => void;
}

const ACTION_OPTIONS: { value: ReportAction; label: string }[] = [
  { value: 'reject', label: '驳回举报' },
  { value: 'delete', label: '删除内容并通知' },
  { value: 'ban_user', label: '封号' },
  { value: 'ban_ip', label: '封禁 IP' },
];

export function ReportActionModal({ report, onClose }: ReportActionModalProps) {
  const [action, setAction] = useState<ReportAction>('reject');
  const [note, setNote] = useState(report.reason); // 预填举报理由
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const reason = note.trim();
    if (!reason) {
      notifications.show({ message: '请填写处理原因', color: 'yellow' });
      return;
    }
    setSubmitting(true);
    try {
      await submitReportAction(report.id, action, reason);
      notifications.show({ message: `已${REPORT_ACTION_LABELS[action]}举报 #${report.id}`, color: 'green' });
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
        {report.target_type === 'discussion' ? '主题' : '帖子'} #{report.target_id}
        {report.target_user ? ` · 被举报者 ${report.target_user}` : ''}
      </Text>
      <Text size="sm" c="dimmed">
        举报理由：{report.reason} · 举报者：{report.reporter} · {report.created_at?.slice(0, 16) ?? ''}
      </Text>
      <Select
        label="处理方式"
        data={ACTION_OPTIONS}
        value={action}
        onChange={(v) => {
          if (v) setAction(v as ReportAction);
        }}
        allowDeselect={false}
      />
      <Textarea
        label="处理原因（必填，将通知举报者和被举报者）"
        autoComplete="new-password"
        value={note}
        onChange={(e) => setNote(e.currentTarget.value)}
        minRows={3}
        autosize
        autoFocus
        data-autofocus
        placeholder="填写处理原因…"
      />
      <Group justify="flex-end" mt="xs">
        <Button variant="default" onClick={onClose}>
          取消
        </Button>
        <Button loading={submitting} onClick={submit}>
          确认处理
        </Button>
      </Group>
    </Stack>
  );
}
