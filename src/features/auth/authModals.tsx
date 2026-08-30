// ===== 认证弹窗：登录 / 注册 / 需要登录（通行密钥优先，密码可选） =====
// 契约：
//  openLoginModal(tab?: 'pk'|'pw')     打开登录弹窗（通行密钥优先）
//  openRegisterModal(tab?: 'pk'|'pw')  打开注册弹窗
//  requireLogin(action: string)        需要登录时的提示弹窗
// 所有打开统一走 openModalOnce（全局互斥：同 id 防抖 + closeAll 后等退出动画再打开）
import { useEffect, useRef, useState } from 'react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { Button, Center, Stack, Text, TextInput } from '@mantine/core';
import { IconClock, IconDeviceMobile, IconFingerprint, IconLock, IconX } from '@tabler/icons-react';
import { mutate } from 'swr';
import { focusModalInput, focusOnEnter, wakeIosKeyboard } from '../../lib/modalFocus';
import { openModalOnce } from '../../lib/modals';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { api } from '../../api/client';
import { isWebAuthnSupported, startAuthentication, startRegistration } from '../../lib/webauthn';

type AuthTab = 'pk' | 'pw';

// ---- 后端接口返回的 WebAuthn 选项（在标准 options 之上附加业务字段） ----
interface LoginBeginResult extends PublicKeyCredentialRequestOptionsJSON {
  needRegister?: boolean; // 全站还没有任何通行密钥 → 引导先去注册
}

interface RegisterBeginResult extends PublicKeyCredentialCreationOptionsJSON {
  userId: string | number; // 新用户注册时由后端创建；finish 时原样回传
  needsAuth?: boolean; // 已有账号且无有效验证 → 需旧设备授权
  authRequestId?: string; // needsAuth 时轮询用的授权请求 id
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// 区分 WebAuthn「用户取消」与真实错误（userVerification 失败 / 无可用验证器等）
function isCancelError(e: unknown): boolean {
  const msg = errMsg(e).toLowerCase();
  return msg.includes('cancel') || msg.includes('abort') || msg.includes('notallowed');
}

// 认证成功后的收尾：刷新当前用户并关闭所有弹窗。
// 注意：@mantine/modals 的弹窗内容渲染在 ModalsProvider 子树里（AuthProvider 之外），
// 拿不到 useAuth() 的 context；refresh 等价于 useMe().mutate()，
// 这里用 SWR 全局 mutate('/me')（main.tsx 的 SWRConfig 未自定义 cache，全局缓存共享）。
async function refreshUser(): Promise<void> {
  await mutate('/me');
}

// ============ 认证 Tab 条（.auth-tabs / .auth-tab / .auth-tab.active） ============
function AuthTabs({
  type,
  active,
  onChange,
}: {
  type: 'login' | 'register';
  active: AuthTab;
  onChange: (t: AuthTab) => void;
}) {
  const labels: [string, string] =
    type === 'login' ? ['通行密钥登录', '密码登录'] : ['通行密钥注册', '密码注册'];
  return (
    <div className="auth-tabs">
      <button
        type="button"
        className={'auth-tab' + (active === 'pk' ? ' active' : '')}
        onClick={() => onChange('pk')}
      >
        {labels[0]}
      </button>
      <button
        type="button"
        className={'auth-tab' + (active === 'pw' ? ' active' : '')}
        onClick={() => onChange('pw')}
      >
        {labels[1]}
      </button>
    </div>
  );
}

// ============ 登录弹窗 ============
function LoginModal({ initialTab = 'pk' }: { initialTab?: AuthTab }) {
  const [tab, setTab] = useState<AuthTab>(initialTab);
  const [view, setView] = useState<'form' | 'verifying' | 'needRegister' | 'error'>('form');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    // StrictMode 下 effect 会 挂载→清理→挂载，必须在这里重置为 true
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const switchTab = (t: AuthTab) => {
    if (busy) return;
    setTab(t);
    setPassword('');
    setView('form');
    // iOS：切到密码页签后聚焦用户名输入框（手势内叫醒键盘 + 弹窗内延迟聚焦兜底）
    if (t === 'pw') {
      wakeIosKeyboard();
      focusModalInput('input[autocomplete="username"]');
    }
  };

  const goRegister = (t: AuthTab) => {
    modals.closeAll();
    openRegisterModal(t);
  };

  // ---- 密码登录 ----
  const submitPassword = async () => {
    if (busy) return;
    const name = username.trim();
    if (!name || !password) {
      notifications.show({ message: '请输入用户名和密码', color: 'red' });
      return;
    }
    setBusy(true);
    try {
      await api('/login', { method: 'POST', body: { username: name, password } });
      if (!alive.current) return;
      await refreshUser();
      modals.closeAll();
    } catch (e) {
      if (!alive.current) return;
      setBusy(false);
      notifications.show({ message: '登录失败：' + errMsg(e), color: 'red' });
    }
  };

  // ---- 通行密钥登录 ----
  const submitPasskey = async () => {
    if (busy) return;
    setBusy(true);
    setView('verifying');
    try {
      const options = await api<LoginBeginResult>('/passkey/login/begin', { method: 'POST', body: {} });
      if (!alive.current) return;
      // 全站一个通行密钥都没有 → 引导先去注册
      if (options.needRegister) {
        setBusy(false);
        setView('needRegister');
        return;
      }
      const authResult = await startAuthentication({ optionsJSON: options });
      if (!alive.current) return;
      await api('/passkey/login/finish', { method: 'POST', body: { response: authResult } });
      if (!alive.current) return;
      await refreshUser();
      modals.closeAll();
    } catch (e) {
      if (!alive.current) return;
      setBusy(false);
      if (isCancelError(e)) {
        // 用户主动取消系统验证窗口 → 回到表单，轻提示
        setView('form');
        notifications.show({ message: '已取消登录' });
      } else {
        setErrorMsg(errMsg(e));
        setView('error');
      }
    }
  };

  if (view === 'verifying') {
    return (
      <Stack align="center" py="md" gap="sm">
        <IconFingerprint size={44} stroke={1.5} />
        <Text fw={700}>正在验证…</Text>
        <Text size="sm" c="dimmed" ta="center">
          请在弹出的系统窗口中使用通行密钥（指纹 / 面容 / PIN）。
        </Text>
      </Stack>
    );
  }

  if (view === 'needRegister') {
    return (
      <Stack align="center" py="md" gap="sm">
        <Text fw={700} size="lg">
          还没有通行密钥
        </Text>
        <Text size="sm" c="dimmed" ta="center">
          当前还没有任何通行密钥。换了新设备？请到「注册」输入原用户名绑定（有密码可直接绑定，或旧设备确认）。
        </Text>
        <Button fullWidth onClick={() => goRegister('pk')}>
          去注册
        </Button>
        <Button fullWidth variant="subtle" onClick={() => modals.closeAll()}>
          取消
        </Button>
      </Stack>
    );
  }

  if (view === 'error') {
    return (
      <Stack align="center" py="md" gap="sm">
        <Text fw={700} size="lg">
          登录失败
        </Text>
        <Text size="sm" c="red" ta="center">
          {errorMsg}
        </Text>
        <Text size="xs" c="dimmed" ta="center">
          换了新设备？通行密钥只存在原设备上，请到「注册」输入原用户名绑定（有密码可直接绑定，或旧设备确认）。
        </Text>
        <Button fullWidth onClick={submitPasskey}>
          重试
        </Button>
        <Button fullWidth color="clay" onClick={() => goRegister('pk')}>
          去注册绑定
        </Button>
        <Button fullWidth variant="subtle" onClick={() => modals.closeAll()}>
          取消
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      <Center>
        <IconFingerprint size={40} stroke={1.5} />
      </Center>
      <AuthTabs type="login" active={tab} onChange={switchTab} />
      {tab === 'pw' ? (
        <>
          <TextInput
            placeholder="用户名"
            maxLength={30}
            autoComplete="username"
            autoFocus
            data-autofocus
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitPassword();
            }}
          />
          <TextInput
            type="password"
            placeholder="密码"
            maxLength={128}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitPassword();
            }}
          />
          <Button fullWidth loading={busy} onClick={submitPassword}>
            登录
          </Button>
          <div className="auth-hint">
            还没有账号？
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                goRegister('pw');
              }}
            >
              去注册
            </a>
          </div>
        </>
      ) : (
        <>
          <Text size="sm" c="dimmed" ta="center">
            使用本机的通行密钥（指纹 / 面容 / PIN）一键登录。
          </Text>
          {!isWebAuthnSupported() && (
            <Text size="xs" c="red" ta="center">
              当前浏览器不支持通行密钥，请使用密码登录。
            </Text>
          )}
          <Button fullWidth loading={busy} onClick={submitPasskey}>
            通行密钥登录
          </Button>
          <div className="auth-hint">
            换了新设备？通行密钥只存在原设备上。
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                goRegister('pk');
              }}
            >
              去注册
            </a>
            ，输入原用户名绑定（有密码可直接绑定，或旧设备确认）。
          </div>
        </>
      )}
    </Stack>
  );
}

// ============ 注册弹窗 ============
// 邀请人 id（来自 ?invite=<uid> 链接，main.tsx 已存 localStorage）：注册时提交，
// 邀请人与被邀请人各得邀请徽章
function getInvitedBy(): number | undefined {
  try {
    const v = localStorage.getItem('zhuge-invite');
    if (v && /^\d{1,10}$/.test(v)) return Number(v);
  } catch {
    /* 忽略 */
  }
  return undefined;
}

function RegisterModal({ initialTab = 'pk' }: { initialTab?: AuthTab }) {
  const [tab, setTab] = useState<AuthTab>(initialTab);
  const [view, setView] = useState<'form' | 'waitingDevice' | 'denied' | 'expired'>('form');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    // StrictMode 下 effect 会 挂载→清理→挂载，必须在这里重置为 true
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const switchTab = (t: AuthTab) => {
    if (busy) return;
    setTab(t);
    setPassword('');
    setPassword2('');
    setView('form');
    // iOS：切到密码页签后聚焦用户名输入框（手势内叫醒键盘 + 弹窗内延迟聚焦兜底）
    if (t === 'pw') {
      wakeIosKeyboard();
      focusModalInput('input[autocomplete="username"]');
    }
  };

  const goLogin = (t: AuthTab) => {
    modals.closeAll();
    openLoginModal(t);
  };

  // ---- 密码注册 ----
  const submitPassword = async () => {
    if (busy) return;
    const name = username.trim();
    if (!name) {
      notifications.show({ message: '用户名不能为空', color: 'red' });
      return;
    }
    if (password.length < 8) {
      notifications.show({ message: '密码至少 8 位', color: 'red' });
      return;
    }
    if (password !== password2) {
      notifications.show({ message: '两次输入的密码不一致', color: 'red' });
      return;
    }
    setBusy(true);
    try {
      const invitedBy = getInvitedBy();
      await api('/register', {
        method: 'POST',
        body: { username: name, password, ...(invitedBy ? { invitedBy } : {}) },
      });
      if (!alive.current) return;
      await refreshUser();
      modals.closeAll();
      if (!alive.current) return;
      // 新手引导：注册即弹三步上手（建角色卡/开戏/滴滴）
      import('../onboarding/onboardingModal').then((m) => m.openOnboardingModal());
    } catch (e) {
      if (!alive.current) return;
      setBusy(false);
      notifications.show({ message: '注册失败：' + errMsg(e), color: 'red' });
    }
  };

  // ---- 通行密钥注册（注册即登录） ----
  // 复用段：startRegistration → finish → 确认用户名 → 刷新用户 → 关闭
  const doFinishRegistration = async (options: RegisterBeginResult, name: string) => {
    const regResult = await startRegistration({ optionsJSON: options });
    if (!alive.current) return;
    await api('/passkey/register/finish', {
      method: 'POST',
      body: { userId: options.userId, response: regResult },
    });
    if (!alive.current) return;
    await api('/me/username', { method: 'POST', body: { username: name } });
    if (!alive.current) return;
    await refreshUser();
    modals.closeAll();
    if (!alive.current) return;
    // 新手引导：注册即弹三步上手（建角色卡/开戏/滴滴）
    import('../onboarding/onboardingModal').then((m) => m.openOnboardingModal());
  };

  // 等待旧设备授权：每 2 秒轮询状态；approved → 带 authToken 走注册流程
  const startDeviceAuthPoll = (requestId: string, name: string) => {
    const poll = async () => {
      if (!alive.current) return;
      try {
        const res = await api<{ status: string }>('/device/auth/' + requestId);
        if (!alive.current) return;
        if (res.status === 'approved') {
          // 旧设备已确认 → 用 authToken 作为验证完成注册
          try {
            const invitedBy = getInvitedBy();
            const options = await api<RegisterBeginResult>('/passkey/register/begin', {
              method: 'POST',
              body: { username: name, authToken: requestId, ...(invitedBy ? { invitedBy } : {}) },
            });
            if (!alive.current) return;
            if (options.needsAuth) {
              // 理论上不会发生（authToken 已有效）；保险起见重新等待
              startDeviceAuthPoll(options.authRequestId || requestId, name);
              return;
            }
            await doFinishRegistration(options, name);
          } catch (e) {
            if (!alive.current) return;
            setBusy(false);
            setView('form');
            notifications.show({ message: '注册失败：' + errMsg(e), color: 'red' });
          }
          return;
        }
        if (res.status === 'denied') {
          setView('denied');
          return;
        }
        if (res.status === 'expired' || res.status === 'invalid') {
          setView('expired');
          return;
        }
        // pending → 继续轮询
        window.setTimeout(poll, 2000);
      } catch {
        // 轮询出错（网络抖动等）→ 稍后重试
        if (!alive.current) return;
        window.setTimeout(poll, 3000);
      }
    };
    window.setTimeout(poll, 2000);
  };

  const submitPasskey = async () => {
    if (busy) return;
    const name = username.trim();
    if (!name) {
      notifications.show({ message: '用户名不能为空', color: 'red' });
      return;
    }
    setBusy(true);
    try {
      const invitedBy = getInvitedBy();
      const options = await api<RegisterBeginResult>('/passkey/register/begin', {
        method: 'POST',
        body: { username: name, password: password || undefined, ...(invitedBy ? { invitedBy } : {}) },
      });
      if (!alive.current) return;
      // 已有账号且无有效验证（密码错误由后端以 400 返回，落在 catch 提示）
      if (options.needsAuth && options.authRequestId) {
        setBusy(false);
        setView('waitingDevice');
        startDeviceAuthPoll(options.authRequestId, name);
        return;
      }
      await doFinishRegistration(options, name);
    } catch (e) {
      if (!alive.current) return;
      setBusy(false);
      notifications.show({ message: '注册失败：' + errMsg(e), color: 'red' });
    }
  };

  if (view === 'waitingDevice') {
    return (
      <Stack align="center" py="md" gap="sm">
        <IconDeviceMobile size={44} stroke={1.5} />
        <Text fw={700} size="lg">
          等待旧设备确认
        </Text>
        <Text size="sm" c="dimmed" ta="center">
          「{username.trim()}」已是已有账号。请在<strong>旧设备</strong>上登录《主格》，确认“新设备请求登录”后，这里会自动继续。
        </Text>
        <Text size="xs" c="dimmed">
          授权请求 10 分钟内有效…
        </Text>
        <Button fullWidth variant="subtle" onClick={() => modals.closeAll()}>
          取消
        </Button>
      </Stack>
    );
  }

  if (view === 'denied') {
    return (
      <Stack align="center" py="md" gap="sm">
        <IconX size={44} stroke={1.5} color="red" />
        <Text fw={700} size="lg">
          授权已拒绝
        </Text>
        <Text size="sm" c="dimmed" ta="center">
          旧设备拒绝了这次登录请求。
        </Text>
        <Button fullWidth onClick={() => setView('form')}>
          重新尝试
        </Button>
        <Button fullWidth variant="subtle" onClick={() => modals.closeAll()}>
          关闭
        </Button>
      </Stack>
    );
  }

  if (view === 'expired') {
    return (
      <Stack align="center" py="md" gap="sm">
        <IconClock size={44} stroke={1.5} />
        <Text fw={700} size="lg">
          授权已过期
        </Text>
        <Text size="sm" c="dimmed" ta="center">
          请求已过期（10 分钟）。请重新尝试注册。
        </Text>
        <Button fullWidth onClick={() => setView('form')}>
          重新尝试
        </Button>
        <Button fullWidth variant="subtle" onClick={() => modals.closeAll()}>
          关闭
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      <Center>
        <IconFingerprint size={40} stroke={1.5} />
      </Center>
      <AuthTabs type="register" active={tab} onChange={switchTab} />
      {tab === 'pw' ? (
        <>
          <TextInput
            placeholder="用户名（1-30 个字符）"
            maxLength={30}
            autoComplete="username"
            autoFocus
            data-autofocus
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitPassword();
            }}
          />
          <TextInput
            type="password"
            placeholder="密码（至少 8 位）"
            maxLength={128}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitPassword();
            }}
          />
          <TextInput
            type="password"
            placeholder="确认密码"
            maxLength={128}
            autoComplete="new-password"
            value={password2}
            onChange={(e) => setPassword2(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitPassword();
            }}
          />
          <Button fullWidth loading={busy} onClick={submitPassword}>
            注册
          </Button>
          <div className="auth-hint">
            已有账号？
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                goLogin('pw');
              }}
            >
              去登录
            </a>
          </div>
        </>
      ) : (
        <>
          <TextInput
            placeholder="用户名（1-30 个字符）"
            maxLength={30}
            autoComplete="username"
            autoFocus
            data-autofocus
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
          />
          <TextInput
            type="password"
            placeholder="（可留空）已有账号？输入密码绑定"
            maxLength={128}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
          {!isWebAuthnSupported() && (
            <Text size="xs" c="red" ta="center">
              当前浏览器不支持通行密钥，请使用密码注册。
            </Text>
          )}
          <Button fullWidth loading={busy} onClick={submitPasskey}>
            注册并创建通行密钥
          </Button>
          <div className="auth-hint">
            指纹 / 面容 / PIN。已有账号？输入原用户名 + 密码即可直接绑定（无需旧设备确认）。
          </div>
        </>
      )}
    </Stack>
  );
}

// ============ 对外入口 ============

/** 打开登录弹窗（默认通行密钥优先） */
export function openLoginModal(tab: AuthTab = 'pk'): void {
  // 全局互斥打开：同 id 防抖 + 关闭动画等待，任意时序下都只出现一个弹窗
  openModalOnce(
    'auth-login',
    (m) => {
      m.open({
        title: '登录《主格》',
        centered: true,
        size: 'sm',
        // 密码页签才有用户名输入框；通行密钥页签无输入框时聚焦自动跳过
        ...focusOnEnter('input[autocomplete="username"]'),
        children: <LoginModal initialTab={tab} />,
      });
    },
    true // 手势内同步叫醒键盘（iOS）
  );
}

/** 打开注册弹窗（默认通行密钥优先） */
export function openRegisterModal(tab: AuthTab = 'pk'): void {
  openModalOnce(
    'auth-register',
    (m) => {
      m.open({
        title: '注册《主格》',
        centered: true,
        size: 'sm',
        // 通行密钥/密码页签都有用户名输入框 → 入场结束聚焦用户名
        ...focusOnEnter('input[autocomplete="username"]'),
        children: <RegisterModal initialTab={tab} />,
      });
    },
    true // 手势内同步叫醒键盘（iOS）
  );
}

/** 需要登录时的提示弹窗：登录 / 注册新账号 / 取消 */
export function requireLogin(action: string): void {
  openModalOnce('require-login', (m) => {
    m.open({
      modalId: 'require-login',
      title: '需要登录',
      centered: true,
      size: 'sm',
      children: (
        <Stack gap="md" pt="xs">
          <Center>
            <IconLock size={40} stroke={1.5} />
          </Center>
          <Text size="sm" ta="center">
            登录后即可{action}。还没有账号？注册只需一步。
          </Text>
          <Button
            fullWidth
            onClick={() => {
              modals.closeAll();
              openLoginModal();
            }}
          >
            登录
          </Button>
          <Button
            fullWidth
            color="clay"
            onClick={() => {
              modals.closeAll();
              openRegisterModal();
            }}
          >
            注册新账号
          </Button>
          <Button fullWidth variant="subtle" onClick={() => modals.closeAll()}>
            取消
          </Button>
        </Stack>
      ),
    });
  });
}
