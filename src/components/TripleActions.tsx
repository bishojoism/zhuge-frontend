// ===== 一键三连组件（点赞/收藏/投币 + 计数），我的主题/我的滴滴等自定义列表卡片复用 =====
import { useState } from 'react';
import { notifications } from '@mantine/notifications';
import { mutate as globalMutate } from 'swr';
import { api } from '../api/client';
import { requireLogin } from '../features/auth/authModals';
import { useAuth } from '../features/auth/AuthContext';
import type { CoinInfo } from '../types';

interface TripleProps {
  postId: number | null | undefined;
  authorId: number;
  initial?: {
    liked?: number | null;
    favorited?: number | null;
    like_count?: number;
    favorite_count?: number;
    coin_count?: number;
  };
}

export default function TripleActions({ postId, authorId, initial }: TripleProps) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(!!initial?.liked);
  const [favorited, setFavorited] = useState(!!initial?.favorited);
  const [likeCount, setLikeCount] = useState(initial?.like_count || 0);
  const [favCount, setFavCount] = useState(initial?.favorite_count || 0);
  const [coinCount, setCoinCount] = useState(initial?.coin_count || 0);
  const [busy, setBusy] = useState(false);

  if (!postId) return null;

  const toastReward = (kind: string, amount?: number | null) => {
    if (amount) {
      notifications.show({ message: `🎉 首次${kind} +${amount} 格币`, color: 'green' });
      void globalMutate<CoinInfo>('/me/coins');
    }
  };

  const interact = async (kind: 'like' | 'favorite' | 'coin') => {
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
    <div className="topic-actions" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="topic-act triple-main" disabled={busy} onClick={() => void doTriple()}>
        三连
      </button>
      <button type="button" className={`topic-act${liked ? ' on' : ''}`} disabled={busy} onClick={() => void interact('like')}>
        👍 {likeCount > 0 ? likeCount : ''}
      </button>
      <button type="button" className="topic-act" disabled={busy} onClick={() => void interact('coin')}>
        🪙 {coinCount > 0 ? coinCount : ''}
      </button>
      <button type="button" className={`topic-act${favorited ? ' on' : ''}`} disabled={busy} onClick={() => void interact('favorite')}>
        ⭐ {favCount > 0 ? favCount : ''}
      </button>
    </div>
  );
}
