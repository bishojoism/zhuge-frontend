// ===== 帖子卡片（首帖/回复共用；首帖可带主题标题/标签） =====
// 含行渲染（BBCode 解析 + 搜索关键词高亮）与超长内容折叠组件
import { memo, useState, type ReactNode } from 'react';
import { Button, Group, Select } from '@mantine/core';
import { hasBBCode, parseBBCode } from '../../lib/bbcode';
import { displayName, imgSrc, tagTextColorOf, timeAgo } from '../../lib/utils';
import Avatar from '../../components/Avatar';
import type { CharacterItem, Tag, User } from '../../types';
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
  /** 编辑自己的帖子（作者本人或管理员可见） */
  onEdit?: () => void;
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
export const LongContent = memo(function LongContent({ content, highlight }: { content: string; highlight?: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = content.split('\n');
  const head = content.slice(0, 300);
  const headLines = head.split('\n');
  return (
    <>
      {(expanded ? lines : headLines).map((line, i) => (
        <p key={i}>{renderLine(line, highlight)}</p>
      ))}
      {!expanded && (
        <button type="button" className="expand-post-btn" onClick={() => setExpanded(true)}>
          展开全文（{content.length} 字）▾
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
  onEdit,
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
            </span>
            {isPrivate && <span className="private-badge">私密</span>}
          </div>
          <div className="post-time">
            {floor} · {timeAgo(post.created_at)}
            {post.edited_at ? (
              <span title={`编辑于 ${post.edited_at}`} style={{ opacity: 0.8 }}>
                {' '}· 已编辑
              </span>
            ) : null}
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
        {post.content.length > LONG_POST_CHARS ? (
          <LongContent content={post.content} highlight={highlight} />
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
          {onEdit && (
            <Button size="compact-sm" variant="subtle" onClick={onEdit}>
              编辑
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
