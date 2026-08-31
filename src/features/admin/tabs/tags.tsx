// 管理后台 Tab：标签管理（增删改 + 主次/隐藏）
import { useMemo, useState } from 'react';
import { Badge, Button, Group, Loader, Stack, Table, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useAdminTags, refreshListsAfterWrite } from '../../../api/hooks';
import { openPromptModal } from '../../../lib/promptModal';
import {
  type AdminTagRow,
  createAdminTag,
  updateAdminTag,
  deleteAdminTag,
} from '../adminApi';

export function TagsTab() {
  // SWR 缓存：标签列表跨 tab 切换复用；增删改后 mutate
  const { data: rows, mutate } = useAdminTags();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [q, setQ] = useState('');

  const err = (e: unknown) => notifications.show({ message: e instanceof Error ? e.message : '操作失败', color: 'red' });

  // 搜索过滤：名称/描述包含关键词（大小写不敏感）
  const kw = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!rows) return null;
    if (!kw) return rows;
    return rows.filter((t) => t.name.toLowerCase().includes(kw) || (t.description || '').toLowerCase().includes(kw));
  }, [rows, kw]);

  const create = async () => {
    const res = await openPromptModal({
      title: '新建标签',
      fields: [
        { key: 'name', label: '标签名', placeholder: '2-20 字' },
        { key: 'type', label: '类型', type: 'select', options: ['IP 次标签', '主标签'] },
        { key: 'desc', label: '标签描述（可选）', type: 'textarea', placeholder: '一句话描述' },
      ],
      confirmText: '创建',
    });
    if (!res) return;
    const n = (res.name || '').trim();
    if (n.length < 2) {
      notifications.show({ message: '标签名至少 2 个字', color: 'red' });
      return;
    }
    setBusyId(-1);
    try {
      await createAdminTag({ name: n, description: (res.desc || '').trim(), primary: res.type === '主标签' });
      notifications.show({ message: `已创建标签「${n}」`, color: 'green' });
      void mutate();
      void refreshListsAfterWrite(); // 首页标签栏即时出现新标签
    } catch (e) {
      err(e);
    } finally {
      setBusyId(null);
    }
  };

  const rename = async (t: AdminTagRow) => {
    const res = await openPromptModal({
      title: `改名「${t.name}」`,
      fields: [{ key: 'name', label: '新名称', initial: t.name, placeholder: '2-20 字' }],
      confirmText: '保存',
    });
    if (!res) return;
    setBusyId(t.id);
    try {
      await updateAdminTag(t.id, { name: (res.name || '').trim() });
      void mutate();
      void refreshListsAfterWrite(); // 首页标签栏改名即时生效
    } catch (e) {
      err(e);
    } finally {
      setBusyId(null);
    }
  };

  const toggleHide = async (t: AdminTagRow) => {
    setBusyId(t.id);
    try {
      await updateAdminTag(t.id, { is_hidden: !t.is_hidden });
      notifications.show({ message: t.is_hidden ? `已显示「${t.name}」` : `已隐藏「${t.name}」`, color: 'green' });
      void mutate();
      void refreshListsAfterWrite(); // 首页标签栏显隐即时生效
    } catch (e) {
      err(e);
    } finally {
      setBusyId(null);
    }
  };

  const togglePrimary = async (t: AdminTagRow) => {
    setBusyId(t.id);
    try {
      await updateAdminTag(t.id, { primary: !(t.position != null) });
      notifications.show({ message: t.position != null ? `「${t.name}」已改回次标签` : `「${t.name}」已设为主标签`, color: 'green' });
      void mutate();
      void refreshListsAfterWrite(); // 首页标签栏主/次标签即时生效
    } catch (e) {
      err(e);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (t: AdminTagRow) => {
    modals.openConfirmModal({
      title: '删除标签',
      centered: true,
      children: (
        <Text size="sm">
          确定删除「{t.name}」？该标签与主题的关联会被清除，不可恢复。
        </Text>
      ),
      labels: { confirm: '删除', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        setBusyId(t.id);
        try {
          await deleteAdminTag(t.id);
          notifications.show({ message: `已删除「${t.name}」`, color: 'green' });
          void mutate();
          void refreshListsAfterWrite(); // 首页标签栏即时消失
        } catch (e) {
          err(e);
        } finally {
          setBusyId(null);
        }
      },
    });
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={600}>标签管理（{rows ? rows.length : '…'} 个）</Text>
        <Button size="compact-sm" variant="default" loading={busyId === -1} onClick={create}>
          ＋ 新建标签
        </Button>
      </Group>
      <TextInput
        placeholder="搜索标签名 / 描述…"
        autoComplete="off"
        value={q}
        onChange={(e) => setQ(e.currentTarget.value)}
      />
      {rows === undefined ? (
        <Loader size="sm" />
      ) : filtered === null || filtered.length === 0 ? (
        <Text size="sm" c="dimmed">
          无匹配标签
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={620}>
          <Table striped highlightOnHover verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ID</Table.Th>
                <Table.Th>名称</Table.Th>
                <Table.Th>类型</Table.Th>
                <Table.Th>颜色</Table.Th>
                <Table.Th>主题数</Table.Th>
                <Table.Th>状态</Table.Th>
                <Table.Th>操作</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((t) => (
                <Table.Tr key={t.id}>
                  <Table.Td>{t.id}</Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {t.name}
                    </Text>
                    {t.description ? (
                      <Text size="xs" c="dimmed">
                        {t.description}
                      </Text>
                    ) : null}
                  </Table.Td>
                  <Table.Td>{t.position != null ? '主标签' : 'IP 标签'}</Table.Td>
                  <Table.Td>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        background: t.color || '#8b9cb0',
                        border: '1px solid rgba(0,0,0,.15)',
                      }}
                    />
                  </Table.Td>
                  <Table.Td>{t.discussion_count}</Table.Td>
                  <Table.Td>
                    {t.is_hidden ? (
                      <Badge size="xs" color="gray">
                        隐藏
                      </Badge>
                    ) : t.is_restricted ? (
                      <Badge size="xs" color="orange">
                        受限
                      </Badge>
                    ) : (
                      <Badge size="xs" color="green">
                        正常
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      <Button size="compact-xs" variant="subtle" loading={busyId === t.id} onClick={() => rename(t)}>
                        改名
                      </Button>
                      <Button size="compact-xs" variant="subtle" loading={busyId === t.id} onClick={() => togglePrimary(t)}>
                        {t.position != null ? '改次' : '设主'}
                      </Button>
                      <Button size="compact-xs" variant="subtle" loading={busyId === t.id} onClick={() => toggleHide(t)}>
                        {t.is_hidden ? '显示' : '隐藏'}
                      </Button>
                      {t.id !== 1 ? (
                        <Button size="compact-xs" variant="subtle" color="red" loading={busyId === t.id} onClick={() => remove(t)}>
                          删除
                        </Button>
                      ) : null}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
}
