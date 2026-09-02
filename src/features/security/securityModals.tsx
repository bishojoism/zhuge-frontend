// ===== 账号安全弹窗：登录密码管理（改/设密码、游客转正） =====
// 密码是唯一登录方式：
//  - 有密码的账号：修改密码需验证当前密码（body.currentPassword）
//  - 游客 / 无密码账号：直接设置新密码（转正），免当前密码
// 单组件内部管理子步骤 state；openSecurityModal() 通过 modals.open 挂载。
import { useEffect, useState } from 'react';
import { Button, Group, PasswordInput, Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { mutate } from 'swr';
import { focusModalInput } from '../../lib/modalFocus';
import { api } from '../../api/client';
import { useSecurity } from '../../api/hooks';
import { openModalOnce } from '../../lib/modals';
import { useAuth } from '../auth/AuthContext';
import type { SecurityInfo } from '../../types';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
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
  const { data: security, mutate: refreshSecurity, isLoading, error } = useSecurity();
  const { user } = useAuth();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const isGuest = !!user?.isGuest;
  // 是否需要输入当前密码：账号有已知密码（非游客随机密码）才验证当前密码
  const needsCurrent = !!security?.hasPassword && !isGuest;

  const goMain = (): void => setShowPasswordForm(false);
  const openPasswordForm = (): void => setShowPasswordForm(true);

  // 保存新密码（P-表单简化：删除冗余的"确认新密码"，与注册去确认密码同源——密码可见性切换已够防误输）
  const savePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
    if (newPassword.length < 8) {
      toast('密码至少 8 位');
      return;
    }
    if (needsCurrent && !currentPassword) {
      toast('请输入当前密码');
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, string> = { newPassword };
      if (currentPassword) body.currentPassword = currentPassword;
      await api('/me/password', { method: 'POST', body });
      toast(needsCurrent ? '密码已更新' : '密码已设置，账号已转正', 'green');
      await refreshSecurity();
      // 转正后刷新当前用户（isGuest 标志等随之更新）
      await mutate('/me').catch(() => {});
      goMain();
    } catch (e) {
      // 直接透出服务端 message
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap={0}>
      {!showPasswordForm ? (
        <MainView
          security={security}
          isLoading={isLoading}
          error={error}
          isGuest={isGuest}
          onRetry={() => void refreshSecurity()}
          onClose={() => modals.closeAll()}
          onEditPassword={openPasswordForm}
        />
      ) : (
        <PasswordForm
          needsCurrent={needsCurrent}
          isGuest={isGuest}
          hasPassword={!!security?.hasPassword}
          busy={busy}
          onSave={(cur, next) => void savePassword(cur, next)}
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
  isGuest: boolean;
  onRetry: () => void;
  onClose: () => void;
  onEditPassword: () => void;
}

function MainView({ security, isLoading, error, isGuest, onRetry, onClose, onEditPassword }: MainViewProps) {
  if (isLoading && !security) {
    return (
      <>
        <Text ta="center" py="lg" c="dimmed" size="sm">
          加载中…
        </Text>
      </>
    );
  }
  if (!security) {
    return (
      <>
        <Text ta="center" c="dimmed" size="sm">
          加载失败：{errMsg(error)}
        </Text>
        <Button fullWidth mt="sm" onClick={onRetry}>
          重试
        </Button>
      </>
    );
  }

  const hasPassword = security.hasPassword;
  return (
    <>
      <Text ta="center" style={{ fontSize: 40, marginBottom: 10 }}>🔐</Text>
      <Text ta="center" fw={700} size="lg" mb="sm">
        账号与安全
      </Text>

      <div className="sec-row">
        <div className="sec-label">
          <b>登录密码</b>
          <div className="sec-sub">{hasPassword ? '已设置' : '未设置'}</div>
        </div>
        <Group gap={6} wrap="nowrap">
          <Button size="xs" variant="subtle" onClick={onEditPassword}>
            {hasPassword ? '修改' : '设置'}
          </Button>
        </Group>
      </div>

      {isGuest && (
        <Text c="dimmed" size="xs" mt="sm">
          游客账号可免当前密码直接设置密码；设置后账号转正，可跨设备登录找回内容。
        </Text>
      )}

      <Button fullWidth mt="md" variant="default" onClick={onClose}>
        关闭
      </Button>
    </>
  );
}

interface PasswordFormProps {
  /** 有密码的正式账号需验证当前密码 */
  needsCurrent: boolean;
  isGuest: boolean;
  hasPassword: boolean;
  busy: boolean;
  onSave: (currentPassword: string, newPassword: string) => void;
  onBack: () => void;
}

function PasswordForm({ needsCurrent, isGuest, hasPassword, busy, onSave, onBack }: PasswordFormProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  // iOS：挂载后延迟聚焦当前密码（或新密码）
  useEffect(() => {
    focusModalInput(needsCurrent ? 'input[autocomplete="current-password"]' : 'input[autocomplete="new-password"]');
  }, [needsCurrent]);

  const title = hasPassword && !isGuest ? '修改密码' : isGuest ? '设置密码（转正账号）' : '设置密码';

  return (
    <>
      <Text ta="center" style={{ fontSize: 40, marginBottom: 10 }}>🔐</Text>
      <Text ta="center" fw={700} size="lg" mb="xs">
        {title}
      </Text>
      {needsCurrent && (
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
        autoFocus={!needsCurrent}
        data-autofocus
        value={next}
        onChange={(e) => setNext(e.currentTarget.value)}
        mb="lg"
        autoComplete="new-password"
      />
      {isGuest && (
        <Text c="dimmed" size="xs" mb="sm">
          游客账号可免当前密码直接设置密码；设置后账号转正，可跨设备登录找回内容。
        </Text>
      )}
      <Button fullWidth onClick={() => onSave(current, next)} loading={busy}>
        保存
      </Button>
      <Button fullWidth mt="xs" variant="default" onClick={onBack} disabled={busy}>
        返回
      </Button>
    </>
  );
}
