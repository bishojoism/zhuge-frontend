// ===== 通用表单弹窗（替代 window.prompt/confirm）：管理后台各操作共用 =====
// 返回 Promise<Record<string,string> | null>（取消 = null）
import { useState } from 'react';
import { Button, Group, SegmentedControl, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { modals } from '@mantine/modals';
import { openModalOnce } from './modals';

export interface PromptField {
  key: string;
  label: string;
  placeholder?: string;
  initial?: string;
  type?: 'text' | 'textarea' | 'select';
  /** type=select 时的选项（字符串数组） */
  options?: string[];
}

interface PromptOptions {
  title: string;
  fields: PromptField[];
  confirmText?: string;
  /** 危险操作（红色确认按钮，如删除） */
  danger?: boolean;
}

export function openPromptModal(opts: PromptOptions): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    openModalOnce(
      'prompt',
      (m) => {
        m.open({
          modalId: 'prompt',
          title: opts.title,
          centered: true,
          size: 'sm',
          children: (
            <PromptForm
              fields={opts.fields}
              confirmText={opts.confirmText}
              danger={opts.danger}
              onDone={(values) => {
                resolve(values);
              }}
              onCancel={() => {
                resolve(null);
              }}
            />
          ),
        });
      },
      false
    );
  });
}

function PromptForm({
  fields,
  confirmText,
  danger,
  onDone,
  onCancel,
}: {
  fields: PromptField[];
  confirmText?: string;
  danger?: boolean;
  onDone: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of fields) {
      v[f.key] = f.initial ?? '';
      if (f.type === 'select' && f.options?.length) v[f.key] = f.initial ?? f.options[0];
    }
    return v;
  });

  const submit = () => {
    // 非空校验：text 类型必填（textarea/select 可选）
    const missing = fields.find((f) => f.type !== 'textarea' && !(values[f.key] || '').trim() && f.type !== 'select');
    if (missing) return; // 必填为空：不提交（按钮不 disabled，避免 iOS 聚焦问题）
    onDone({ ...values });
  };

  return (
    <Stack gap="sm" py="xs">
      {fields.map((f) =>
        f.type === 'textarea' ? (
          <Textarea
            key={f.key}
            label={f.label}
            placeholder={f.placeholder}
            autoComplete="new-password"
            minRows={2}
            autosize
            maxLength={200}
            value={values[f.key] || ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.currentTarget.value }))}
          />
        ) : f.type === 'select' ? (
          <Stack key={f.key} gap={4}>
            <Text size="sm" fw={500}>
              {f.label}
            </Text>
            <SegmentedControl
              value={values[f.key] || ''}
              onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
              data={(f.options || []).map((o) => ({ label: o, value: o }))}
              size="xs"
            />
          </Stack>
        ) : (
          <TextInput
            key={f.key}
            label={f.label}
            placeholder={f.placeholder}
            autoComplete="new-password"
            maxLength={40}
            data-autofocus
            value={values[f.key] || ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.currentTarget.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
        )
      )}
      <Group justify="flex-end" gap={8}>
        <Button size="compact-sm" variant="subtle" onClick={onCancel}>
          取消
        </Button>
        <Button size="compact-sm" color={danger ? 'red' : undefined} onClick={submit}>
          {confirmText || '确定'}
        </Button>
      </Group>
    </Stack>
  );
}
