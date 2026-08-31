// ===== 删除确认弹窗（合并二次确认 + 身份验证） =====
// 作者自删敏感操作：一个弹窗内完成「确认删除 + 自选验证方式（密码 或 通行密钥重认证）」。
// 验证通过后回调 onDelete(verify) 执行删除（由调用方发 DELETE，携带凭据）。
// 验证方式与改密码一致：当前密码 或 通行密钥重认证（/reauth/begin + /reauth/finish）。
import { useState } from 'react';
import { Button, Group, PasswordInput, Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { api } from '../../api/client';
import { useSecurity } from '../../api/hooks';
import { openModalOnce } from '../../lib/modals';
import { startAuthentication } from '../../lib/webauthn';

export interface DeleteVerifyResult {
  /** 当前密码验证通过 */
  password?: string;
  /** 通行密钥重认证令牌（一次性，5 分钟有效） */
  reauthToken?: string;
}

/** POST /api/reauth/begin 返回 */
interface ReauthBeginResult {
  method: 'passkey' | 'password';
  options?: PublicKeyCredentialRequestOptionsJSON;
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

// 打开删除确认弹窗（确认文案 + 自选密码/通行密钥验证 + 验证并删除）
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
  // 账号安全信息：有无密码 / 通行密钥（决定提供哪些验证方式）
  const { data: security } = useSecurity();
  const hasPassword = !!security?.hasPassword;
  const hasPasskey = (security?.passkeyCount ?? 0) > 0;

  const [password, setPassword] = useState('');
  const [method, setMethod] = useState<'password' | 'passkey'>(
    hasPassword ? 'password' : 'passkey'
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => modals.closeAll();

  // 密码验证 → 删除
  const submitPassword = async () => {
    if (!password.trim()) {
      setError('请输入当前密码');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onDelete({ password });
      close();
    } catch (e) {
      setError(errMessage(e));
      setBusy(false);
    }
  };

  // 通行密钥重认证 → 删除
  const verifyPasskey = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api<ReauthBeginResult>('/reauth/begin', {
        method: 'POST',
        body: {},
      });
      if (r.method !== 'passkey' || !r.options) {
        setError('该账号未绑定通行密钥，请改用密码验证');
        setBusy(false);
        return;
      }
      const authResult = await startAuthentication({ optionsJSON: r.options });
      const res = await api<{ token: string }>('/reauth/finish', {
        method: 'POST',
        body: { response: authResult },
      });
      await onDelete({ reauthToken: res.token });
      close();
    } catch (e) {
      setError(errMessage(e));
      setBusy(false);
    }
  };

  const submit = async () => {
    if (method === 'password') await submitPassword();
    else await verifyPasskey();
  };

  return (
    <Stack gap="sm">
      {/* 确认文案 */}
      <Text size="sm">
        {isFirst
          ? `确定删除整个主题「${title || ''}」？此操作不可恢复。`
          : '确定删除这条帖子？此操作不可恢复。'}
      </Text>

      {/* 自选验证方式：密码 或 通行密钥 */}
      <Text size="xs" c="dimmed">
        删除前请验证身份（防止他人误删）。
      </Text>
      {hasPassword && hasPasskey ? (
        <>
          <Group gap={6}>
            <Button
              size="compact-sm"
              variant={method === 'password' ? 'filled' : 'default'}
              onClick={() => {
                setMethod('password');
                setError('');
              }}
            >
              密码验证
            </Button>
            <Button
              size="compact-sm"
              variant={method === 'passkey' ? 'filled' : 'default'}
              onClick={() => {
                setMethod('passkey');
                setError('');
              }}
            >
              通行密钥
            </Button>
          </Group>
          {method === 'password' ? (
            <PasswordInput
              placeholder="输入当前密码"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              data-autofocus
            />
          ) : null}
        </>
      ) : hasPassword ? (
        <PasswordInput
          placeholder="输入当前密码"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          data-autofocus
        />
      ) : (
        <Text size="sm" c="dimmed">
          点击下方按钮用通行密钥验证身份后删除。
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
        <Button onClick={submit} loading={busy} color="red">
          验证并删除
        </Button>
      </Group>
      {!hasPassword && !hasPasskey && (
        <Text size="xs" c="dimmed">
          （该账号未设置密码也未绑定通行密钥，可能无法删除——请联系管理员）
        </Text>
      )}
    </Stack>
  );
}

// 通知式错误展示（供调用方复用）
export function showDeleteVerifyError(e: unknown): void {
  notifications.show({ message: errMessage(e), color: 'red' });
}
