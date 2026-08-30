// ===== 头像 / 性别弹窗 =====
// 注意：Mantine 弹窗内容渲染在 ModalsProvider 下（AuthProvider 之外），
// 因此这里通过 useMe()/SWR 全局缓存读取当前用户，更新后 mutate('/me') 同步。
import { useState } from 'react';
import { Button, Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { mutate } from 'swr';
import { api } from '../../api/client';
import { useMe } from '../../api/hooks';
import { openModalOnce } from '../../lib/modals';
import { avatarUrlOf, initials, pickImageFile, uploadImageFile } from '../../lib/utils';
import type { Gender } from '../../types';

// 性别选项（与后端契约一致）
const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: '♂ 男' },
  { value: 'female', label: '♀ 女' },
  { value: 'other', label: '⚧ 其它' },
  { value: 'secret', label: '保密' },
];

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : '操作失败';
}

// ===== 头像弹窗内容 =====
function AvatarModalContent() {
  const { user } = useMe();
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (uploading) return;
    try {
      const file = await pickImageFile();
      if (!file) return; // 用户取消选择
      if (file.size > 5 * 1024 * 1024) {
        notifications.show({ message: '图片不能超过 5MB', color: 'red' });
        return;
      }
      setUploading(true);
      const url = await uploadImageFile(file); // 上传 → 返回 /img/ 访问 URL
      await api('/me/avatar', { method: 'POST', body: { url } });
      mutate('/me'); // 同步刷新当前用户（AuthContext 同 key 自动更新）
      notifications.show({ message: '头像已更新', color: 'green' });
      modals.closeAll();
    } catch (e) {
      notifications.show({ message: errMessage(e), color: 'red' });
    } finally {
      setUploading(false);
    }
  };

  const avatarUrl = avatarUrlOf(user);

  return (
    <Stack align="center" gap="md" py="xs">
      <span className="avatar-circle" style={{ width: 96, height: 96, fontSize: 40 }}>
        {avatarUrl ? <img src={avatarUrl} alt="当前头像" /> : initials(user?.username || '')}
      </span>
      <Text size="sm" c="dimmed">
        支持 JPG / PNG / GIF / WebP，不超过 5MB
      </Text>
      <Button onClick={handleUpload} loading={uploading} fullWidth>
        选择图片上传
      </Button>
    </Stack>
  );
}

// ===== 性别弹窗内容 =====
function GenderModalContent() {
  const { user } = useMe();
  const [submitting, setSubmitting] = useState<Gender | null>(null);
  const current = user?.gender;

  const handleSelect = async (gender: Gender) => {
    if (submitting) return;
    setSubmitting(gender);
    try {
      await api('/me/gender', { method: 'POST', body: { gender } });
      mutate('/me');
      notifications.show({ message: '性别已更新', color: 'green' });
      modals.closeAll();
    } catch (e) {
      notifications.show({ message: errMessage(e), color: 'red' });
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Stack gap="xs" py="xs">
      <Text size="sm" c="dimmed">
        自由选择，可随时更改
      </Text>
      {GENDER_OPTIONS.map((o) => (
        <Button
          key={o.value}
          variant={current === o.value ? 'filled' : 'default'}
          loading={submitting === o.value}
          disabled={submitting !== null && submitting !== o.value}
          onClick={() => handleSelect(o.value)}
          fullWidth
        >
          {o.label}
        </Button>
      ))}
    </Stack>
  );
}

// ===== 入口 =====
export function openAvatarModal(): void {
  openModalOnce('avatar', (m) => {
    m.open({
      title: '更新头像',
      children: <AvatarModalContent />,
    });
  });
}

export function openGenderModal(): void {
  openModalOnce('gender', (m) => {
    m.open({
      title: '选择性别',
      children: <GenderModalContent />,
    });
  });
}
