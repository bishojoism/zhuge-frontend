// ===== 设备授权弹窗 =====
// 后端 GET /api/device/auth-requests/mine 只返回 pending 请求，
// 批准/拒绝后重新验证列表（该请求随即消失）。
import { useState } from 'react';
import { Button, Group, Loader, Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { mutate } from 'swr';
import { api } from '../../api/client';
import { useDeviceAuthRequests } from '../../api/hooks';
import { openModalOnce } from '../../lib/modals';
import { timeAgo } from '../../lib/utils';
import type { DeviceAuthRequest } from '../../types';

type AuthAction = 'approve' | 'deny';

const ACTION_TOAST: Record<AuthAction, string> = {
  approve: '已允许新设备登录',
  deny: '已拒绝该请求',
};

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : '操作失败';
}

// ===== 弹窗内容 =====
function DeviceAuthsModalContent() {
  const { data: requests, isLoading, error, mutate: refreshRequests } = useDeviceAuthRequests();
  const [processing, setProcessing] = useState<string | null>(null);

  const handleAction = async (r: DeviceAuthRequest, action: AuthAction) => {
    if (processing) return;
    setProcessing(r.id);
    try {
      await api(`/device/auth/${r.id}/${action}`, { method: 'POST' });
      await refreshRequests(); // 该请求已不在 pending 列表
      mutate('/me'); // 未读/徽标等共享缓存同步
      notifications.show({ message: ACTION_TOAST[action], color: 'green' });
    } catch (e) {
      notifications.show({ message: errMessage(e), color: 'red' });
    } finally {
      setProcessing(null);
    }
  };

  if (isLoading && !requests) {
    return (
      <Stack align="center" py="md">
        <Loader size="sm" />
      </Stack>
    );
  }

  if (error && !requests) {
    return (
      <Text size="sm" c="red" py="md">
        {errMessage(error)}
      </Text>
    );
  }

  if (!requests || requests.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="lg">
        没有待处理的设备授权请求
      </Text>
    );
  }

  return (
    <Stack gap="xs" py="xs">
      {requests.map((r) => (
        <Group key={r.id} justify="space-between" wrap="nowrap" py={6}>
          <div style={{ minWidth: 0 }}>
            <Text size="sm" fw={600}>
              📱 {r.requester_label}
            </Text>
            <Text size="xs" c="dimmed">
              {timeAgo(r.created_at)} 发起
            </Text>
          </div>
          <Group gap={6} wrap="nowrap">
            <Button
              size="compact-sm"
              loading={processing === r.id}
              disabled={processing !== null && processing !== r.id}
              onClick={() => handleAction(r, 'approve')}
            >
              批准
            </Button>
            <Button
              size="compact-sm"
              variant="default"
              loading={processing === r.id}
              disabled={processing !== null && processing !== r.id}
              onClick={() => handleAction(r, 'deny')}
            >
              拒绝
            </Button>
          </Group>
        </Group>
      ))}
    </Stack>
  );
}

// ===== 入口 =====
export function openDeviceAuthsModal(): void {
  openModalOnce('device-auths', (m) => {
    m.open({
      title: '设备授权',
      children: <DeviceAuthsModalContent />,
    });
  });
}
