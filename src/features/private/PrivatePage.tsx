// ===== 我的滴滴：私密主题列表页（/private）+ 响应率 + 滴滴状态 =====
import { useNavigate } from 'react-router-dom';
import { Button, Group, Loader, Stack, Text } from '@mantine/core';
import { useAuth } from '../auth/AuthContext';
import { usePrivateList, useTags } from '../../api/hooks';
import { seedTopicCacheFromList } from '../home/composer';
import { openLoginModal, openRegisterModal } from '../auth/authModals';
import { timeAgo } from '../../lib/utils';
import { levelLabel, levelOf } from '../../lib/coins';
import Avatar from '../../components/Avatar';
import TripleActions from '../../components/TripleActions';
import { openAuthorDidiStats } from './authorDidiStats';
import type { DidiStats, PrivateItem } from '../../types';

// 滴滴状态徽标
export function didiStatusBadge(status?: 'accepted' | 'declined' | null): { label: string; cls: string } | null {
  if (status === 'accepted') return { label: '已接', cls: 'didi-ok' };
  if (status === 'declined') return { label: '婉拒', cls: 'didi-no' };
  return null;
}
export default function PrivatePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading } = usePrivateList();
  const { tags } = useTags();
  const list = data?.data ?? [];
  const stats: DidiStats | undefined = data?.meta?.didiStats;

  // 认证/列表加载中
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

  // 未登录：登录/注册引导
  if (user === null) {
    return (
      <div className="empty" style={{ padding: '60px 0' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
        <div style={{ fontSize: 16, marginBottom: 16 }}>登录后查看你的私密主题</div>
        <Group justify="center">
          <Button onClick={() => openLoginModal()}>登录</Button>
          <Button color="clay" onClick={() => openRegisterModal()}>
            注册
          </Button>
        </Group>
      </div>
    );
  }

  const openTopic = (d: PrivateItem) => {
    // 乐观种入详情缓存（私密主题列表数据预填充，跳转后不闪骨架屏）
    seedTopicCacheFromList({ ...d, is_private: 1 }, tags);
    // 预加载详情页 chunk
    void import('../topic/TopicPage');
    navigate(`/d/${d.id}`, { state: { from: '/private' } });
  };

  const acceptedRate = stats && stats.total > 0 ? Math.round((stats.accepted / stats.total) * 100) : null;

  return (
    <>
      <Button variant="subtle" size="compact-md" mb="sm" onClick={() => navigate('/')}>
        ← 返回
      </Button>
      <Group justify="space-between" align="baseline" mb="md">
        <Text size="lg" fw={700}>
          我的滴滴
        </Text>
        {stats && stats.total > 0 && (
          <Text size="xs" c="dimmed">
            作为被滴滴方：共 {stats.total} 次 · 已接 {stats.accepted} · 婉拒 {stats.declined} · 待回应{' '}
            {stats.pending} · 接戏率 {acceptedRate}%
          </Text>
        )}
      </Group>
      {isLoading && list.length === 0 ? (
        <Stack align="center" py="xl">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            加载中…
          </Text>
        </Stack>
      ) : list.length === 0 ? (
        <div className="empty">还没有私密主题。去帖子下点「滴滴（私服）」创建吧！</div>
      ) : (
        list.map((t) => {
          const badge = didiStatusBadge(t.didi_status);
          return (
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
              <div className="topic-title">
                {t.title}
                {badge && <span className={`didi-badge ${badge.cls}`}>{badge.label}</span>}
              </div>
              {t.image_url ? (
                <img
                  src={t.image_url}
                  alt="配图"
                  style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8, margin: '8px 0', objectFit: 'cover', display: 'block' }}
                  loading="lazy"
                />
              ) : null}
              <div className="topic-meta">
                <Avatar user={t} size="sm" showGender />
                <span
                  className="author-link"
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    openAuthorDidiStats(t.user_id, t.author || '?');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation();
                      openAuthorDidiStats(t.user_id, t.author || '?');
                    }
                  }}
                  style={{ fontWeight: 600, color: 'var(--text)' }}
                >
                  {t.author || '?'}
                  {/* 等级徽章（对方累计获得格币档位，Lv.2 起显示） */}
                  {levelOf(t.author_earned) > 1 && (
                    <span
                      style={{
                        fontSize: 10,
                        background: 'linear-gradient(135deg,#c9a86b,#8b7b4a)',
                        color: '#fff',
                        borderRadius: 8,
                        padding: '1px 6px',
                        marginLeft: 4,
                        verticalAlign: 'middle',
                      }}
                      title={`等级 ${levelLabel(levelOf(t.author_earned))}（累计获得格币）`}
                    >
                      {levelLabel(levelOf(t.author_earned))}
                    </span>
                  )}
                </span>
                <span>{timeAgo(t.last_posted_at || t.created_at)}</span>
                <span>{Math.max(0, (t.comment_count ?? 0) - 1)} 接戏</span>
                <span className="private-badge">私密</span>
              </div>
              {/* 私密主题的三连（点赞/收藏/投币针对首帖；私密内也可互动） */}
              <TripleActions postId={t.first_post_id} authorId={t.user_id} initial={t} />
            </div>
          );
        })
      )}
    </>
  );
}
