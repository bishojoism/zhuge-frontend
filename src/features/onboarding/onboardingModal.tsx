// ===== 新手引导弹窗：注册后自动打开，三步上手（角色卡/开戏/滴滴） =====
// 每步实时显示完成状态（SWR 共享缓存），未完成可点"去完成"直达
import { Button, Group, Loader, Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import { fetcher } from '../../api/hooks';
import { openModalOnce } from '../../lib/modals';
import type { CharacterItem } from '../../types';

export function openOnboardingModal(): void {
  openModalOnce('onboarding', (m) => {
    m.open({
      modalId: 'onboarding',
      title: '欢迎来到《主格》',
      centered: true,
      size: 'md',
      children: <OnboardingContent />,
    });
  });
}

function OnboardingContent() {
  const navigate = useNavigate();
  const { data: charsData } = useSWR<{ data: CharacterItem[] }>('/me/characters', fetcher);
  const { data: myTopics } = useSWR<{ data: { id: number }[] }>('/me/discussions', fetcher);
  const { data: privateData } = useSWR<{ data: { id: number }[] }>('/me/private', fetcher);

  const hasChar = (charsData?.data?.length || 0) > 0;
  const hasTopic = (myTopics?.data?.length || 0) > 0;
  const hasDidi = (privateData?.data?.length || 0) > 0;
  const done = [hasChar, hasTopic, hasDidi].filter(Boolean).length;

  const goCharacters = () => {
    modals.closeAll();
    import('../characters/charactersModal').then((m) => m.openCharactersModal());
  };
  const goHome = () => {
    modals.closeAll();
    navigate('/');
  };

  const Step = ({
    num,
    title,
    desc,
    doneFlag,
    action,
    onGo,
  }: {
    num: number;
    title: string;
    desc: string;
    doneFlag: boolean;
    action: string;
    onGo: () => void;
  }) => (
    <Group
      gap="sm"
      wrap="nowrap"
      style={{
        border: doneFlag ? '1px solid var(--st-ok)' : '1px solid var(--border)',
        borderRadius: 12,
        padding: '10px 14px',
        background: doneFlag ? 'rgba(64,150,100,.07)' : 'transparent',
      }}
    >
      <Text fz={20}>{doneFlag ? '✅' : String(num)}</Text>
      <Stack gap={2} style={{ flex: 1 }}>
        <Text size="sm" fw={600}>
          {title}
        </Text>
        <Text size="xs" c="dimmed">
          {desc}
        </Text>
      </Stack>
      {doneFlag ? (
        <Text size="xs" style={{ color: 'var(--st-ok)' }} fw={600}>
          已完成
        </Text>
      ) : (
        <Button size="compact-sm" variant="default" onClick={onGo}>
          {action}
        </Button>
      )}
    </Group>
  );

  return (
    <Stack gap="md" py="xs">
      <Text size="sm">
        完成新手三连，解锁你的第一枚徽章（{done}/3 已完成）：
      </Text>
      <Step
        num={1}
        title="创建角色卡"
        desc="姓名、外貌、人设——让角色替你开口"
        doneFlag={hasChar}
        action="去创建"
        onGo={goCharacters}
      />
      <Step
        num={2}
        title="开一场戏"
        desc="发起你的第一个主题，或去接别人的戏"
        doneFlag={hasTopic}
        action="去开戏"
        onGo={goHome}
      />
      <Step
        num={3}
        title="滴滴私密对戏"
        desc="在帖子下点「滴滴」，创建仅你俩可见的私密主题"
        doneFlag={hasDidi}
        action="去看看"
        onGo={goHome}
      />
      {done < 3 && (
        <Text size="xs" c="dimmed">
          完成后会获得 📜 首开新篇、🎭 初次接戏、💌 初试滴滴徽章。
        </Text>
      )}
      <Group justify="flex-end">
        <Button variant="subtle" size="compact-sm" onClick={() => modals.closeAll()}>
          稍后再说
        </Button>
      </Group>
    </Stack>
  );
}
