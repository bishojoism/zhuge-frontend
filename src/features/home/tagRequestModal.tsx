// ===== 申请新标签弹窗：发帖标签区 / 更多标签弹窗共用入口 =====
// 提交后通知管理员审核（批准自动创建标签）
import { useState } from 'react';
import { Button, Group, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api } from '../../api/client';
import { openModalOnce } from '../../lib/modals';
import { focusOnEnter } from '../../lib/modalFocus';

export function openTagRequestModal(): void {
  openModalOnce(
    'tag-request',
    (m) => {
      m.open({
        modalId: 'tag-request',
        title: '申请新标签',
        centered: true,
        size: 'sm',
        ...focusOnEnter('input'), // 自动聚焦标签名输入框（含 iOS 键盘唤起）
        children: <TagRequestContent />,
      });
    },
    true // 手势内同步叫醒键盘（iOS）
  );
}

export function TagRequestContent() {
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const n = name.trim();
    if (n.length < 2) {
      notifications.show({ message: '标签名至少 2 个字', color: 'red' });
      return;
    }
    setSubmitting(true);
    try {
      await api('/tag-requests', { method: 'POST', body: { name: n, reason: reason.trim() } });
      notifications.show({ message: '申请已提交，等待管理员审核', color: 'green' });
      setSubmitting(false);
      // 关闭弹窗（openModalOnce 内部：closeAll）
      import('@mantine/modals').then((m) => m.modals.closeAll());
    } catch (e) {
      setSubmitting(false);
      notifications.show({ message: e instanceof Error ? e.message : '申请失败', color: 'red' });
    }
  };

  return (
    <Stack gap="sm" py="xs">
      <Text size="xs" c="dimmed">
        想要一个还不存在的标签？提交申请，管理员通过后会自动创建，你和其他人都能使用。
      </Text>
      <TextInput
        label="标签名"
        placeholder="2-20 字，如 IP 名 / 题材"
        autoComplete="off"
        maxLength={20}
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        data-autofocus
      />
      <Textarea
        label="说明用途（可选）"
        placeholder="为什么需要这个标签？"
        autoComplete="off"
        minRows={2}
        autosize
        maxLength={200}
        value={reason}
        onChange={(e) => setReason(e.currentTarget.value)}
      />
      <Group justify="flex-end" gap={8}>
        <Button size="compact-sm" variant="subtle" disabled={submitting} onClick={() => import('@mantine/modals').then((m) => m.modals.closeAll())}>
          取消
        </Button>
        <Button size="compact-sm" loading={submitting} onClick={submit}>
          提交申请
        </Button>
      </Group>
    </Stack>
  );
}
