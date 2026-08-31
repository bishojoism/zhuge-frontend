// ===== 打赏弹窗：自定义格币数额（税 10%，作者实得面额 90%） =====
import { useState } from 'react';
import { Button, Group, NumberInput, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { mutate as globalMutate } from 'swr';
import { api } from '../../api/client';
import { useCoins } from '../../api/hooks';
import { openModalOnce } from '../../lib/modals';
import type { CoinInfo } from '../../types';

export function openTipModal(postId: number, authorName: string, onDone?: () => void): void {
  openModalOnce('tip-rp', (m) => {
    m.open({
      title: `打赏 ${authorName}`,
      size: 380,
      children: <TipContent postId={postId} onDone={onDone} />,
    });
  });
}

function TipContent({ postId, onDone }: { postId: number; onDone?: () => void }) {
  const { data: coins } = useCoins();
  const [amount, setAmount] = useState<number | string>(10);
  const [sending, setSending] = useState(false);

  const balance = coins?.balance ?? 0;
  const num = Math.round(Number(amount));
  const valid = Number.isFinite(num) && num >= 1 && num <= 10000 && num <= balance;

  const submit = async () => {
    if (!valid || sending) return;
    setSending(true);
    try {
      const r = await api<{ ok: boolean; net: number; tax: number }>(`/posts/${postId}/tip`, {
        method: 'POST',
        body: { amount: num },
      });
      notifications.show({ message: `已打赏 ${num} 格币（作者实得 ${r.net}）`, color: 'green' });
      // 刷新余额与帖子投币计数
      void globalMutate<CoinInfo>('/me/coins');
      onDone?.();
      const m = await import('@mantine/modals');
      m.modals.closeAll();
    } catch (e) {
      notifications.show({ message: e instanceof Error ? e.message : '打赏失败', color: 'red' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        你的格币余额：<Text component="span" fw={700} style={{ color: 'var(--primary)' }}>{balance}</Text>
        （每日打开应用自动获得，发帖/接戏/滴滴也有奖励）
      </Text>
      <Text size="xs" c="dimmed">
        打赏面额的 10% 作为平台维护税，作者实得 {num >= 1 ? Math.round(num * 0.9 * 10) / 10 : '—'} 格币。
      </Text>
      <NumberInput
        label="打赏数额（格币）"
        min={1}
        max={10000}
        value={amount}
        onChange={(v) => setAmount(v ?? '')}
        autoFocus
        data-autofocus
      />
      <Group justify="flex-end" mt="sm">
        <Button variant="default" size="compact-sm" onClick={() => void import('@mantine/modals').then((m) => m.modals.closeAll())}>
          取消
        </Button>
        <Button size="compact-sm" onClick={() => void submit()} loading={sending} disabled={!valid}>
          打赏 {num >= 1 ? num : ''} 币
        </Button>
      </Group>
    </Stack>
  );
}
