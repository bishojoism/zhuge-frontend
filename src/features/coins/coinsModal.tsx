// ===== 我的格币弹窗：余额 / 累计 / 等级 / 获取方式 =====
import { List, Stack, Text } from '@mantine/core';
import { openModalOnce } from '../../lib/modals';
import { useCoins } from '../../api/hooks';
import { levelLabel } from '../../lib/coins';

export function openCoinsModal(): void {
  openModalOnce('coins-info', (m) => {
    m.open({
      title: '我的格币',
      size: 400,
      children: <CoinsContent />,
    });
  });
}

function CoinsContent() {
  const { data } = useCoins();
  const balance = data?.balance ?? 0;
  const level = data?.level ?? 1;

  return (
    <Stack gap="sm">
      <Text size="sm">
        余额：<Text component="span" fw={700} style={{ color: 'var(--primary)' }}>{balance}</Text> 格币
        {' '}· 等级：<Text component="span" fw={700}>{levelLabel(level)}</Text>
      </Text>
      <Text size="xs" c="dimmed">
        累计获得 {data?.earnedTotal ?? 0} 币（等级按累计计算，不消耗余额；Lv.2 起在帖子作者名旁显示等级徽章）。
      </Text>
      <Text size="sm" fw={600}>
        格币怎么获得
      </Text>
      <List size="xs" spacing={4} c="dimmed">
        <List.Item>每日打开应用：+10 币</List.Item>
        <List.Item>每日首次发帖：+3 币</List.Item>
        <List.Item>每日首次接戏：+2 币</List.Item>
        <List.Item>每日首次滴滴：+2 币</List.Item>
        <List.Item>每日首次点赞/收藏：+1 币</List.Item>
        <List.Item>收到投币/打赏：作者实得面额的 90%（10% 为平台维护税）</List.Item>
      </List>
      <Text size="xs" c="dimmed">
        投币固定 1 币/次；打赏可自定义数额（1-10000）；投币/打赏都会通知对方。
      </Text>
    </Stack>
  );
}
