// ===== 删除验证弹窗：作者自删前验证身份（密码 或 通行密钥重认证） =====
// 敏感操作保护：删除帖子/主题前必须证明是账号本人（防他人拿手机乱删）。
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

// 打开删除验证弹窗；resolve 返回验证结果（用户取消返回 null）
export function openDeleteVerifyModal(
  targetLabel: string
): Promise<DeleteVerifyResult | null> {
  return new Promise((resolve) => {
    openModalOnce('delete-verify', (m: typeof modals) => {
      m.open({
        modalId: 'delete-verify',
        title: '验证身份',
        centered: true,
        size: 'sm',
        children: (
          <DeleteVerifyContent
            targetLabel={targetLabel}
            onDone={(r) => {
              modals.closeAll();
              resolve(r);
            }}
            onCancel={() => {
              modals.closeAll();
              resolve(null);
            }}
          />
        ),
      });
    });
  });
}

function DeleteVerifyContent({
  targetLabel,
  onDone,
  onCancel,
}: {
  targetLabel: string;
  onDone: (r: DeleteVerifyResult) => void;
  onCancel: () => void;
}) {
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

  // 密码验证
  const submitPassword = async () => {
    if (!password.trim()) {
      setError('请输入当前密码');
      return;
    }
    setBusy(true);
    setError('');
    try {
      onDone({ password });
    } catch (e) {
      setError(errMessage(e));
      setBusy(false);
    }
  };

  // 通行密钥重认证
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
      onDone({ reauthToken: res.token });
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
      <Text size="sm">
        删除{targetLabel}前请验证身份（防止他人误删）。
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
          点击下方按钮用通行密钥验证身份。
        </Text>
      )}
      {error ? (
        <Text size="sm" c="red">
          {error}
        </Text>
      ) : null}
      <Group justify="flex-end" mt="sm">
        <Button variant="default" onClick={onCancel} disabled={busy}>
          取消
        </Button>
        <Button onClick={submit} loading={busy} color={hasPasskey && !hasPassword ? 'default' : undefined}>
          {method === 'password' ? '验证并删除' : '验证并删除'}
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
