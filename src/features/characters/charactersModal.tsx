// ===== 皮（人设表）管理弹窗：头像菜单「皮」入口 =====
import { useEffect, useState } from 'react';
import { ActionIcon, Button, Group, Loader, Select, Stack, Text, TextInput, Textarea, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import useSWR from 'swr';
import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import { api } from '../../api/client';
import { fetcher } from '../../api/hooks';
import { openModalOnce } from '../../lib/modals';
import { pickImageFile, uploadImageFile } from '../../lib/utils';
import type { Gender } from '../../types';

export interface Character {
  id: number;
  name: string;
  gender: Gender | null;
  age: string | null;
  identity: string | null;
  note: string | null;
  appearance: string | null; // 外貌图片 URL
}

// 性别选项（与平台性别徽标一致）
const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: 'other', label: '其他' },
  { value: 'secret', label: '保密' },
];

const GENDER_LABEL: Record<string, string> = { male: '男', female: '女', other: '其他', secret: '保密' };

export function openCharactersModal(): void {
  openModalOnce('characters', (m) => {
    m.open({
      title: '皮',
      size: 520,
      children: <CharactersModalContent />,
    });
  });
}

function CharactersModalContent() {
  // SWR 共享缓存 /me/characters：与开戏/接戏皮选择共用，增删改后 mutate 刷新
  const { data: charsData, mutate } = useSWR<{ data: Character[] }>('/me/characters', fetcher);
  const chars = charsData ? charsData.data : null;
  const [editing, setEditing] = useState<Character | null | 'new'>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    await mutate();
  };

  if (chars === null) {
    return (
      <Stack align="center" py="lg">
        <Loader size="sm" />
      </Stack>
    );
  }

  // ===== 编辑/新建表单（独立组件，保证 hooks 顺序） =====
  if (editing !== null) {
    return <CharacterForm character={editing} onSaved={load} onCancel={() => setEditing(null)} />;
  }

  // ===== 列表视图 =====
  return (
    <Stack gap="sm">
      {chars.length === 0 ? (
        <Text size="sm" c="dimmed">
          还没有皮。创建皮后，开戏/接戏时可以选择"皮上"演绎。
        </Text>
      ) : (
        chars.map((ch) => (
          <Group key={ch.id} justify="space-between" wrap="nowrap">
            <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
              <Text fw={600} size="sm">
                {ch.name}
                {ch.gender && (
                  <Text component="span" size="xs" c="dimmed" ml={6}>
                    {GENDER_LABEL[ch.gender] || ch.gender}
                    {ch.age ? ` · ${ch.age}` : ''}
                  </Text>
                )}
              </Text>
              {ch.appearance ? (
                <img
                  src={ch.appearance}
                  alt={ch.name}
                  style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', marginTop: 2 }}
                  loading="lazy"
                />
              ) : null}
              {ch.identity && (
                <Text size="xs" c="dimmed" lineClamp={1}>
                  身份：{ch.identity}
                </Text>
              )}
            </Stack>
            <Group gap={4}>
              <Tooltip label="编辑">
                <ActionIcon variant="subtle" size="sm" onClick={() => setEditing(ch)} aria-label="编辑皮">
                  <IconEdit size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="删除">
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="sm"
                  aria-label="删除皮"
                  onClick={() => {
                    openModalOnce('confirm-del-char', (m) => {
                      m.openConfirmModal({
                        title: '删除皮',
                        children: <Text size="sm">确定删除皮「{ch.name}」？历史帖子的皮标识会保留文字。</Text>,
                        labels: { confirm: '删除', cancel: '取消' },
                        confirmProps: { color: 'red' },
                        onConfirm: async () => {
                          await api(`/characters/${ch.id}`, { method: 'DELETE' }).catch(() => {});
                          await load();
                        },
                      });
                    });
                  }}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        ))
      )}
      <Button leftSection={<IconPlus size={16} />} variant="light" onClick={() => setEditing('new')}>
        新建皮
      </Button>
    </Stack>
  );
}

function CharacterForm({ character, onSaved, onCancel }: { character: Character | 'new'; onSaved: () => Promise<void>; onCancel: () => void }) {
  const isNew = character === 'new';
  const [name, setName] = useState(isNew ? '' : character.name);
  const [gender, setGender] = useState<Gender | null>(isNew ? null : character.gender || null);
  const [age, setAge] = useState(isNew ? '' : character.age || '');
  const [identity, setIdentity] = useState(isNew ? '' : character.identity || '');
  const [note, setNote] = useState(isNew ? '' : character.note || '');
  const [appearance, setAppearance] = useState(isNew ? '' : character.appearance || '');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handlePickAppearance = async () => {
    const file = await pickImageFile();
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImageFile(file);
      setAppearance(url);
    } catch (e) {
      notifications.show({ color: 'red', message: e instanceof Error ? e.message : '上传失败' });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const body = { name: name.trim(), gender, age, identity, note, appearance };
      if (isNew) {
        await api('/characters', { method: 'POST', body });
      } else {
        await api(`/characters/${character.id}`, { method: 'PUT', body });
      }
      await onSaved();
      onCancel();
    } catch {
      // 保持表单
    } finally {
      setBusy(false);
    }
  };

  // 表单简化：默认只显示必填（姓名）+ 性别；年龄/身份/备注/外貌收进「更多资料」
  const [more, setMore] = useState(false);
  return (
    <Stack gap="sm">
      <TextInput label="姓名" required autoComplete="off" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="如：林晚秋" />
      <Select
        label="性别"
        placeholder="选择"
        data={GENDER_OPTIONS}
        value={gender}
        onChange={(v) => setGender((v as Gender) || null)}
        clearable
      />
      {more ? (
        <>
          <TextInput label="年龄" autoComplete="off" value={age} onChange={(e) => setAge(e.currentTarget.value)} placeholder="如：22" />
          <TextInput label="身份" autoComplete="off" value={identity} onChange={(e) => setIdentity(e.currentTarget.value)} placeholder="如：书院山长之女 / 江湖郎中" />
          <Textarea label="备注" autoComplete="off" value={note} onChange={(e) => setNote(e.currentTarget.value)} placeholder="性格、背景、口头禅等补充…" minRows={2} autosize />
          <Stack gap={6}>
            <Text size="sm">外貌（图片）</Text>
            {appearance ? (
              <div style={{ position: 'relative', display: 'inline-block', alignSelf: 'flex-start' }}>
                <img
                  src={appearance}
                  alt="外貌"
                  style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', display: 'block', border: '1px solid var(--border)' }}
                />
                <ActionIcon
                  variant="filled"
                  color="dark"
                  size="sm"
                  style={{ position: 'absolute', top: 2, right: 2 }}
                  onClick={() => setAppearance('')}
                  aria-label="移除外貌图片"
                >
                  ✕
                </ActionIcon>
              </div>
            ) : (
              <Button variant="subtle" size="compact-sm" loading={uploading} onClick={handlePickAppearance}>
                🖼 上传外貌图片
              </Button>
            )}
            <Text size="xs" c="dimmed">
              开戏选择此皮后，帖子里的头像/性别/名字会显示成皮的样子
            </Text>
          </Stack>
        </>
      ) : null}
      <Button variant="subtle" size="compact-sm" onClick={() => setMore((v) => !v)}>
        {more ? '更少资料 ▴' : '更多资料（年龄 / 身份 / 备注 / 外貌）▾'}
      </Button>
      <Group justify="flex-end" mt="xs">
        <Button variant="subtle" onClick={onCancel}>
          取消
        </Button>
        <Button onClick={save} loading={busy} disabled={!name.trim()}>
          保存
        </Button>
      </Group>
    </Stack>
  );
}
