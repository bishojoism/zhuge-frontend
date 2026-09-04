// ===== 推荐网格模式：双列卡片 + 底部无限滚动哨兵（替代原横向滑卡视图） =====
// 复用列表模式的滚动加载机制（IntersectionObserver 预取），渲染双列网格；
// 卡片复用全局 TopicCard（.topic 直角卡）。数据流与列表模式完全一致。
import { useEffect, useRef } from 'react';
import type { Discussion, Tag } from '../../types';
import { TopicCard } from './list';

interface GridViewProps {
  items: Discussion[];
  tags: Tag[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onOpenTopic: (id: number) => void;
}

export default function GridView({
  items,
  tags,
  hasMore,
  loadingMore,
  onLoadMore,
  onOpenTopic,
}: GridViewProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 哨兵：距视口底部约 4 屏时预取下一页
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
      <div className="grid-list">
        {items.map((d) => (
          <TopicCard key={d.id} d={d} tags={tags} onOpenTopic={(card) => onOpenTopic(card.id)} />
        ))}
      </div>
      <div ref={sentinelRef} className="load-more">
        {loadingMore ? '加载中…' : hasMore ? '继续上滑加载更多' : '没有更多了'}
      </div>
    </>
  );
}
