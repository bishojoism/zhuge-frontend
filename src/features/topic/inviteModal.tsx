// ===== 邀请接戏弹窗（主题作者）：点名邀请用户接自己的戏（一次最多 8 人，被邀请者收到强通知） =====
import { useEffect, useMemo, useState } from 'react';
import { Button, Group, Loader, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api } from '../../api/client';
import { openModalOnce } from '../../lib/modals';
import type { Gender } from '../../types';

interface Candidate {
  id: number;
  username: string;
  avatar_url: string | null;
  gender: Gender | null;
  same_tag: number;
  invited: number;
}

const MAX_INVITE = 8;

export function openInviteModal(discussionId: number, discussionTitle: string): void {
  openModalOnce('invite-rp', (m) => {
    m.open({
      title: `邀请接戏「${discussionTitle.slice(0, 12)}」`,
      size: 440,
      children: <InviteContent discussionId={discussionId} />,
    });
  });
}

function InviteContent({ discussionId }: { discussionId: number }) {
  const [rows, setRows] = useState<Candidate[] | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); // 换一批：重新随机拉取候选

  useEffect(() => {
    setRows(null);
    setSelected(new Set());
    api<{ data: Candidate[] }>(`/discussions/${discussionId}/invite-candidates`)
      .then((r) => setRows(r.data))
      .catch(() => setError(true));
  }, [discussionId, refreshKey]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const kw = q.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter((u) => u.username.toLowerCase().includes(kw));
  }, [rows, q]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_INVITE) next.add(id);
      else {
        notifications.show({ message: `一次最多邀请 ${MAX_INVITE} 人`, color: 'orange' });
        return prev;
      }
      return next;
    });
  };

  const submit = async () => {
    if (!selected.size) return;
    setSending(true);
    try {
      const r = await api<{ data: { invited: { id: number; username: string }[] } }>(
        `/discussions/${discussionId}/invite`,
        { method: 'POST', body: { userIds: [...selected] } }
      );
      notifications.show({
        message: `已邀请 ${r.data.invited.map((x) => x.username).join('、')} 接戏`,
        color: 'green',
      });
      modalsClose();
    } catch (e) {
      notifications.show({ message: e instanceof Error ? e.message : '邀请失败', color: 'red' });
    } finally {
      setSending(false);
    }
  };

  // 关闭弹窗：modals.closeAll（openModalOnce 单例）
  const modalsClose = () => import('@mantine/modals').then((m) => m.modals.closeAll());

  if (error) {
    return (
      <Text size="sm" c="dimmed">
        加载失败
      </Text>
    );
  }
  if (!rows) {
    return (
      <Stack align="center" py="lg">
        <Loader size="sm" />
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      <Text size="xs" c="dimmed">
        点名邀请戏友来接下这出戏（最多 {MAX_INVITE} 人）。被邀请者会收到通知，点击即可看戏接戏。
      </Text>
      <Group justify="space-between" wrap="nowrap" gap={8}>
        <TextInput
          size="sm"
          placeholder="搜索用户名…"
          autoComplete="new-password"
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Button
          size="compact-sm"
          variant="light"
          onClick={() => setRefreshKey((k) => k + 1)}
          loading={!rows}
        >
          🔄 换一批
        </Button>
      </Group>
      {filtered === null || filtered.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="md">
          没有可邀请的用户（30 天内活跃且未被邀请过）
        </Text>
      ) : (
        <Stack gap={4} style={{ maxHeight: 320, overflow: 'auto' }}>
          {filtered.map((u) => {
            const isSelected = selected.has(u.id);
            const disabled = !!u.invited;
            return (
              <Group
                key={u.id}
                gap="sm"
                wrap="nowrap"
                style={{
                  padding: '6px 8px',
                  borderRadius: 8,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.45 : 1,
                  background: isSelected ? 'var(--card-soft, rgba(127,142,163,.12))' : undefined,
                  border: isSelected ? '1px solid var(--primary)' : '1px solid transparent',
                }}
                onClick={() => !disabled && toggle(u.id)}
              >
                {u.avatar_url ? (
                  <img
                    src={u.avatar_url}
                    alt=""
                    style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : (
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: '#8b9cb0',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {(u.username[0] || '?').toUpperCase()}
                  </div>
                )}
                <Text size="sm" fw={500} style={{ flex: 1, minWidth: 0 }} truncate>
                  {u.username}
                </Text>
                {!!u.same_tag && (
                  <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                    同标签
                  </Text>
                )}
                {disabled ? (
                  <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                    已邀请
                  </Text>
                ) : (
                  <Text size="sm" style={{ color: 'var(--primary)', minWidth: 18, textAlign: 'center' }}>
                    {isSelected ? '✓' : ''}
                  </Text>
                )}
              </Group>
            );
          })}
        </Stack>
      )}
      <Group justify="space-between" mt="sm">
        <Text size="xs" c="dimmed">
          已选 {selected.size}/{MAX_INVITE}
        </Text>
        <Group gap={8}>
          <Button variant="default" size="compact-sm" onClick={() => void modalsClose()}>
            取消
          </Button>
          <Button size="compact-sm" onClick={() => void submit()} loading={sending} disabled={!selected.size}>
            发送邀请
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}
