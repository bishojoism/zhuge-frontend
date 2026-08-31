// ===== 我的主题：我发布的公开主题列表（/my） =====
import { useNavigate } from 'react-router-dom';
import { Button, Group, Loader, Stack, Text } from '@mantine/core';
import { useAuth } from '../auth/AuthContext';
import { useMyDiscussions } from '../../api/hooks';
import { seedTopicCacheFromList } from '../home/composer';
import { openLoginModal, openRegisterModal } from '../auth/authModals';
import { timeAgo } from '../../lib/utils';
import type { MyTopicItem } from '../../types';

export default function MyTopicsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading } = useMyDiscussions();
  const list = data ?? [];

  if (loading || user === undefined) {
    return (
      <Stack align="center" py="xl">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">
          加载中…
        </Text>
      </Stack>
    );
  }

  if (user === null) {
    return (
      <div className="empty" style={{ padding: '60px 0' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
        <div style={{ fontSize: 16, marginBottom: 16 }}>登录后查看你的主题</div>
        <Group justify="center">
          <Button onClick={() => openLoginModal()}>登录</Button>
          <Button color="clay" onClick={() => openRegisterModal()}>
            注册
          </Button>
        </Group>
      </div>
    );
  }

  const openTopic = (d: MyTopicItem) => {
    // 乐观种入详情缓存（用列表数据预填充，跳转后不闪骨架屏）
    seedTopicCacheFromList(d);
    // 预加载详情页 chunk
    void import('../topic/TopicPage');
    navigate(`/d/${d.id}`, { state: { from: '/my' } });
  };

  return (
    <>
      <Button variant="subtle" size="compact-md" mb="sm" onClick={() => navigate('/')}>
        ← 返回
      </Button>
      <Text size="lg" fw={700} mb="md">
        我的主题
      </Text>
      {isLoading && list.length === 0 ? (
        <Stack align="center" py="xl">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            加载中…
          </Text>
        </Stack>
      ) : list.length === 0 ? (
        <div className="empty">还没有发布主题。点导航「＋」开戏，开始你的第一帖吧！</div>
      ) : (
        list.map((t) => (
          <div
            key={t.id}
            className="topic topic-clickable"
            role="link"
            tabIndex={0}
            onClick={() => openTopic(t)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') openTopic(t);
            }}
          >
            <div className="topic-title">{t.title}</div>
            {t.image_url ? (
              <img
                src={t.image_url}
                alt="配图"
                style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8, margin: '8px 0', objectFit: 'cover', display: 'block' }}
                loading="lazy"
              />
            ) : null}
            <div className="topic-meta">
              <span>{timeAgo(t.last_posted_at || t.created_at)}</span>
              <span>{Math.max(0, (t.comment_count ?? 0) - 1)} 接戏</span>
              {t.didi_count > 0 && <span>{t.didi_count} 滴滴</span>}
            </div>
          </div>
        ))
      )}
    </>
  );
}
