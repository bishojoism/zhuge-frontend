// ===== 帖子卡片（首帖/回复共用；首帖可带主题标题/标签） =====
// 含行渲染（BBCode 解析 + 搜索关键词高亮）、超长内容折叠、一键三连（点赞/投币/收藏）+ 打赏
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Group, Select } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { mutate as globalMutate } from 'swr';
import { hasBBCode, parseBBCode } from '../../lib/bbcode';
import { displayName, imgSrc, tagTextColorOf, timeAgo } from '../../lib/utils';
import { api } from '../../api/client';
import { requireLogin } from '../auth/authModals';
import { levelLabel, levelOf } from '../../lib/coins';
import { openTipModal } from './tipModal';
import Avatar from '../../components/Avatar';
import type { CharacterItem, CoinInfo, Tag, User } from '../../types';
import { GENDER_LABEL, type TopicPost } from './topicTypes';

export interface PostCardProps {
  post: TopicPost;
  floor: string;
  replyToAuthor: string | null;
  user: User | null | undefined;
  onReply: () => void;
  onDidi?: () => void;
  didiLoading?: boolean;
  /** 滴滴身份选择（点击滴滴前选好角色；留空 = 本人） */
  onDidiChars?: (v: string | null) => void;
  didiCharOptions?: { value: string; label: string }[];
  /** 角色 value → 完整信息（下拉选项显示外貌/性别） */
  charMap?: Map<string, CharacterItem>;
  didiCharId?: string | null;
  onReport: () => void;
  onAdmin?: () => void;
  onPoster?: () => void;
  onCopyLink?: () => void;
  /** 查看帖子源码（原始 BBCode 文本） */
  onSource?: () => void;
  /** 删除自己的帖子/主题（作者本人或管理员可见；首帖删除 = 删主题） */
  onDelete?: () => void;
  /** 点击回复引用 → 跳转到被回复的帖子 */
  onJumpToReply?: (targetPostId: number) => void;
  /** 点击作者名 → 查看该用户名片（角色/皮下/滴滴统计） */
  onAuthorStats: (userId: number, name: string, characterId?: number | null) => void;
  title?: string;
  topicTags?: Tag[];
  isPrivate?: boolean;
  /** 首帖（主题卡片）：不显示误导性的"接戏"按钮（与底部回复框重复） */
  isFirstPost?: boolean;
  /** 主题内搜索关键词：命中内容用 <mark> 高亮 */
  highlight?: string;
}

// 超长戏文折叠：超过阈值只显示前段，点击展开
const LONG_POST_CHARS = 600;
// 首帖（主题开场戏文）折叠更激进：预览更短，让卡片底部的一键三连/滴滴/复制链接等
// 操作按钮不用滚动就能看到（长戏文首帖常上千字，300 字预览会把按钮挤出首屏）
const FIRST_POST_FOLD_CHARS = 300; // 首帖超过 300 字即折叠
const FIRST_POST_PREVIEW_CHARS = 120; // 首帖折叠后只显示前 120 字（约 2-3 行）
const PREVIEW_CHARS = 300; // 回复折叠后显示前 300 字（原行为）

// 按关键词把一行内容拆成高亮片段（大小写不敏感）
export function renderLine(line: string, kw?: string): ReactNode {
  // BBCode 内容优先走安全解析（搜索高亮在 BBCode 行不做，避免与格式元素冲突）
  if (hasBBCode(line)) return parseBBCode(line);
  if (!kw) return line;
  const lower = line.toLowerCase();
  if (!lower.includes(kw)) return line;
  const parts: ReactNode[] = [];
  let rest = line;
  let restLower = lower;
  let k = 0;
  for (;;) {
    const idx = restLower.indexOf(kw);
    if (idx === -1) {
      parts.push(rest);
      break;
    }
    if (idx > 0) parts.push(rest.slice(0, idx));
    parts.push(<mark key={k++}>{rest.slice(idx, idx + kw.length)}</mark>);
    rest = rest.slice(idx + kw.length);
    restLower = restLower.slice(idx + kw.length);
    if (rest === '') break;
  }
  return <>{parts}</>;
}

// memo：排序切换/搜索等父组件重渲染时，content/highlight 不变则跳过重渲染（避免 BBCode 重解析）
export const LongContent = memo(function LongContent({
  content,
  highlight,
  previewChars = PREVIEW_CHARS,
}: {
  content: string;
  highlight?: string;
  previewChars?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const lines = content.split('\n');
  const head = content.slice(0, previewChars);
  const headLines = head.split('\n');
  return (
    <>
      {(expanded ? lines : headLines).map((line, i) => (
        <p key={i}>{renderLine(line, highlight)}</p>
      ))}
      {!expanded ? (
        <button type="button" className="expand-post-btn" onClick={() => setExpanded(true)}>
          展开全文（{content.length} 字）▾
        </button>
      ) : (
        <button type="button" className="expand-post-btn" onClick={() => setExpanded(false)}>
          收起 ▴
        </button>
      )}
    </>
  );
});

export function PostCard({
  post,
  floor,
  replyToAuthor,
  user,
  onReply,
  onDidi,
  didiLoading,
  onDidiChars,
  didiCharOptions = [],
  charMap = new Map(),
  didiCharId,
  onReport,
  onAdmin,
  onPoster,
  onCopyLink,
  onSource,
  onDelete,
  onJumpToReply,
  onAuthorStats,
  title,
  topicTags,
  isPrivate,
  isFirstPost,
  highlight,
}: PostCardProps) {
  const author = displayName(post);
  // 不能滴滴自己的帖子（未登录时按钮可见，点击弹登录）
  const canDidi = !user || user.id !== post.user_id;

  // ===== 一键三连（点赞/投币/收藏）+ 打赏：本地乐观更新计数，服务端为准 =====
  const [liked, setLiked] = useState(!!post.liked);
  const [favorited, setFavorited] = useState(!!post.favorited);
  const [likeCount, setLikeCount] = useState(post.like_count || 0);
  const [favCount, setFavCount] = useState(post.favorite_count || 0);
  const [coinCount, setCoinCount] = useState(post.coin_count || 0);
  const [busy, setBusy] = useState(false);

  // 帖子 id 变化（乐观帖负 id → 真实帖正 id，key=楼层号组件复用）时同步一键三连数据：
  // key 用楼层号后组件不会重建，state 保持乐观帖初值，这里在真实数据到达时刷新计数/状态
  const prevPostIdRef = useRef(post.id);
  useEffect(() => {
    if (prevPostIdRef.current !== post.id) {
      prevPostIdRef.current = post.id;
      setLiked(!!post.liked);
      setFavorited(!!post.favorited);
      setLikeCount(post.like_count || 0);
      setFavCount(post.favorite_count || 0);
      setCoinCount(post.coin_count || 0);
    }
  }, [post.id, post.liked, post.favorited, post.like_count, post.favorite_count, post.coin_count]);

  const needLogin = () => {
    if (!user) {
      requireLogin('互动');
      return true;
    }
    return false;
  };

  const toggleLike = async () => {
    if (needLogin()) return;
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    setBusy(true);
    try {
      const r = await api<{ active: boolean; coinReward?: number | null }>(`/posts/${post.id}/like`, { method: 'POST' });
      if (r.active !== next) {
        setLiked(r.active);
        setLikeCount((c) => Math.max(0, c + (r.active ? 1 : -1)));
      }
      if (r.coinReward) {
        notifications.show({ message: `🎉 首次点赞 +${r.coinReward} 格币`, color: 'green' });
        void globalMutate<CoinInfo>('/me/coins');
      }
    } catch (e) {
      setLiked(!next);
      setLikeCount((c) => Math.max(0, c + (next ? -1 : 1)));
      notifications.show({ message: e instanceof Error ? e.message : '操作失败', color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  const toggleFavorite = async () => {
    if (needLogin()) return;
    const next = !favorited;
    setFavorited(next);
    setFavCount((c) => Math.max(0, c + (next ? 1 : -1)));
    setBusy(true);
    try {
      const r = await api<{ active: boolean; coinReward?: number | null }>(`/posts/${post.id}/favorite`, { method: 'POST' });
      if (r.active !== next) {
        setFavorited(r.active);
        setFavCount((c) => Math.max(0, c + (r.active ? 1 : -1)));
      }
      if (r.coinReward) {
        notifications.show({ message: `🎉 首次收藏 +${r.coinReward} 格币`, color: 'green' });
        void globalMutate<CoinInfo>('/me/coins');
      }
    } catch (e) {
      setFavorited(!next);
      setFavCount((c) => Math.max(0, c + (next ? -1 : 1)));
      notifications.show({ message: e instanceof Error ? e.message : '操作失败', color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  // 投币（固定 1 币，10% 税；被投币会通知作者；允许给自己；给他人投币首次 +3 任务奖励）——乐观：先计数，失败回滚
  const doCoin = async () => {
    if (needLogin()) return;
    setBusy(true);
    setCoinCount((c) => c + 1);
    try {
      const r = await api<{ coinReward?: number | null }>(`/posts/${post.id}/coin`, { method: 'POST' });
      notifications.show({ message: '已投币 1 格币' });
      if (r.coinReward) {
        notifications.show({ message: `🎉 首次投币 +${r.coinReward} 格币`, color: 'green' });
      }
      void globalMutate<CoinInfo>('/me/coins');
    } catch (e) {
      setCoinCount((c) => Math.max(0, c - 1));
      notifications.show({ message: e instanceof Error ? e.message : '投币失败', color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  const doTip = () => {
    if (needLogin()) return;
    openTipModal(post.id, author, () => setCoinCount((c) => c + 1));
  };

  // 一键三连：一次点击完成 点赞 + 收藏 + 投币（已点赞/已收藏的跳过；投币消耗 1 币；允许给自己）——全乐观：先本地点亮/计数，再后台请求，失败单项回滚
  const doTriple = async () => {
    if (needLogin()) return;
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
          const r = await api<{ active: boolean; coinReward?: number | null }>(`/posts/${post.id}/like`, { method: 'POST' });
          if (!r.active) {
            setLiked(false);
            setLikeCount((c) => Math.max(0, c - 1));
          }
          if (r.coinReward) {
            notifications.show({ message: `🎉 首次点赞 +${r.coinReward} 格币`, color: 'green' });
            void globalMutate<CoinInfo>('/me/coins');
          }
        } catch {
          setLiked(false);
          setLikeCount((c) => Math.max(0, c - 1));
        }
      }
      if (needFav) {
        try {
          const r = await api<{ active: boolean; coinReward?: number | null }>(`/posts/${post.id}/favorite`, { method: 'POST' });
          if (!r.active) {
            setFavorited(false);
            setFavCount((c) => Math.max(0, c - 1));
          }
          if (r.coinReward) {
            notifications.show({ message: `🎉 首次收藏 +${r.coinReward} 格币`, color: 'green' });
            void globalMutate<CoinInfo>('/me/coins');
          }
        } catch {
          setFavorited(false);
          setFavCount((c) => Math.max(0, c - 1));
        }
      }
      try {
        const r = await api<{ coinReward?: number | null }>(`/posts/${post.id}/coin`, { method: 'POST' });
        if (r.coinReward) {
          notifications.show({ message: `🎉 首次投币 +${r.coinReward} 格币`, color: 'green' });
        }
        void globalMutate<CoinInfo>('/me/coins');
      } catch {
        coinOk = false; // 投币失败（如余额不足），点赞收藏仍完成
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

  const lv = levelOf(post.author_earned);

  return (
    <div className="post" data-num={post.number}>
      <div className="post-head">
        <Avatar user={post} size="md" showGender />
        <div>
          <div className="post-author">
            <span
              className="author-link"
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onAuthorStats(post.user_id, author, post.character_id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation();
                  onAuthorStats(post.user_id, author, post.character_id);
                }
              }}
            >
              {author}
              {/* 作者已获徽章：全部展示（进阶徽章 t1 带发光特效），与主页一致点击含徽章 */}
              {post.author_badges
                ? post.author_badges
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
              {/* 等级徽章（特殊徽章：累计获得格币的档位，Lv.2 起显示） */}
              {lv > 1 && (
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
                  title={`等级 ${levelLabel(lv)}（累计获得格币）`}
                >
                  {levelLabel(lv)}
                </span>
              )}
            </span>
            {isPrivate && <span className="private-badge">私密</span>}
          </div>
          <div className="post-time">
            {floor} · {timeAgo(post.created_at)}
          </div>
        </div>
      </div>

      {/* 主题标题（首帖卡片上） */}
      {title && <div className="topic-title">{title}</div>}
      {topicTags && topicTags.length > 0 && (
        <div className="topic-tags" style={{ marginBottom: 10 }}>
          {topicTags.map((t) => {
            const bg = t.color || '#4D698E';
            return (
              <span key={t.id} className="mini-tag" style={{ background: bg, color: tagTextColorOf(bg) }}>
                {t.name}
              </span>
            );
          })}
        </div>
      )}

      {replyToAuthor && (
        <button
          type="button"
          className={`post-reply-ref${post.reply_to_post_id && onJumpToReply ? ' clickable' : ''}`}
          onClick={
            post.reply_to_post_id && onJumpToReply
              ? () => onJumpToReply(post.reply_to_post_id as number)
              : undefined
          }
        >
          回复 <span style={{ color: 'var(--primary-deep)', fontWeight: 600 }}>@{replyToAuthor}</span>
          {post.reply_to_post_id && onJumpToReply ? <span className="jump-hint">↩ 跳转</span> : null}
        </button>
      )}

      <div className="post-body">
        {post.content.length > (isFirstPost ? FIRST_POST_FOLD_CHARS : LONG_POST_CHARS) ? (
          <LongContent
            content={post.content}
            highlight={highlight}
            previewChars={isFirstPost ? FIRST_POST_PREVIEW_CHARS : PREVIEW_CHARS}
          />
        ) : (
          post.content.split('\n').map((line, i) => <p key={i}>{renderLine(line, highlight)}</p>)
        )}
      </div>

      {post.image_url && (
        <img
          src={imgSrc(post.image_url, 800) || post.image_url}
          alt="配图"
          style={{ maxWidth: '100%', borderRadius: 10, margin: '8px 0' }}
          loading="lazy"
        />
      )}

      <div className="post-actions">
        <div className="post-actions-main">
          {!isPrivate && !isFirstPost && (
            <Button size="compact-sm" variant="default" onClick={onReply}>
              接戏
            </Button>
          )}
          {!isPrivate && canDidi && onDidi && (
            <>
              {/* 滴滴身份选择：点击滴滴前选好角色（留空 = 以本人身份），同接戏一致 */}
              {onDidiChars && didiCharOptions.length > 0 && (
                <Select
                  size="xs"
                  placeholder="（可选）以角色身份滴滴"
                  w={225}
                  data={didiCharOptions}
                  value={didiCharId}
                  onChange={onDidiChars}
                  clearable
                  nothingFoundMessage="无角色"
                  renderOption={({ option }) => {
                    const c = charMap.get(option.value);
                    return (
                      <Group gap={8} wrap="nowrap">
                        {c?.appearance ? (
                          <img
                            src={c.appearance}
                            alt=""
                            style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                          />
                        ) : (
                          <span style={{ width: 24, textAlign: 'center', flexShrink: 0, fontSize: 15 }}>👤</span>
                        )}
                        <span>{option.label}</span>
                        {c?.gender ? (
                          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
                            {GENDER_LABEL[c.gender] || c.gender}
                          </span>
                        ) : null}
                      </Group>
                    );
                  }}
                />
              )}
              <Button size="compact-sm" color="clay" onClick={onDidi} loading={didiLoading}>
                滴滴
              </Button>
            </>
          )}
          {(post.didi_count ?? 0) > 0 && (
            <span style={{ fontSize: 13, color: 'var(--muted)', alignSelf: 'center' }}>
              {post.didi_count} 滴滴
            </span>
          )}
          {/* 一键三连 + 打赏（点赞/收藏 toggle，投币固定 1 币，打赏自定义数额） */}
          <Group gap={2} wrap="nowrap" ml="auto">
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              loading={busy}
              onClick={() => void doTriple()}
              title="一键三连：点赞 + 投币 1 格币 + 收藏"
            >
              🎉 三连
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              color={liked ? 'red' : 'gray'}
              loading={busy}
              onClick={() => void toggleLike()}
              title="点赞"
            >
              👍 {likeCount > 0 ? likeCount : ''}
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              color="clay"
              loading={busy}
              onClick={() => void doCoin()}
              title="投币 1 格币（10% 税，作者实得 0.9）"
            >
              🪙 {coinCount > 0 ? coinCount : ''}
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              color={favorited ? 'yellow' : 'gray'}
              loading={busy}
              onClick={() => void toggleFavorite()}
              title="收藏"
            >
              ⭐ {favCount > 0 ? favCount : ''}
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              color="slate"
              onClick={doTip}
              title="打赏（自定义数额，10% 税）"
            >
              💎 打赏
            </Button>
          </Group>
        </div>
        <div className="post-actions-more">
          {onCopyLink && (
            <Button size="compact-sm" variant="subtle" onClick={onCopyLink}>
              复制链接
            </Button>
          )}
          {onPoster && (
            <Button size="compact-sm" variant="subtle" onClick={onPoster}>
              精美海报
            </Button>
          )}
          {onSource && (
            <Button size="compact-sm" variant="subtle" onClick={onSource}>
              源码
            </Button>
          )}
          {onDelete && (
            <Button size="compact-sm" variant="subtle" color="red" onClick={onDelete}>
              删除
            </Button>
          )}
          <Button size="compact-sm" variant="subtle" color="gray" onClick={onReport}>
            举报
          </Button>
          {onAdmin && (
            <Button size="compact-sm" variant="subtle" color="gray" title="管理" onClick={onAdmin}>
              ⚙
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
