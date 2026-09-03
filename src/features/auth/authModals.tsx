// ===== 认证弹窗：登录 / 注册 / 需要登录（纯密码） =====
// 契约：
//  openLoginModal()        打开登录弹窗（密码登录）
//  openRegisterModal()     打开注册弹窗（密码注册）
//  requireLogin(action)    需要登录时的提示弹窗
// 所有打开统一走 openModalOnce（全局互斥：同 id 防抖 + closeAll 后等退出动画再打开）
import { useEffect, useRef, useState } from 'react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { Button, Center, Stack, Text, TextInput } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { mutate } from 'swr';
import { focusOnEnter } from '../../lib/modalFocus';
import { openModalOnce } from '../../lib/modals';
import { readInvitedBy, consumeInvite } from '../../lib/invite';
import { api } from '../../api/client';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// 认证成功后的收尾：刷新当前用户并关闭所有弹窗。
// 注意：@mantine/modals 的弹窗内容渲染在 ModalsProvider 子树里（AuthProvider 之外），
// 拿不到 useAuth() 的 context；refresh 等价于 useMe().mutate()，
// 这里用 SWR 全局 mutate('/me')（main.tsx 的 SWRConfig 未自定义 cache，全局缓存共享）。
async function refreshUser(): Promise<void> {
  await mutate('/me');
}

// ============ 登录弹窗（密码登录） ============
function LoginModal() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    // StrictMode 下 effect 会 挂载→清理→挂载，必须在这里重置为 true
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const goRegister = () => {
    modals.closeAll();
    openRegisterModal();
  };

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

  return (
    <Stack gap="sm">
      <Center>
        <IconLock size={40} stroke={1.5} />
      </Center>
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
            goRegister();
          }}
        >
          去注册
        </a>
      </div>
    </Stack>
  );
}

// ============ 注册弹窗（密码注册） ============
// 邀请人 id（来自 ?invite=<uid> 链接，main.tsx 已存 localStorage）：注册时提交，
// 邀请人与被邀请人各得邀请徽章；0 步自动注册（AuthContext）同样携带并消费

function RegisterModal() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    // StrictMode 下 effect 会 挂载→清理→挂载，必须在这里重置为 true
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const goLogin = () => {
    modals.closeAll();
    openLoginModal();
  };

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
    setBusy(true);
    try {
      const invitedBy = readInvitedBy();
      await api('/register', {
        method: 'POST',
        body: { username: name, password, ...(invitedBy ? { invitedBy } : {}) },
      });
      if (invitedBy) consumeInvite(); // 注册成功即消费（单设备一次邀请）
      if (!alive.current) return;
      await refreshUser();
      modals.closeAll();
      if (!alive.current) return;
    } catch (e) {
      if (!alive.current) return;
      setBusy(false);
      notifications.show({ message: '注册失败：' + errMsg(e), color: 'red' });
    }
  };

  return (
    <Stack gap="sm">
      <Center>
        <IconLock size={40} stroke={1.5} />
      </Center>
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
      <Button fullWidth loading={busy} onClick={submitPassword}>
        注册
      </Button>
      <div className="auth-hint">
        已有账号？
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            goLogin();
          }}
        >
          去登录
        </a>
      </div>
    </Stack>
  );
}

// ============ 对外入口 ============

/** 打开登录弹窗（密码登录） */
export function openLoginModal(): void {
  // 全局互斥打开：同 id 防抖 + 关闭动画等待，任意时序下都只出现一个弹窗
  openModalOnce(
    'auth-login',
    (m) => {
      m.open({
        title: '登录《主格》',
        centered: true,
        size: 'sm',
        // 弹窗入场结束聚焦用户名输入框
        ...focusOnEnter('input[autocomplete="username"]'),
        children: <LoginModal />,
      });
    },
    true // 手势内同步叫醒键盘（iOS）
  );
}

/** 打开注册弹窗（密码注册） */
export function openRegisterModal(): void {
  openModalOnce(
    'auth-register',
    (m) => {
      m.open({
        title: '注册《主格》',
        centered: true,
        size: 'sm',
        // 弹窗入场结束聚焦用户名输入框
        ...focusOnEnter('input[autocomplete="username"]'),
        children: <RegisterModal />,
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
