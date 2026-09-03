// ===== 列表模式（最新/热门）：.topic 卡片 + 底部无限滚动哨兵 =====
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { CoinInfo, Discussion, Gender, Tag } from '../../types';
import { displayName, imgSrc, tagColorOf, tagTextColorOf, timeAgo } from '../../lib/utils';
import { collapseIosUrlBar, isIosUrlBarCollapsing } from '../../lib/iosUrlBar';
import { api } from '../../api/client';
import { notifications } from '@mantine/notifications';
import { mutate as globalMutate } from 'swr';
import { requireLogin } from '../auth/authModals';
import { useAuth } from '../auth/AuthContext';
import Avatar from '../../components/Avatar';
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
        <TopicCard key={d.id} d={d} tags={tags} onOpenTopic={(card) => onOpenTopic(card.id)} />
      ))}
      <div ref={sentinelRef} className="load-more">
        {loadingMore ? '加载中…' : hasMore ? '继续上滑加载更多' : '没有更多了'}
      </div>
    </>
  );
}

/** 主题列表卡片所需的最小数据字段（主页/搜索/我的主题/我的私密共用；各列表接口均返回） */
export interface TopicCardData {
  id: number;
  title: string;
  user_id: number;
  excerpt?: string;
  image_url?: string | null;
  author?: string;
  author_avatar?: string | null;
  author_gender?: Gender | null;
  first_character_id?: number | null;
  /** 作者累计获得格币（等级徽章依据） */
  author_earned?: number | null;
  author_badges?: string | null;
}

// ===== 列表卡片（全局共用：主页列表模式 / 搜索弹窗 / 我的主题 / 我的私密） =====
// 各入口的差异（时间/接戏数/滴滴/私密徽标/三连等）通过插槽注入，不再各自复制卡片结构——
// 保证作者信息（头像 + 名字）在任何列表都一致。
export function TopicCard({
  d,
  tags,
  onOpenTopic,
  titleRight,
  metaExtras,
  footer,
}: {
  d: TopicCardData;
  tags: Tag[];
  onOpenTopic: (d: TopicCardData) => void;
  /** 标题右侧附加（私密滴滴状态徽标等） */
  titleRight?: ReactNode;
  /** 作者行之后附加（时间 / 接戏数 / 私密徽标等） */
  metaExtras?: ReactNode;
  /** 卡片尾部（一键三连等；其自身须拦截点击避免误触开帖） */
  footer?: ReactNode;
}) {
  // 摘要原样保留（.topic-excerpt 用 pre-line + max-height 按行截断）：
  // 不能 replace(/\s+/g,' ') 压成单行——会把 \n 变空格，长文全挤一行；
  // 连续多个空行也是用户排版，原样保留（pre-line 下显示为段落间距）
  const excerpt = (d.excerpt || '').trim();

  return (
    <div
      className="topic topic-clickable"
      role="link"
      tabIndex={0}
      onClick={(e) => {
        // 内部按钮（作者/三连/分享等）不触发开帖
        if ((e.target as HTMLElement).closest('button')) return;
        onOpenTopic(d);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpenTopic(d);
      }}
    >
      <div className="topic-title">
        {d.title}
        {titleRight}
      </div>
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
        {metaExtras}
      </div>
      {footer}
    </div>
  );
}
