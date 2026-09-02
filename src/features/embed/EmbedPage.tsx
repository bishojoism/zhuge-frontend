// ===== 主题嵌入版（/embed/d/:id）：iframe 极简页 =====
// 供外部网页内嵌（主题详情页首帖「更多 → 内嵌到网页」复制 iframe 源码）。
// 聊天式布局：主题信息固定顶部、接戏输入固定底部、中间楼层列表**从新到旧**（最新在上）。
// 一切显示与交互尽可能精简：无导航栏 / 无作者操作 / 无排序切换 / 无分页跳转定位。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Textarea } from '@mantine/core';
import { IconSend } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { api } from '../../api/client';
import { useAuth } from '../auth/AuthContext';
import { requireLogin } from '../auth/authModals';
import { useTopic } from '../../api/hooks';
import { hasBBCode, parseBBCode } from '../../lib/bbcode';
import { displayName, imgSrc, timeAgo, tagTextColorOf } from '../../lib/utils';
import type { DiscussionDetail } from '../../types';
import type { TopicPost } from '../topic/topicTypes';

// 按楼层号合并去重（新页/回复并入已有列表）
function mergePosts(prev: TopicPost[], next: TopicPost[]): TopicPost[] {
  const m = new Map<number, TopicPost>();
  for (const p of [...prev, ...next]) m.set(p.number, p);
  return [...m.values()].sort((a, b) => a.number - b.number);
}

export default function EmbedPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  // 首帖页（asc page1）：SSR 内联（topicHead fallback），首帧即有 1 楼
  const { data, isLoading } = useTopic(id, 1, 'old');
  const [posts, setPosts] = useState<TopicPost[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 首屏并入（SSR 内联数据到达即渲染，无骨架闪烁）
  useEffect(() => {
    if (!data?.posts?.length) return;
    setPosts((prev) => {
      const merged = mergePosts(prev, data.posts as TopicPost[]);
      setHasMore((data.totalPosts || 0) > merged.length);
      return merged;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const loadMore = async () => {
    if (loadingMore || !hasMore || !id) return;
    setLoadingMore(true);
    try {
      const r = await api<{ data: DiscussionDetail }>(`/discussions/${id}?page=${page + 1}&order=old`);
      setPosts((prev) => {
        const merged = mergePosts(prev, (r.data.posts || []) as TopicPost[]);
        setHasMore((r.data.totalPosts || 0) > merged.length);
        return merged;
      });
      setPage((p) => p + 1);
    } catch {
      /* 加载更多失败：保留现状，可重试 */
    } finally {
      setLoadingMore(false);
    }
  };

  const submitReply = async () => {
    if (!id) return;
    if (!user) {
      requireLogin('接戏');
      return;
    }
    const trimmed = content.trim();
    if (!trimmed) {
      notifications.show({ message: '内容不能为空', color: 'red' });
      return;
    }
    setSubmitting(true);
    try {
      const r = await api<{ data: { id: number; number: number; coinReward?: number | null } }>(
        `/discussions/${id}/posts`,
        { method: 'POST', body: { content: trimmed } }
      );
      // 服务端只回 id/number，本地用当前用户信息构造新楼并入（同详情页乐观帖逻辑）
      const newPost: TopicPost = {
        id: r.data.id,
        discussion_id: Number(id),
        number: r.data.number,
        created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
        user_id: user.id,
        content: trimmed,
        image_url: null,
        edited_at: null,
        is_private: 0,
        reply_to_post_id: null,
        author: user.username,
        author_gender: user.gender || null,
        author_avatar: user.avatar_url || null,
        character_id: null,
      };
      setPosts((prev) => mergePosts(prev, [newPost]));
      setContent('');
      if (r.data.coinReward) {
        notifications.show({ message: `🎉 首次接戏 +${r.data.coinReward} 格币`, color: 'green' });
      }
      notifications.show({ message: '回复成功' });
      try {
        textareaRef.current?.focus();
      } catch { /* 忽略 */ }
    } catch (e) {
      notifications.show({ message: e instanceof Error ? e.message : '回复失败', color: 'red' });
    } finally {
      setSubmitting(false);
    }
  };

  const d = data?.discussion;
  // 首帖并入固定顶部的主题信息（同正常版首帖卡：标题 + 标签 + 作者 + 正文合并显示）
  const firstPost = posts.find((p) => p.number === 1) || null;
  // 从新到旧：仅回复（2 楼+）倒序（最新在上）；首帖不参与排序（在顶部）
  const replies = useMemo(
    () => posts.filter((p) => p.number > 1).sort((a, b) => b.number - a.number),
    [posts]
  );
  // 楼层正文（BBCode 渲染）
  const postBody = (p: TopicPost) => (
    <div className="embed-body">
      {String(p.content || '')
        .split('\n')
        .map((line, i) => (
          <p key={i} className="embed-line">
            {hasBBCode(line) ? parseBBCode(line) : line}
          </p>
        ))}
    </div>
  );
  const postImage = (p: TopicPost) =>
    p.image_url ? (
      <img
        src={imgSrc(p.image_url, 800) || p.image_url}
        alt="配图"
        loading="lazy"
        style={{ maxWidth: '100%', maxHeight: '40vh', borderRadius: 8, margin: '6px 0', display: 'block' }}
      />
    ) : null;

  if (isLoading && posts.length === 0 && !data) {
    return (
      <main className="zhuge-embed">
        <h1 className="vh">主题加载中 - 主格</h1>
        <div className="embed-hint">加载中…</div>
      </main>
    );
  }
  if (!d) {
    return (
      <main className="zhuge-embed">
        <h1 className="vh">主题 - 主格</h1>
        <div className="embed-hint">主题不存在或私密主题不支持内嵌</div>
      </main>
    );
  }

  return (
    <main className="zhuge-embed">
      {/* 无障碍：嵌入页独立于主站 Layout，自带主地标 + 主题标题 h1 */}
      <h1 className="vh">{d.title} - 主格</h1>
      {/* 固定顶部：主题信息 + 首帖合并（同正常版首帖卡：标题 + 标签 + 作者/时间 + 正文 + 配图） */}
      <div className="embed-top">
        <div className="embed-title">{d.title}</div>
        <div className="embed-meta">
          <span className="embed-num">1楼</span>
          {displayName(firstPost || d)}
          {firstPost?.reply_to_post_id ? ' 回复' : ''} · {timeAgo(firstPost ? firstPost.created_at : d.created_at)}
          {Array.isArray(data.tags) && data.tags.length > 0 && (
            <span className="embed-tags">
              {data.tags.map((t) => {
                const bg = t.color || '#4D698E';
                return (
                  <span key={t.id} className="mini-tag" style={{ background: bg, color: tagTextColorOf(bg) }}>
                    {t.name}
                  </span>
                );
              })}
            </span>
          )}
        </div>
        {firstPost && postBody(firstPost)}
        {firstPost && postImage(firstPost)}
      </div>

      {/* 中间：回复列表（2 楼+，从新到旧，最新在上），内部滚动 */}
      <div className="embed-posts">
        {replies.map((p) => (
          <div className="embed-post" key={p.number}>
            <div className="embed-meta">
              <span className="embed-num">{p.number}楼</span>
              {displayName(p)}
              {p.reply_to_post_id ? ' 回复' : ''} · {timeAgo(p.created_at)}
            </div>
            {postBody(p)}
            {postImage(p)}
          </div>
        ))}
        {hasMore && (
          <Button variant="subtle" size="compact-sm" fullWidth mt={4} onClick={loadMore} loading={loadingMore}>
            {loadingMore ? '加载中…' : '加载更多楼层'}
          </Button>
        )}
      </div>

      {/* 固定底部：接戏输入（输入框 + 右侧图标按钮） */}
      <div className="embed-composer">
        {user ? (
          <div className="embed-composer-row">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.currentTarget.value)}
              placeholder="写下你的接戏……"
              minRows={1}
              maxRows={4}
              autosize
              ref={textareaRef}
              style={{ flex: 1 }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void submitReply();
                }
              }}
            />
            <Button
              onClick={() => void submitReply()}
              loading={submitting}
              variant="light"
              size="compact-md"
              style={{ flexShrink: 0 }}
              aria-label="接戏"
              title="接戏"
            >
              <IconSend size={18} />
            </Button>
          </div>
        ) : (
          <div className="embed-login-hint">
            登录后即可接戏
            <Button variant="subtle" size="compact-sm" onClick={() => requireLogin('接戏')}>
              去登录
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
