// ===== 我的收藏：收藏的帖子列表（点击跳转定位到收藏的楼） =====
import { useEffect, useState } from 'react';
import { Button, Group, Loader, Stack, Text } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { openModalOnce } from '../../lib/modals';
import { timeAgo } from '../../lib/utils';
import TripleActions from '../../components/TripleActions';

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
      size: 420,
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

  return (
    <Stack gap={6} style={{ maxHeight: '60vh', overflow: 'auto' }}>
      {rows.map((it) => (
        <Group
          key={it.post_id}
          gap="sm"
          wrap="nowrap"
          justify="space-between"
          style={{
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            cursor: 'pointer',
          }}
          onClick={() => go(it)}
        >
          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            <Text size="sm" fw={600} truncate>
              {it.is_private ? '🔒 ' : ''}{it.discussion_title}
              <Text component="span" size="xs" c="dimmed" ml={6}>
                {it.number}楼 · {it.post_author}
              </Text>
            </Text>
            {it.content ? (
              <Text size="xs" c="dimmed" lineClamp={2}>
                {it.content}
              </Text>
            ) : null}
            {/* 收藏夹内也可一键三连（点赞/投币/收藏 + 计数） */}
            <TripleActions postId={it.post_id} authorId={it.post_user_id} initial={it} />
          </Stack>
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            {timeAgo(it.favorited_at)}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}
