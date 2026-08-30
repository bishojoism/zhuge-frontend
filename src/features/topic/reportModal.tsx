// ===== 举报弹窗：预设理由单选 + 自定义输入（文案与旧版一致） =====
import { useState } from 'react';
import { Button, Radio, Stack, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { api } from '../../api/client';
import { openModalOnce } from '../../lib/modals';

// 预设举报理由（与后端 /api/reports 校验列表一致，文案勿改动）
export const REPORT_REASONS: string[] = ['谩骂/人身攻击', '色情低俗', '广告/垃圾信息', '侵权/抄袭', '剧透', '申请自删', '其他'];

export type ReportTargetType = 'discussion' | 'post';

interface ReportModalProps {
  targetType: ReportTargetType;
  targetId: number;
}

// 打开举报弹窗（调用方需保证已登录）
export function openReportModal(targetType: ReportTargetType, targetId: number): void {
  openModalOnce('report', (m) => {
    m.open({
      title: '举报',
      centered: true,
      size: 'md',
      children: <ReportModalContent targetType={targetType} targetId={targetId} />,
    });
  });
}

function ReportModalContent({ targetType, targetId }: ReportModalProps) {
  const [reason, setReason] = useState('');
  const [custom, setCustom] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 点预设理由：选中并填到输入框（可继续修改）
  const pickReason = (r: string) => {
    setReason(r);
    setCustom(r);
  };

  // 自定义理由：实时覆盖 reason；与预设完全一致时保持选中高亮
  const changeCustom = (v: string) => {
    setCustom(v);
    setReason(v);
  };

  const submit = async () => {
    const r = reason.trim();
    if (!r) {
      notifications.show({ message: '请选择或填写举报理由', color: 'red' });
      return;
    }
    setSubmitting(true);
    try {
      // 后端契约（src/index.js）：body { targetType, targetId, reason }
      await api('/reports', {
        method: 'POST',
        body: { targetType, targetId, reason: r },
      });
      modals.closeAll();
      notifications.show({ message: '举报已提交，感谢反馈' });
    } catch (e) {
      notifications.show({ message: e instanceof Error ? e.message : '举报失败', color: 'red' });
      setSubmitting(false);
    }
  };

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        请选择举报理由：
      </Text>
      <Radio.Group
        value={REPORT_REASONS.includes(reason) ? reason : undefined}
        onChange={pickReason}
      >
        <Stack gap={6}>
          {REPORT_REASONS.map((r) => (
            <Radio key={r} value={r} label={r} />
          ))}
        </Stack>
      </Radio.Group>
      <Text size="xs" c="dimmed">
        📕 选择「申请自删」可申请删除<b>自己的内容</b>
      </Text>
      <TextInput
        placeholder="或自定义理由……（选理由后可删改）"
        maxLength={200}
        autoComplete="off"
        value={custom}
        onChange={(e) => changeCustom(e.currentTarget.value)}
      />
      <Button fullWidth onClick={submit} loading={submitting}>
        提交举报
      </Button>
      <Button fullWidth variant="subtle" onClick={() => modals.closeAll()}>
        取消
      </Button>
    </Stack>
  );
}
