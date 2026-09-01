// ===== 账号安全弹窗：密码与通行密钥互操作（改/设密码、删密码、绑/解绑通行密钥） =====
// 单组件内部管理子步骤 state；openSecurityModal() 通过 modals.open 挂载。
import { useEffect, useState } from 'react';
import { Button, Group, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { focusModalInput } from '../../lib/modalFocus';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { api } from '../../api/client';
import { useSecurity } from '../../api/hooks';
import { openModalOnce } from '../../lib/modals';
import { startAuthentication, startRegistration } from '../../lib/webauthn';
import { timeAgo } from '../../lib/utils';
import { useAuth } from '../auth/AuthContext';
import type { PasskeyInfo, SecurityInfo } from '../../types';

// ---- API 契约类型 ----

/** POST /api/reauth/begin 返回 */
interface ReauthBeginResult {
  method: 'passkey' | 'password';
  options?: PublicKeyCredentialRequestOptionsJSON;
}

/** POST /api/passkey/register/begin 返回（options + userId，或 needsAuth） */
interface RegisterBeginResult extends PublicKeyCredentialCreationOptionsJSON {
  userId?: number;
  needsAuth?: boolean;
  authRequestId?: string;
}

/** 通行密钥重认证完成后的动作分发（与旧版 startReauthFlow/doPasskeyReauth 语义一致） */
type ReauthAction =
  | { type: 'changePassword' }
  | { type: 'deletePassword' }
  | { type: 'bindPasskey' }
  | { type: 'removePasskey'; passkeyId: string };

type Step =
  | { kind: 'main' }
  | { kind: 'reauth'; action: ReauthAction; options: PublicKeyCredentialRequestOptionsJSON }
  | { kind: 'newPassword'; reauthToken: string | null }
  | { kind: 'deletePasswordConfirm'; token: string }
  | { kind: 'bindPassword' }
  | { kind: 'bindCreate'; token: string }
  | { kind: 'removePassword'; passkey: PasskeyInfo };

// ---- 小工具 ----

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// 用户主动取消 WebAuthn 弹窗 / 超时（浏览器错误文案含 cancel/Abort/NotAllowed）
function isCancelError(e: unknown): boolean {
  const m = errMsg(e).toLowerCase();
  return m.includes('cancel') || m.includes('abort') || m.includes('notallowed');
}

function toast(message: string, color: 'red' | 'green' = 'red'): void {
  notifications.show({ message, color });
}

// ===== 弹窗入口 =====

export function openSecurityModal(): void {
  openModalOnce('security', (m) => {
    m.open({
      centered: true,
      size: 'sm',
      children: <SecurityModal />,
    });
  });
}

// ===== 主组件：内部管理子步骤 state =====

function SecurityModal() {
  const { data: security, mutate, isLoading, error } = useSecurity();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>({ kind: 'main' });
  const [busy, setBusy] = useState(false);

  const refreshSecurity = async (): Promise<void> => {
    await mutate();
  };

  const goMain = (): void => setStep({ kind: 'main' });

  // 通用通行密钥重认证：begin → 验证界面；验证完成后按 action 分发
  const startReauthFlow = async (action: ReauthAction): Promise<void> => {
    try {
      const r = await api<ReauthBeginResult>('/reauth/begin', { method: 'POST', body: {} });
      if (r.method !== 'passkey') {
        // 无通行密钥 → 只能走密码验证
        if (action.type === 'removePasskey') {
          toast('该账号未设置密码，无法用密码解绑');
          return;
        }
        if (action.type === 'deletePassword') {
          toast('请先绑定通行密钥');
          return;
        }
        if (action.type === 'bindPasskey') {
          toast('请先设置密码或绑定通行密钥');
          return;
        }
        setStep({ kind: 'newPassword', reauthToken: null });
        return;
      }
      setStep({ kind: 'reauth', action, options: r.options as PublicKeyCredentialRequestOptionsJSON });
    } catch (e) {
      toast('验证失败：' + errMsg(e));
    }
  };

  // 「验证身份」界面点击通行密钥验证 → finish 拿 token → 按 action 分发
  const doPasskeyReauth = async (
    action: ReauthAction,
    options: PublicKeyCredentialRequestOptionsJSON
  ): Promise<void> => {
    setBusy(true);
    try {
      const authResult = await startAuthentication({ optionsJSON: options });
      const res = await api<{ token: string }>('/reauth/finish', {
        method: 'POST',
        body: { response: authResult },
      });
      await dispatchReauth(action, res.token);
    } catch (e) {
      if (isCancelError(e)) toast('已取消验证');
      else toast('验证失败：' + errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  // 验证通过后按 action 分发（改密码 / 删密码 / 绑定 / 解绑）
  const dispatchReauth = async (action: ReauthAction, token: string): Promise<void> => {
    try {
      if (action.type === 'removePasskey') {
        await api(`/me/passkeys/${encodeURIComponent(action.passkeyId)}/remove`, {
          method: 'POST',
          body: { reauthToken: token },
        });
        toast('已解绑', 'green');
        await refreshSecurity();
        goMain();
      } else if (action.type === 'deletePassword') {
        setStep({ kind: 'deletePasswordConfirm', token });
      } else if (action.type === 'bindPasskey') {
        setStep({ kind: 'bindCreate', token });
      } else {
        setStep({ kind: 'newPassword', reauthToken: token });
      }
    } catch (e) {
      // 敏感操作错误直接透出服务端 message
      toast(errMsg(e));
    }
  };

  // 修改/设置密码
  const changePassword = (): void => {
    void startReauthFlow({ type: 'changePassword' });
  };

  // 保存新密码（P-表单简化：删除冗余的"确认新密码"，与注册去确认密码同源——密码可见性切换已够防误输）
  const savePassword = async (
    reauthToken: string | null,
    currentPassword: string,
    newPassword: string
  ): Promise<void> => {
    if (newPassword.length < 8) {
      toast('密码至少 8 位');
      return;
    }
    if (!reauthToken && !currentPassword) {
      toast('请输入当前密码');
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, string> = { newPassword };
      if (reauthToken) body.reauthToken = reauthToken;
      else body.currentPassword = currentPassword;
      await api('/me/password', { method: 'POST', body });
      toast('密码已更新', 'green');
      await refreshSecurity();
      goMain();
    } catch (e) {
      // 直接透出服务端 message
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  // 删除密码（通行密钥验证 → 确认）
  const deletePassword = (): void => {
    void startReauthFlow({ type: 'deletePassword' });
  };

  const confirmDeletePassword = async (token: string): Promise<void> => {
    setBusy(true);
    try {
      await api('/me/password/remove', { method: 'POST', body: { reauthToken: token } });
      toast('密码已删除', 'green');
      await refreshSecurity();
      goMain();
    } catch (e) {
      // 直接透出服务端 message
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  // 绑定通行密钥：有密码 → 密码验证；无密码但有通行密钥 → 通行密钥验证；都没有 → 提示后走改密码
  const bindPasskey = (): void => {
    if (!security) return;
    if (security.hasPassword) {
      setStep({ kind: 'bindPassword' });
    } else if (security.passkeyCount > 0) {
      void startReauthFlow({ type: 'bindPasskey' });
    } else {
      toast('请先设置密码或绑定通行密钥');
      changePassword();
    }
  };

  // 注册 finish 公共部分：startRegistration → finish → 确认用户名 → 回主界面
  const finishRegistration = async (username: string, options: RegisterBeginResult): Promise<void> => {
    if (!options.userId) throw new Error('注册参数不完整，请重试');
    const regResult = await startRegistration({ optionsJSON: options });
    await api('/passkey/register/finish', {
      method: 'POST',
      body: { userId: options.userId, response: regResult },
    });
    await api('/me/username', { method: 'POST', body: { username } });
    toast('通行密钥已绑定', 'green');
    await refreshSecurity();
    goMain();
  };

  // 有密码：密码验证后绑定
  const bindWithPassword = async (password: string): Promise<void> => {
    const username = (user?.username || '').trim();
    if (!password) {
      toast('请输入密码');
      return;
    }
    setBusy(true);
    try {
      const options = await api<RegisterBeginResult>('/passkey/register/begin', {
        method: 'POST',
        body: { username, password },
      });
      if (options.needsAuth) {
        toast('需要旧设备授权确认，请稍后重试');
        goMain();
        return;
      }
      await finishRegistration(username, options);
    } catch (e) {
      // 直接透出服务端 message（密码错误 / 验证已过期等）
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  // 通行密钥验证通过：凭 reauthToken 绑定新通行密钥
  const bindWithToken = async (token: string): Promise<void> => {
    const username = (user?.username || '').trim();
    setBusy(true);
    try {
      const options = await api<RegisterBeginResult>('/passkey/register/begin', {
        method: 'POST',
        body: { username, reauthToken: token },
      });
      if (options.needsAuth) {
        toast('需要旧设备授权确认，请稍后重试');
        goMain();
        return;
      }
      await finishRegistration(username, options);
    } catch (e) {
      // 直接透出服务端 message
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  // 解绑通行密钥：有密码 → 输入密码确认；无密码 → 通行密钥验证
  const removePasskey = (passkey: PasskeyInfo): void => {
    if (!security) return;
    if (security.hasPassword) {
      setStep({ kind: 'removePassword', passkey });
    } else {
      void startReauthFlow({ type: 'removePasskey', passkeyId: passkey.id });
    }
  };

  const removeWithPassword = async (passkey: PasskeyInfo, password: string): Promise<void> => {
    if (!password) {
      toast('请输入密码');
      return;
    }
    setBusy(true);
    try {
      await api(`/me/passkeys/${encodeURIComponent(passkey.id)}/remove`, {
        method: 'POST',
        body: { currentPassword: password },
      });
      toast('已解绑', 'green');
      await refreshSecurity();
      goMain();
    } catch (e) {
      // 直接透出服务端 message（至少保留一种登录方式…）
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap={0}>
      {step.kind === 'main' && (
        <MainView
          security={security}
          isLoading={isLoading}
          error={error}
          onRetry={() => void mutate()}
          onClose={() => modals.closeAll()}
          onChangePassword={changePassword}
          onDeletePassword={deletePassword}
          onBindPasskey={bindPasskey}
          onRemovePasskey={removePasskey}
        />
      )}
      {step.kind === 'reauth' && (
        <ReauthView
          busy={busy}
          onVerify={() => void doPasskeyReauth(step.action, step.options)}
          onBack={goMain}
        />
      )}
      {step.kind === 'newPassword' && (
        <NewPasswordForm
          reauthToken={step.reauthToken}
          busy={busy}
          onSave={(cur, next) => void savePassword(step.reauthToken, cur, next)}
          onBack={goMain}
        />
      )}
      {step.kind === 'deletePasswordConfirm' && (
        <DeletePasswordConfirm
          busy={busy}
          onConfirm={() => void confirmDeletePassword(step.token)}
          onBack={goMain}
        />
      )}
      {step.kind === 'bindPassword' && (
        <BindPasswordForm
          username={user?.username || ''}
          busy={busy}
          onBind={(pw) => void bindWithPassword(pw)}
          onBack={goMain}
        />
      )}
      {step.kind === 'bindCreate' && (
        <BindCreateView
          busy={busy}
          onCreate={() => void bindWithToken(step.token)}
          onBack={goMain}
        />
      )}
      {step.kind === 'removePassword' && (
        <RemovePasswordForm
          passkey={step.passkey}
          busy={busy}
          onConfirm={(pw) => void removeWithPassword(step.passkey, pw)}
          onBack={goMain}
        />
      )}
    </Stack>
  );
}

// ===== 子视图 =====

interface MainViewProps {
  security: SecurityInfo | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  onClose: () => void;
  onChangePassword: () => void;
  onDeletePassword: () => void;
  onBindPasskey: () => void;
  onRemovePasskey: (p: PasskeyInfo) => void;
}

function MainView({
  security,
  isLoading,
  error,
  onRetry,
  onClose,
  onChangePassword,
  onDeletePassword,
  onBindPasskey,
  onRemovePasskey,
}: MainViewProps) {
  if (isLoading && !security) {
    return (
      <>
        <div className="passkey-icon">🔐</div>
        <Text ta="center" c="dimmed" size="sm">
          加载中…
        </Text>
      </>
    );
  }
  if (!security) {
    return (
      <>
        <div className="passkey-icon">🔐</div>
        <Text ta="center" c="dimmed" size="sm">
          加载失败：{errMsg(error)}
        </Text>
        <Button fullWidth mt="sm" onClick={onRetry}>
          重试
        </Button>
      </>
    );
  }

  const { hasPassword, passkeyCount, passkeys } = security;
  return (
    <>
      <div className="passkey-icon">🔐</div>
      <Text ta="center" fw={700} size="lg" mb="sm">
        账号与安全
      </Text>

      <div className="sec-row">
        <div className="sec-label">
          <b>登录密码</b>
          <div className="sec-sub">
            {hasPassword ? '已设置' : '未设置'}
            {hasPassword && passkeyCount === 0 ? '（绑定通行密钥后可删除密码）' : ''}
          </div>
        </div>
        <Group gap={6} wrap="nowrap">
          <Button size="xs" variant="subtle" onClick={onChangePassword}>
            {hasPassword ? '修改' : '设置'}
          </Button>
          {hasPassword && passkeyCount > 0 && (
            <Button size="xs" variant="subtle" color="red" onClick={onDeletePassword}>
              删除密码
            </Button>
          )}
        </Group>
      </div>

      <div className="sec-row">
        <div className="sec-label">
          <b>通行密钥</b>
          <div className="sec-sub">{passkeyCount} 个已绑定</div>
        </div>
        <Button size="xs" variant="subtle" onClick={onBindPasskey}>
          绑定
        </Button>
      </div>

      {passkeys.length > 0 && (
        <>
          <div className="sec-list-title">已绑定设备</div>
          {passkeys.map((p) => (
            <div className="sec-row" key={p.id}>
              <div className="sec-label">
                <b>{p.device_name || '通行密钥'}</b>
                <div className="sec-sub">
                  {p.last_used_at
                    ? '最近使用 ' + timeAgo(p.last_used_at)
                    : p.created_at
                      ? '绑定于 ' + timeAgo(p.created_at)
                      : ''}
                </div>
              </div>
              <Button size="xs" variant="subtle" color="red" onClick={() => onRemovePasskey(p)}>
                解绑
              </Button>
            </div>
          ))}
        </>
      )}

      <Button fullWidth mt="md" variant="default" onClick={onClose}>
        关闭
      </Button>
    </>
  );
}

interface ReauthViewProps {
  busy: boolean;
  onVerify: () => void;
  onBack: () => void;
}

function ReauthView({ busy, onVerify, onBack }: ReauthViewProps) {
  return (
    <>
      <div className="passkey-icon">🔑</div>
      <Text ta="center" fw={700} size="lg" mb="xs">
        验证身份
      </Text>
      <Text c="dimmed" size="sm" ta="center" mb="lg">
        请使用本机的通行密钥（指纹 / 面容 / PIN）确认是你本人操作。
      </Text>
      <Button fullWidth onClick={onVerify} loading={busy}>
        通行密钥验证
      </Button>
      <Button fullWidth mt="xs" variant="default" onClick={onBack} disabled={busy}>
        返回
      </Button>
    </>
  );
}

interface NewPasswordFormProps {
  reauthToken: string | null;
  busy: boolean;
  onSave: (currentPassword: string, newPassword: string) => void;
  onBack: () => void;
}

function NewPasswordForm({ reauthToken, busy, onSave, onBack }: NewPasswordFormProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  // iOS：挂载后延迟聚焦当前密码（或新密码）
  useEffect(() => {
    focusModalInput(reauthToken ? 'input[autocomplete="new-password"]' : 'input[autocomplete="current-password"]');
  }, [reauthToken]);
  return (
    <>
      <div className="passkey-icon">🔑</div>
      <Text ta="center" fw={700} size="lg" mb="xs">
        {reauthToken ? '设置新密码' : '修改密码'}
      </Text>
      {!reauthToken && (
        <PasswordInput
          label="当前密码"
          placeholder="请输入当前密码"
          autoFocus
          data-autofocus
          value={current}
          onChange={(e) => setCurrent(e.currentTarget.value)}
          mb="sm"
          autoComplete="current-password"
        />
      )}
      <PasswordInput
        label="新密码（至少 8 位）"
        placeholder="请输入新密码"
        autoFocus={!!reauthToken}
        data-autofocus
        value={next}
        onChange={(e) => setNext(e.currentTarget.value)}
        mb="lg"
        autoComplete="new-password"
      />
      <Button fullWidth onClick={() => onSave(current, next)} loading={busy}>
        保存
      </Button>
      <Button fullWidth mt="xs" variant="default" onClick={onBack} disabled={busy}>
        返回
      </Button>
    </>
  );
}

interface DeletePasswordConfirmProps {
  busy: boolean;
  onConfirm: () => void;
  onBack: () => void;
}

function DeletePasswordConfirm({ busy, onConfirm, onBack }: DeletePasswordConfirmProps) {
  return (
    <>
      <div className="passkey-icon">🔐</div>
      <Text ta="center" fw={700} size="lg" mb="xs">
        删除密码
      </Text>
      <Text c="dimmed" size="sm" ta="center" mb="lg">
        删除后，此账号只能用
        <Text span fw={700} c="inherit">
          通行密钥
        </Text>
        （指纹 / 面容 / PIN）登录。
        <br />
        确定删除登录密码吗？
      </Text>
      <Button fullWidth color="red" onClick={onConfirm} loading={busy}>
        确定删除
      </Button>
      <Button fullWidth mt="xs" variant="default" onClick={onBack} disabled={busy}>
        返回
      </Button>
    </>
  );
}

interface BindPasswordFormProps {
  username: string;
  busy: boolean;
  onBind: (password: string) => void;
  onBack: () => void;
}

function BindPasswordForm({ username, busy, onBind, onBack }: BindPasswordFormProps) {
  const [password, setPassword] = useState('');
  // iOS：挂载后延迟聚焦当前密码
  useEffect(() => {
    focusModalInput('input[autocomplete="current-password"]');
  }, []);
  return (
    <>
      <div className="passkey-icon">🔑</div>
      <Text ta="center" fw={700} size="lg" mb="xs">
        绑定通行密钥
      </Text>
      <Text c="dimmed" size="sm" ta="center" mb="lg">
        输入登录密码验证后，在本设备创建通行密钥（指纹 / 面容 / PIN）。
      </Text>
      <TextInput label="用户名" value={username} readOnly mb="sm" />
      <PasswordInput
        label="当前密码"
        placeholder="请输入当前密码"
        autoFocus
        data-autofocus
        value={password}
        onChange={(e) => setPassword(e.currentTarget.value)}
        mb="lg"
        autoComplete="current-password"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !busy) onBind(password);
        }}
      />
      <Button fullWidth onClick={() => onBind(password)} loading={busy}>
        验证并绑定
      </Button>
      <Button fullWidth mt="xs" variant="default" onClick={onBack} disabled={busy}>
        返回
      </Button>
    </>
  );
}

interface BindCreateViewProps {
  busy: boolean;
  onCreate: () => void;
  onBack: () => void;
}

function BindCreateView({ busy, onCreate, onBack }: BindCreateViewProps) {
  return (
    <>
      <div className="passkey-icon">🔑</div>
      <Text ta="center" fw={700} size="lg" mb="xs">
        绑定通行密钥
      </Text>
      <Text c="dimmed" size="sm" ta="center" mb="lg">
        身份已验证。点击下方按钮，在弹出的系统窗口中创建通行密钥（指纹 / 面容 / PIN）。
      </Text>
      <Button fullWidth onClick={onCreate} loading={busy}>
        创建通行密钥
      </Button>
      <Button fullWidth mt="xs" variant="default" onClick={onBack} disabled={busy}>
        返回
      </Button>
    </>
  );
}

interface RemovePasswordFormProps {
  passkey: PasskeyInfo;
  busy: boolean;
  onConfirm: (password: string) => void;
  onBack: () => void;
}

function RemovePasswordForm({ passkey, busy, onConfirm, onBack }: RemovePasswordFormProps) {
  const [password, setPassword] = useState('');
  // iOS：挂载后延迟聚焦当前密码
  useEffect(() => {
    focusModalInput('input[autocomplete="current-password"]');
  }, []);
  const submit = (): void => {
    if (!busy) onConfirm(password);
  };
  return (
    <>
      <div className="passkey-icon">🔐</div>
      <Text ta="center" fw={700} size="lg" mb="xs">
        解绑通行密钥
      </Text>
      <Text c="dimmed" size="sm" ta="center" mb="lg">
        输入登录密码，确认解绑「{passkey.device_name || '该设备'}」。
      </Text>
      <PasswordInput
        label="当前密码"
        placeholder="请输入当前密码"
        autoFocus
        data-autofocus
        value={password}
        onChange={(e) => setPassword(e.currentTarget.value)}
        mb="lg"
        autoComplete="current-password"
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
      />
      <Button fullWidth color="red" onClick={submit} loading={busy}>
        确认解绑
      </Button>
      <Button fullWidth mt="xs" variant="default" onClick={onBack} disabled={busy}>
        返回
      </Button>
    </>
  );
}
