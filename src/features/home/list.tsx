// ===== 列表模式（最新/热门）：.topic 卡片 + 底部无限滚动哨兵 =====
import { useEffect, useRef, useState } from 'react';
import type { CoinInfo, Discussion, Tag } from '../../types';
import { displayName, imgSrc, tagColorOf, tagTextColorOf, timeAgo } from '../../lib/utils';
import { collapseIosUrlBar, isIosUrlBarCollapsing } from '../../lib/iosUrlBar';
import { api } from '../../api/client';
import { notifications } from '@mantine/notifications';
import { mutate as globalMutate } from 'swr';
import { requireLogin } from '../auth/authModals';
import { useAuth } from '../auth/AuthContext';
import Avatar from '../../components/Avatar';
import { openShareModal } from '../share/shareModals';
import { openAuthorDidiStats } from '../private/authorDidiStats';
import { parseBBCodeExcerpt } from '../../lib/bbcode';

interface ListViewProps {
  items: Discussion[];
  tags: Tag[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onOpenTopic: (id: number) => void;
}

export default function ListView({
  items,
  tags,
  hasMore,
  loadingMore,
  onLoadMore,
  onOpenTopic,
}: ListViewProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 哨兵：距视口底部还有约 4 个屏幕高度时就预取下一页（一页 50 条，剩 1/3 左右预取）
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const preloadGap = Math.max(window.innerHeight * 4, 3000);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          onLoadMore();
        }
      },
      { rootMargin: `0px 0px ${preloadGap}px 0px` }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  return (
    <>
      {items.map((d) => (
        <TopicCard key={d.id} d={d} tags={tags} onOpenTopic={onOpenTopic} />
      ))}
      <div ref={sentinelRef} className="load-more">
        {loadingMore ? '加载中…' : hasMore ? '继续上滑加载更多' : '没有更多了'}
      </div>
    </>
  );
}

// ===== 列表卡片（全局搜索弹窗等复用） =====
export function TopicCard({
  d,
  tags,
  onOpenTopic,
}: {
  d: Discussion;
  tags: Tag[];
  onOpenTopic: (id: number) => void;
}) {
  const excerpt = (d.excerpt || '').replace(/\s+/g, ' ').trim();
  const tagNames = (d.tags || '')
    .split(' / ')
    .map((s) => s.trim())
    .filter(Boolean);
  const { user } = useAuth();
  const postId = d.first_post_id;

  // 一键三连（点赞/收藏/投币，本地乐观更新）
  const [liked, setLiked] = useState(!!d.liked);
  const [favorited, setFavorited] = useState(!!d.favorited);
  const [likeCount, setLikeCount] = useState(d.like_count || 0);
  const [favCount, setFavCount] = useState(d.favorite_count || 0);
  const [coinCount, setCoinCount] = useState(d.coin_count || 0);
  const [busy, setBusy] = useState(false);

  const toastReward = (kind: string, amount?: number | null) => {
    if (amount) {
      notifications.show({ message: `🎉 首次${kind} +${amount} 格币`, color: 'green' });
      void globalMutate<CoinInfo>('/me/coins');
    }
  };

  const interact = async (kind: 'like' | 'favorite' | 'coin') => {
    if (!postId) return;
    if (!user) {
      requireLogin('互动');
      return;
    }
    setBusy(true);
    try {
      if (kind === 'like') {
        const next = !liked;
        setLiked(next);
        setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
        const r = await api<{ active: boolean; coinReward?: number | null }>(`/posts/${postId}/like`, { method: 'POST' });
        if (r.active !== next) {
          setLiked(r.active);
          setLikeCount((c) => Math.max(0, c + (r.active ? 1 : -1)));
        }
        toastReward('点赞', r.coinReward);
      } else if (kind === 'favorite') {
        const next = !favorited;
        setFavorited(next);
        setFavCount((c) => Math.max(0, c + (next ? 1 : -1)));
        const r = await api<{ active: boolean; coinReward?: number | null }>(`/posts/${postId}/favorite`, { method: 'POST' });
        if (r.active !== next) {
          setFavorited(r.active);
          setFavCount((c) => Math.max(0, c + (r.active ? 1 : -1)));
        }
        toastReward('收藏', r.coinReward);
      } else {
        setCoinCount((c) => c + 1);
        try {
          const r = await api<{ coinReward?: number | null }>(`/posts/${postId}/coin`, { method: 'POST' });
          notifications.show({ message: '已投币 1 格币' });
          if (r.coinReward) {
            notifications.show({ message: `🎉 首次投币 +${r.coinReward} 格币`, color: 'green' });
          }
          void globalMutate<CoinInfo>('/me/coins');
        } catch (e) {
          setCoinCount((c) => Math.max(0, c - 1));
          notifications.show({ message: e instanceof Error ? e.message : '投币失败', color: 'red' });
        }
      }
    } catch (e) {
      if (kind === 'like') {
        setLiked((v) => !v);
        setLikeCount((c) => Math.max(0, c + (liked ? 1 : -1)));
      } else if (kind === 'favorite') {
        setFavorited((v) => !v);
        setFavCount((c) => Math.max(0, c + (favorited ? 1 : -1)));
      }
      notifications.show({ message: e instanceof Error ? e.message : '操作失败', color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  // 一键三连：点赞 + 收藏 + 投币（已做的跳过；允许给自己）——全乐观：先本地点亮/计数，再后台请求，失败单项回滚
  const doTriple = async () => {
    if (!postId) return;
    if (!user) {
      requireLogin('互动');
      return;
    }
    setBusy(true);
    let coinOk = true;
    const needLike = !liked;
    const needFav = !favorited;
    // 乐观：立即点亮状态与计数
    if (needLike) {
      setLiked(true);
      setLikeCount((c) => c + 1);
    }
    if (needFav) {
      setFavorited(true);
      setFavCount((c) => c + 1);
    }
    setCoinCount((c) => c + 1);
    try {
      if (needLike) {
        try {
          const r = await api<{ active: boolean; coinReward?: number | null }>(`/posts/${postId}/like`, { method: 'POST' });
          if (!r.active) {
            setLiked(false);
            setLikeCount((c) => Math.max(0, c - 1));
          }
          toastReward('点赞', r.coinReward);
        } catch {
          setLiked(false);
          setLikeCount((c) => Math.max(0, c - 1));
        }
      }
      if (needFav) {
        try {
          const r = await api<{ active: boolean; coinReward?: number | null }>(`/posts/${postId}/favorite`, { method: 'POST' });
          if (!r.active) {
            setFavorited(false);
            setFavCount((c) => Math.max(0, c - 1));
          }
          toastReward('收藏', r.coinReward);
        } catch {
          setFavorited(false);
          setFavCount((c) => Math.max(0, c - 1));
        }
      }
      try {
        const r = await api<{ coinReward?: number | null }>(`/posts/${postId}/coin`, { method: 'POST' });
        if (r.coinReward) {
          notifications.show({ message: `🎉 首次投币 +${r.coinReward} 格币`, color: 'green' });
        }
        void globalMutate<CoinInfo>('/me/coins');
      } catch {
        coinOk = false;
        setCoinCount((c) => Math.max(0, c - 1));
      }
      notifications.show({
        message: coinOk ? '一键三连完成 🎉' : '已点赞收藏，投币失败（余额不足？）',
        color: coinOk ? 'green' : 'orange',
      });
    } catch (e) {
      notifications.show({ message: e instanceof Error ? e.message : '三连失败', color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="topic topic-clickable"
      role="link"
      tabIndex={0}
      onClick={() => onOpenTopic(d.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpenTopic(d.id);
      }}
    >
      <div className="topic-title">{d.title}</div>
      {d.image_url ? (
        <img
          src={imgSrc(d.image_url, 480) || d.image_url}
          alt="配图"
          style={{
            maxWidth: '100%',
            maxHeight: 180,
            borderRadius: 8,
            margin: '8px 0',
            objectFit: 'cover',
            display: 'block',
          }}
          loading="lazy"
        />
      ) : null}
      {excerpt ? (
        <div className="topic-excerpt">{parseBBCodeExcerpt(excerpt)}</div>
      ) : null}
      <div className="topic-meta">
        <span className="avatar-wrap">
          <Avatar user={d} size="sm" showGender />
        </span>
        <span
          className="author-link"
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            openAuthorDidiStats(d.user_id, displayName(d), d.first_character_id);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.stopPropagation();
              openAuthorDidiStats(d.user_id, displayName(d), d.first_character_id);
            }
          }}
          style={{ fontWeight: 600, color: 'var(--text)' }}
        >
          {displayName(d)}
        </span>
        <span>{timeAgo(d.last_posted_at || d.created_at)}</span>
        <span>{Math.max(0, (d.comment_count ?? 0) - 1)} 接戏</span>
        {d.didi_count > 0 ? <span>{d.didi_count} 滴滴</span> : null}
        {!!d.is_private ? <span className="private-badge">私密</span> : null}
        {tagNames.length ? (
          <span className="topic-tags">
            {tagNames.map((n) => {
              const bg = tagColorOf(tags, n);
              return (
                <span key={n} className="mini-tag" style={{ background: bg, color: tagTextColorOf(bg) }}>
                  {n}
                </span>
              );
            })}
          </span>
        ) : null}
      </div>
      {/* 一键三连（点赞/收藏/投币，针对首帖） */}
      {postId ? (
        <div className="topic-actions" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="topic-act triple-main" disabled={busy} onClick={() => void doTriple()}>
            🎉 三连
          </button>
          <button
            type="button"
            className={`topic-act${liked ? ' on' : ''}`}
            disabled={busy}
            onClick={() => void interact('like')}
          >
            👍 {likeCount > 0 ? likeCount : ''}
          </button>
          <button type="button" className="topic-act" disabled={busy} onClick={() => void interact('coin')}>
            🪙 {coinCount > 0 ? coinCount : ''}
          </button>
          <button
            type="button"
            className={`topic-act${favorited ? ' on' : ''}`}
            disabled={busy}
            onClick={() => void interact('favorite')}
          >
            ⭐ {favCount > 0 ? favCount : ''}
          </button>
        </div>
      ) : null}
    </div>
  );
}
