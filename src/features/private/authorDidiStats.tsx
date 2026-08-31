// ===== 作者名片弹窗（点击作者名）：角色信息 → 作者（皮下）信息 → 滴滴统计 → 屏蔽 =====
import { useEffect, useState } from 'react';
import { Button, Divider, Group, Loader, Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { api } from '../../api/client';
import { openModalOnce } from '../../lib/modals';
import { refreshListsAfterWrite } from '../../api/hooks';
import { useAuth } from '../auth/AuthContext';
import type { Gender } from '../../types';

interface CharacterInfo {
  id: number;
  name: string;
  gender: Gender | null;
  age: string | null;
  identity: string | null;
  note: string | null;
  appearance: string | null;
}

interface AuthorCardData {
  user: { id: number; username: string; avatar_url: string | null; gender: string | null };
  character: CharacterInfo | null;
  badges: { code: string; name: string; description: string; icon: string; tier: number }[];
  didiStats: { total: number; accepted: number; declined: number; pending: number; rate: number | null };
  /** 当前登录用户是否已屏蔽该名片用户 */
  blocked?: boolean;
}

const GENDER_LABEL: Record<string, string> = { male: '男', female: '女', other: '其他', secret: '保密' };

export function openAuthorDidiStats(userId: number, username: string, characterId?: number | null): void {
  openModalOnce('author-didi-stats', (m) => {
    m.open({
      title: `${username} 的名片`,
      size: 420,
      children: <AuthorCardContent userId={userId} characterId={characterId || null} />,
    });
  });
}

function AuthorCardContent({ userId, characterId }: { userId: number; characterId: number | null }) {
  const { user } = useAuth();
  const isSelf = !!user && user.id === userId;
  const [data, setData] = useState<AuthorCardData | null>(null);
  const [error, setError] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const qs = new URLSearchParams({ userId: String(userId) });
    if (characterId) qs.set('characterId', String(characterId));
    api<{ data: AuthorCardData }>(`/author-card?${qs.toString()}`)
      .then((r) => {
        setData(r.data);
        setBlocked(!!r.data.blocked);
      })
      .catch(() => setError(true));
  }, [userId, characterId]);

  // 屏蔽 / 取消屏蔽：屏蔽后该用户主题/帖子/通知全站不显示
  const toggleBlock = async () => {
    setBusy(true);
    try {
      if (blocked) {
        await api(`/me/blocks/${userId}`, { method: 'DELETE' });
        setBlocked(false);
        notifications.show({ message: `已取消屏蔽 ${data?.user.username || ''}` });
      } else {
        await api('/me/blocks', { method: 'POST', body: { userId } });
        setBlocked(true);
        notifications.show({ message: `已屏蔽 ${data?.user.username || ''}，其主题/帖子/通知不再显示` });
        void refreshListsAfterWrite(); // 屏蔽后列表立即移除其内容
      }
    } catch (e) {
      notifications.show({ message: e instanceof Error ? e.message : '操作失败', color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <Text size="sm" c="dimmed">
        加载失败
      </Text>
    );
  }
  if (!data) {
    return (
      <Stack align="center" py="lg">
        <Loader size="sm" />
      </Stack>
    );
  }

  const s = data.didiStats;
  return (
    <Stack gap="sm" py="xs">
      {/* 1) 角色信息（该帖以角色身份发布时） */}
      {data.character && (
        <>
          <Group gap="sm" wrap="nowrap" align="flex-start">
            {data.character.appearance ? (
              <img
                src={data.character.appearance}
                alt={data.character.name}
                style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
              />
            ) : (
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg,#8b9cb0,#64788f)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 20,
                  flexShrink: 0,
                }}
              >
                {data.character.name[0]}
              </div>
            )}
            <Stack gap={2}>
              <Text fw={700} size="md">
                {data.character.name}
                <Text component="span" size="xs" c="dimmed" ml={6}>
                  角色
                </Text>
              </Text>
              <Text size="xs" c="dimmed">
                性别 {data.character.gender ? GENDER_LABEL[data.character.gender] || data.character.gender : '保密'}
                {data.character.age ? ` · 年龄 ${data.character.age}` : ''}
              </Text>
              {data.character.identity && (
                <Text size="xs" c="dimmed">
                  身份：{data.character.identity}
                </Text>
              )}
              {data.character.note && (
                <Text size="xs" c="dimmed">
                  备注：{data.character.note}
                </Text>
              )}
            </Stack>
          </Group>
          <Divider my={4} />
        </>
      )}

      {/* 2) 作者（皮下）信息 */}
      <Group gap="sm" wrap="nowrap">
        {data.user.avatar_url ? (
          <img
            src={data.user.avatar_url}
            alt={data.user.username}
            style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: '#8b9cb0',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {(data.user.username[0] || '?').toUpperCase()}
          </div>
        )}
        <Stack gap={2}>
          <Text fw={600} size="sm">
            {data.user.username}
            <Text component="span" size="xs" c="dimmed" ml={6}>
              作者（皮下）
            </Text>
          </Text>
          <Text size="xs" c="dimmed">
            性别 {data.user.gender ? GENDER_LABEL[data.user.gender] || data.user.gender : '保密'}
          </Text>
        </Stack>
      </Group>
      <Divider my={4} />

      {/* 2.5) 徽章（已获得成就，含含义说明；进阶徽章 t1 带发光特效） */}
      {data.badges && data.badges.length > 0 && (
        <>
          <Group gap={8} wrap="wrap">
            {data.badges.map((b) => (
              <Stack
                key={b.code}
                gap={2}
                align="center"
                className={`badge-card${b.tier === 1 ? ' t1' : ''}`}
                style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '6px 10px', maxWidth: 130 }}
              >
                <Group gap={4} wrap="nowrap">
                  <Text fz={15}>{b.icon}</Text>
                  <Text size="xs" fw={600}>
                    {b.name}
                  </Text>
                </Group>
                <Text size="10" c="dimmed" ta="center" style={{ lineHeight: 1.4 }}>
                  {b.description}
                </Text>
              </Stack>
            ))}
          </Group>
          <Divider my={4} />
        </>
      )}

      {/* 3) 滴滴统计 */}
      <Stack gap={2}>
        <Text size="sm">
          共被滴滴 <Text component="span" fw={700}>{s.total}</Text> 次
          {s.rate !== null && (
            <>
              {' '}· 接戏率{' '}
              <Text
                component="span"
                fw={700}
                style={{ color: s.rate >= 60 ? 'var(--st-ok)' : s.rate >= 30 ? 'var(--st-warn)' : 'var(--st-danger)' }}
              >
                {s.rate}%
              </Text>
            </>
          )}
        </Text>
        <Text size="sm">
          已接 <Text component="span" style={{ color: 'var(--st-ok)' }} fw={600}>{s.accepted}</Text>
          {' '}· 婉拒 <Text component="span" style={{ color: 'var(--st-danger)' }} fw={600}>{s.declined}</Text>
          {' '}· 待回应 <Text component="span" c="dimmed" fw={600}>{s.pending}</Text>
        </Text>
        <Text size="xs" c="dimmed">
          接戏率 = 已接 / 被滴滴总数。滴滴前先看看对方的接戏习惯吧。
        </Text>
      </Stack>

      {/* 4) 屏蔽操作：屏蔽后该用户主题/帖子/通知全站不显示 */}
      {isSelf ? null : (
        <>
          <Divider my={2} />
          <Button
            variant={blocked ? 'filled' : 'light'}
            color={blocked ? 'gray' : 'red'}
            fullWidth
            loading={busy}
            onClick={() => {
              // 屏蔽确认（取消屏蔽直接执行）
              if (blocked) {
                void toggleBlock();
                return;
              }
              modals.openConfirmModal({
                title: '屏蔽用户',
                centered: true,
                children: (
                  <Text size="sm">
                    屏蔽后，{data.user.username} 的主题、帖子、通知将不再显示。此操作可随时取消。
                  </Text>
                ),
                labels: { confirm: '屏蔽', cancel: '取消' },
                confirmProps: { color: 'red' },
                onConfirm: () => void toggleBlock(),
              });
            }}
          >
            {blocked ? '已屏蔽（点击取消）' : '屏蔽该用户'}
          </Button>
        </>
      )}
    </Stack>
  );
}
