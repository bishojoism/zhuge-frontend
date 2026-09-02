// ===== 删除确认弹窗（合并二次确认 + 密码验证） =====
// 作者自删敏感操作：一个弹窗内完成「确认删除 + 密码验证」。
// 验证通过后回调 onDelete(verify) 执行删除（由调用方发 DELETE，携带 body.password）。
// 有密码的账号输入当前密码验证；无密码账号（游客等）无可验证凭据 → 直接确认删除
// （服务端仍独立校验权限/验证要求，无密码账号若后端要求验证会以错误提示）。
import { useState } from 'react';
import { Button, Group, Loader, PasswordInput, Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useSecurity } from '../../api/hooks';
import { openModalOnce } from '../../lib/modals';

export interface DeleteVerifyResult {
  /** 当前密码验证通过 */
  password?: string;
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : '验证失败';
}

interface DeleteConfirmOptions {
  /** 首帖（删主题）/ 非首帖（删帖子） */
  isFirst: boolean;
  /** 主题标题（首帖时确认文案用） */
  title?: string;
  /** 验证通过后执行删除（携带验证凭据）；返回 Promise 供弹窗等待/错误展示 */
  onDelete: (verify: DeleteVerifyResult) => Promise<void>;
}

// 打开删除确认弹窗（确认文案 + 密码验证 + 验证并删除）
export function openDeleteConfirmModal(opts: DeleteConfirmOptions): void {
  openModalOnce('delete-confirm', (m: typeof modals) => {
    m.open({
      modalId: 'delete-confirm',
      title: opts.isFirst ? '删除主题' : '删除帖子',
      centered: true,
      size: 'sm',
      children: <DeleteConfirmContent {...opts} />,
    });
  });
}

function DeleteConfirmContent({ isFirst, title, onDelete }: DeleteConfirmOptions) {
  // 账号安全信息：有无密码（决定是否需要密码验证）
  const { data: security, isLoading } = useSecurity();
  const hasPassword = !!security?.hasPassword;

  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => modals.closeAll();

  const runDelete = async (verify: DeleteVerifyResult) => {
    setBusy(true);
    setError('');
    try {
      await onDelete(verify);
      close();
    } catch (e) {
      setError(errMessage(e));
      setBusy(false);
    }
  };

  // 密码验证 → 删除
  const submitPassword = () => {
    if (!password.trim()) {
      setError('请输入当前密码');
      return;
    }
    void runDelete({ password });
  };

  // 无密码账号（游客等）：直接确认删除
  const confirmDirect = () => {
    void runDelete({});
  };

  return (
    <Stack gap="sm">
      {/* 确认文案 */}
      <Text size="sm">
        {isFirst
          ? `确定删除整个主题「${title || ''}」？此操作不可恢复。`
          : '确定删除这条帖子？此操作不可恢复。'}
      </Text>

      {isLoading && security === undefined ? (
        <Stack align="center" py="sm">
          <Loader size="sm" />
        </Stack>
      ) : hasPassword ? (
        <>
          <Text size="xs" c="dimmed">
            删除前请输入当前密码验证身份（防止他人误删）。
          </Text>
          <PasswordInput
            placeholder="输入当前密码"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            data-autofocus
          />
        </>
      ) : (
        <Text size="xs" c="dimmed">
          该账号未设置密码，无需密码验证。点击下方按钮直接删除。
        </Text>
      )}
      {error ? (
        <Text size="sm" c="red">
          {error}
        </Text>
      ) : null}
      <Group justify="flex-end" mt="sm">
        <Button variant="default" onClick={close} disabled={busy}>
          取消
        </Button>
        <Button
          onClick={hasPassword ? submitPassword : confirmDirect}
          loading={busy}
          color="red"
          disabled={isLoading && security === undefined}
        >
          {hasPassword ? '验证并删除' : '确认删除'}
        </Button>
      </Group>
    </Stack>
  );
}

// 通知式错误展示（供调用方复用）
export function showDeleteVerifyError(e: unknown): void {
  notifications.show({ message: errMessage(e), color: 'red' });
}
