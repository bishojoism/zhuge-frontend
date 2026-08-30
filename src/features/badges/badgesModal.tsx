// ===== 我的徽章弹窗：头像菜单「徽章」入口 =====
// 展示 9 枚徽章（基础/进阶两组，未获得置灰显示条件）+ 邀请好友卡片（复制链接 + 已邀请数）
import { useEffect, useState } from 'react';
import { Button, Divider, Group, Loader, SimpleGrid, Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { api } from '../../api/client';
import { openModalOnce } from '../../lib/modals';
import type { MyBadgesResult } from '../../types';

export function openBadgesModal(userId: number): void {
  openModalOnce('badges', (m) => {
    m.open({
      modalId: 'badges',
      title: '我的徽章',
      centered: true,
      size: 'md',
      children: <BadgesContent userId={userId} />,
    });
  });
}

export function BadgesContent({ userId }: { userId: number }) {
  const [data, setData] = useState<MyBadgesResult | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api<{ data: MyBadgesResult }>('/me/badges')
      .then((r) => setData(r.data))
      .catch(() => setError(true));
  }, []);

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

  const earnedSet = new Set(data.earned.map((e) => e.code));
  const earnedAt = (code: string) => data.earned.find((e) => e.code === code)?.earned_at;
  const base = data.badges.filter((b) => b.tier === 0);
  const adv = data.badges.filter((b) => b.tier === 1);

  // 邀请链接：主站首页带 ?invite=<uid>（前端注册弹窗读取该参数）
  const inviteLink = `${window.location.origin}/?invite=${userId}`;

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      notifications.show({ message: '邀请链接已复制', color: 'green' });
    } catch {
      notifications.show({ message: '复制失败，请手动复制', color: 'red' });
    }
  };

  return (
    <Stack gap="md" py="xs">
      {/* 邀请好友卡片 */}
      <Stack gap={6} style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: '10px 12px' }}>
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" fw={600}>
            🤝 邀请好友
          </Text>
          <Text size="xs" c="dimmed">
            已邀请 {data.inviteCount} 位 · 满 1 位得「以文会友」· 满 3 位得「门庭若市」
          </Text>
        </Group>
        <Group gap={8} wrap="nowrap">
          <Text
            size="xs"
            c="dimmed"
            style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}
          >
            {inviteLink}
          </Text>
          <Button size="compact-sm" variant="default" onClick={copyInvite}>
            复制
          </Button>
        </Group>
      </Stack>

      <Divider label="基础徽章" labelPosition="left" />
      <SimpleGrid cols={3} spacing="sm">
        {base.map((b) => {
          const earned = earnedSet.has(b.code);
          return (
            <Stack
              key={b.code}
              gap={4}
              align="center"
              className="badge-cell"
              style={{
                padding: '10px 4px',
                borderRadius: 10,
                background: earned ? 'var(--card-soft, rgba(127,142,163,0.08))' : 'transparent',
                border: earned ? '1px solid var(--border)' : '1px solid transparent',
              }}
            >
              <Text fz={26} style={{ filter: earned ? 'none' : 'grayscale(1)', opacity: earned ? 1 : 0.4 }} title={earned ? '已获得' : '未获得'}>
                {b.icon}
              </Text>
              <Text size="xs" fw={600} ta="center">
                {b.name}
              </Text>
              <Text size="10" c="dimmed" ta="center" style={{ lineHeight: 1.4, minHeight: 28 }}>
                {b.description}
                {earned && earnedAt(b.code) ? (
                  <>
                    <br />
                    于 {earnedAt(b.code)!.slice(0, 10)} 获得
                  </>
                ) : null}
              </Text>
            </Stack>
          );
        })}
      </SimpleGrid>

      <Divider label="进阶徽章" labelPosition="left" />
      <SimpleGrid cols={3} spacing="sm">
        {adv.map((b) => {
          const earned = earnedSet.has(b.code);
          return (
            <Stack
              key={b.code}
              gap={4}
              align="center"
              className={`badge-cell${earned ? ' earned' : ''}${b.tier === 1 ? ' t1' : ''}`}
              style={{
                padding: '10px 4px',
                borderRadius: 10,
                background: earned ? 'var(--card-soft, rgba(201,138,107,0.1))' : 'transparent',
                border: earned ? '1px solid var(--border)' : '1px solid transparent',
              }}
            >
              <Text fz={26} style={{ filter: earned ? 'none' : 'grayscale(1)', opacity: earned ? 1 : 0.4 }} title={earned ? '已获得' : '未获得'}>
                {b.icon}
              </Text>
              <Text size="xs" fw={600} ta="center">
                {b.name}
              </Text>
              <Text size="10" c="dimmed" ta="center" style={{ lineHeight: 1.4, minHeight: 28 }}>
                {b.description}
                {earned && earnedAt(b.code) ? (
                  <>
                    <br />
                    于 {earnedAt(b.code)!.slice(0, 10)} 获得
                  </>
                ) : null}
              </Text>
            </Stack>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
}
