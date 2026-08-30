// ===== 列表模式（最新/热门）：.topic 卡片 + 底部无限滚动哨兵 =====
import { useEffect, useRef } from 'react';
import type { Discussion, Tag } from '../../types';
import { displayName, tagColorOf, tagTextColorOf, timeAgo } from '../../lib/utils';
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
          src={d.image_url}
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
          {d.author_badges
            ? d.author_badges
                .split(',')
                .filter(Boolean)
                .map((item, i) => {
                  const [icon, tier] = item.split(':');
                  return (
                    <span key={i} className={`author-badge-icon${tier === '1' ? ' t1' : ''}`} title={tier === '1' ? '进阶徽章' : '徽章'}>
                      {icon}
                    </span>
                  );
                })
            : null}
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
    </div>
  );
}
