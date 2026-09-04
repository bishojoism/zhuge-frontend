// ===== 我的收藏：收藏的帖子列表（点击跳转定位到收藏的楼） =====
import { useEffect, useState } from 'react';
import { Loader, Stack, Text } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { openModalOnce } from '../../lib/modals';
import { timeAgo } from '../../lib/utils';
import TripleActions from '../../components/TripleActions';
import { TopicCard, type TopicCardData } from '../home/list';

interface FavoriteItem {
  post_id: number;
  favorited_at: string;
  number: number;
  content: string | null;
  discussion_id: number;
  discussion_title: string;
  is_private: number;
  post_author: string;
  post_user_id: number;
  like_count?: number;
  favorite_count?: number;
  coin_count?: number;
  liked?: number | null;
  favorited?: number | null;
}

export function openFavoritesModal(): void {
  openModalOnce('favorites', (m) => {
    m.open({
      title: '我的收藏',
      size: 460,
      children: <FavoritesContent />,
    });
  });
}

function FavoritesContent() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<FavoriteItem[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api<{ data: FavoriteItem[] }>('/me/favorites')
      .then((r) => setRows(r.data))
      .catch(() => setError(true));
  }, []);

  const go = (it: FavoriteItem) => {
    void import('@mantine/modals').then((m) => m.modals.closeAll());
    navigate(`/d/${it.discussion_id}?focusPost=${it.post_id}`);
  };

  if (error) {
    return (
      <Text size="sm" c="dimmed">
        加载失败
      </Text>
    );
  }
  if (!rows) {
    return (
      <Stack align="center" py="lg">
        <Loader size="sm" />
      </Stack>
    );
  }
  if (!rows.length) {
    return (
      <Stack align="center" gap={4} py="lg">
        <Text size="sm" c="dimmed">
          还没有收藏
        </Text>
        <Text size="xs" c="dimmed">
          在主题/帖子上点 ⭐ 即可收藏，之后从这里快速找回。
        </Text>
      </Stack>
    );
  }

  // 复用全局 TopicCard（与其他列表一致的卡片样式）；点击仍跳转并定位收藏的楼
  return (
    <Stack gap={6}>
      {rows.map((it) => {
        const card: TopicCardData = {
          id: it.discussion_id,
          title: it.discussion_title,
          user_id: it.post_user_id,
          excerpt: it.content || undefined,
          author: it.post_author,
        };
        return (
          <TopicCard
            key={it.post_id}
            d={card}
            tags={[]}
            onOpenTopic={() => go(it)}
            titleRight={it.is_private ? <span>🔒</span> : undefined}
            metaExtras={
              <>
                <span>
                  {it.number}楼 · {timeAgo(it.favorited_at)}
                </span>
              </>
            }
            footer={<TripleActions postId={it.post_id} authorId={it.post_user_id} initial={it} />}
          />
        );
      })}
    </Stack>
  );
}
