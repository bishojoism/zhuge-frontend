// ===== 主题详情页 /d/:id：首帖 + 回复、接戏、滴滴、举报、管理、海报、分享 =====
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button, Group, Menu, Modal, SegmentedControl, Select, Skeleton, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import useSWR, { mutate as globalMutate } from 'swr';
import { IconArrowLeft } from '@tabler/icons-react';
import { api } from '../../api/client';
import { fetcher, useDrafts, useTopic, useUnread } from '../../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { requireLogin } from '../auth/authModals';
import { openShareModal } from '../share/shareModals';
import { hasBBCode, parseBBCode } from '../../lib/bbcode';
import { exportTextLog, openImageExportModal } from './exportLog';
import { openReportModal, type ReportTargetType } from './reportModal';
import { openPostAdminModal, type AdminTargetType } from './postAdminModal';
import { copyText, displayName, imgSrc, pickImageFile, tagTextColorOf, timeAgo, uploadImageFile } from '../../lib/utils';
import Avatar from '../../components/Avatar';
import BBCodeEditor from '../../components/BBCodeEditor';
import { clearDraft, saveDraft } from '../../lib/drafts';
import type { CharacterItem, Discussion, Post, Tag, User } from '../../types';

// 性别徽标（角色下拉选项用）
const GENDER_LABEL: Record<string, string> = { male: '男', female: '女', other: '其他', secret: '保密' };

// 详情接口的帖子带额外联表字段（后端返回，类型上补全）
interface TopicPost extends Post {
  reply_to_author?: string | null;
  didi_count?: number;
  didi_by_me?: number;
}

// 详情接口的讨论带作者头像（类型上补全）
interface TopicDiscussion extends Discussion {
  author_avatar?: string | null;
}

interface ReplyDraftData {
  content?: string;
  imageUrl?: string | null;
}

// 私密主题的滴滴响应条：未响应时显示「接受滴滴 / 婉拒」，已响应显示状态徽标
function DidiResponseBar({ status, discussionId, onChanged }: { status: 'accepted' | 'declined' | null; discussionId: number; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  if (status) {
    return (
      <Group mb="sm" gap={8}>
        <span className={`didi-badge ${status === 'accepted' ? 'didi-ok' : 'didi-no'}`}>
          {status === 'accepted' ? '已接受滴滴' : '已婉拒滴滴'}
        </span>
        <Text size="xs" c="dimmed">
          对方已收到你的回应
        </Text>
      </Group>
    );
  }
  const respond = async (s: 'accepted' | 'declined') => {
    setBusy(true);
    try {
      await api(`/discussions/${discussionId}/didi-response`, { method: 'POST', body: { status: s } });
      onChanged();
    } catch (e) {
      notifications.show({ color: 'red', message: e instanceof Error ? e.message : '操作失败' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Group mb="sm" gap={8}>
      <Text size="sm" c="dimmed">
        对方滴滴了你：
      </Text>
      <Button size="compact-sm" color="green" onClick={() => respond('accepted')} loading={busy}>
        接受滴滴
      </Button>
      <Button size="compact-sm" variant="light" style={{ color: 'var(--st-danger)' }} onClick={() => respond('declined')} loading={busy}>
        婉拒
      </Button>
    </Group>
  );
}

// 超长戏文折叠：超过阈值只显示前段，点击展开
const LONG_POST_CHARS = 600;
function LongContent({ content, highlight }: { content: string; highlight?: string }) {
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
}

export default function TopicPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const { user } = useAuth();
  const { data, error, isLoading, mutate } = useTopic(id);
  const { mutate: refreshUnread } = useUnread();
  const { data: draftsData, mutate: mutateDrafts } = useDrafts();

  // 挂载时强制刷新云草稿（SSR fallback 是页面加载时的旧快照，revalidateIfStale:false 不自动重拉）
  useEffect(() => {
    if (user && id) void mutateDrafts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  // 点击作者名 → 查看作者名片（角色/皮下/滴滴统计；动态导入）
  const openAuthorStats = (userId: number, name: string, characterId?: number | null) =>
    import('../private/authorDidiStats').then((m) => m.openAuthorDidiStats(userId, name, characterId));

  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<{ postId: number; author: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draftStatus, setDraftStatus] = useState('');
  const [didiLoading, setDidiLoading] = useState<number | null>(null); // 正在滴滴的帖子 id
  // 滴滴身份：点击滴滴前在按钮旁 Select 选好角色（留空 = 本人）
  const [didiCharId, setDidiCharId] = useState<string | null>(null);
  // 接戏角色卡：SWR 共享缓存（SSR 内联即时显示）
  const { data: replyCharsData } = useSWR<{ data: CharacterItem[] }>('/me/characters', fetcher);
  const replyCharacters = replyCharsData?.data ?? [];
  // 角色 value → 完整信息映射（下拉选项显示外貌/性别用）
  const charMap = new Map(replyCharacters.map((c) => [String(c.id), c]));
  const didiCharOptions = replyCharacters.map((c) => ({ value: String(c.id), label: c.name }));
  const [replyCharacterId, setReplyCharacterId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(`zhuge-reply-char-${id}`);
    } catch {
      return null;
    }
  });
  // 用户是否手动操作过角色选择（手动选过/清空后，不再自动覆盖为主题角色）
  const replyCharTouchedRef = useRef(false);
  const [postOrder, setPostOrder] = useState<'new' | 'old'>('new'); // 回复排序：默认从新到旧
  const [searchOpen, setSearchOpen] = useState(false); // 主题内搜索框开关
  const [searchQ, setSearchQ] = useState(''); // 主题内搜索关键词
  // 阅读位置记忆：上次读到的楼层 → 再次打开时提示跳转（长戏不迷路）
  const [lastPos, setLastPos] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem(`zhuge-read-${id}`);
      return v ? (JSON.parse(v) as number) : null;
    } catch {
      return null;
    }
  });
  const [showJump, setShowJump] = useState(false);

  // 帖子编辑：editingPost 非空时打开编辑弹窗
  const [editingPost, setEditingPost] = useState<TopicPost | null>(null);
  // 查看源码：sourcePost 非空时打开源码弹窗（显示原始 BBCode 文本）
  const [sourcePost, setSourcePost] = useState<TopicPost | null>(null);

  const composerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const draftTimer = useRef<number | null>(null);
  const restored = useRef(false);

  const draftKey = id ? `reply:${id}` : '';

  // 组件卸载时清掉未触发的防抖定时器
  useEffect(
    () => () => {
      if (draftTimer.current) window.clearTimeout(draftTimer.current);
    },
    []
  );

  // 题主默认角色 = 主题首帖用的角色（"主题角色"）：
  // 仅当本主题无记忆且用户未手动操作时，自动选中主题角色并记入 localStorage
  useEffect(() => {
    if (!user || !data || !firstPost) return;
    if (d.user_id !== user.id) return;
    const themeChar = firstPost.character_id;
    if (!themeChar) return;
    if (replyCharTouchedRef.current || replyCharacterId !== null) return;
    setReplyCharacterId(String(themeChar));
    try {
      localStorage.setItem(`zhuge-reply-char-${id}`, String(themeChar));
    } catch {
      /* 忽略 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, data, id, replyCharacterId]);

  // 浏览器标签标题：跟随主题标题（必须在骨架屏 return 之前，保持 hooks 数量一致）
  useEffect(() => {
    const t = data?.discussion?.title ? `${data.discussion.title} - 主格` : '主格';
    document.title = t;
    return () => {
      document.title = '主格';
    };
  }, [data?.discussion?.title]);

  // 记录阅读位置：视野上沿附近出现的帖子视为"正在阅读"
  // （必须在骨架屏 return 之前——hooks 数量须一致）
  useEffect(() => {
    const posts = data?.posts || [];
    if (!posts.length) return;
    const els = document.querySelectorAll('.post');
    const obs = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            const num = Number((en.target as HTMLElement).dataset.num);
            if (num) {
              try {
                localStorage.setItem(`zhuge-read-${id}`, JSON.stringify(num));
              } catch {
                /* 忽略 */
              }
            }
          }
        }
      },
      { rootMargin: '0px 0px -70% 0px' }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [data, id, postOrder, searchOpen]);

  // 有上次位置且未读到底 → 显示"回到上次位置"
  useEffect(() => {
    const posts = data?.posts || [];
    const last = posts.length ? posts[posts.length - 1].number : 0;
    setShowJump(lastPos !== null && lastPos < last);
  }, [data, lastPos]);

  // 回复草稿恢复：先强制刷新云草稿（SSR fallback 旧快照），刷新完成后一次性恢复
  // （restored 防止覆盖用户输入）
  const [draftReady, setDraftReady] = useState(false);
  useEffect(() => {
    if (!draftKey || !user || draftReady) return;
    // 强制重新验证后置 ready（await 保证用最新云草稿，而非 fallback 旧快照）
    void mutateDrafts().then(() => setDraftReady(true));
  }, [draftKey, user, mutateDrafts, draftReady]);

  useEffect(() => {
    if (restored.current || !draftKey || !user || !draftReady || !draftsData) return;
    const d = draftsData[draftKey] as ReplyDraftData | undefined;
    if (d && typeof d === 'object') {
      if (typeof d.content === 'string') setContent(d.content);
      if (typeof d.imageUrl === 'string') setImageUrl(d.imageUrl);
    }
    restored.current = true;
  }, [draftKey, user, draftReady, draftsData]);

  // 防抖 250ms 云保存草稿（key: reply:{id}）
  const scheduleDraftSave = useCallback(
    (nextContent: string, nextImage: string | null) => {
      if (!user || !draftKey) return;
      setDraftStatus('自动保存中…');
      if (draftTimer.current) window.clearTimeout(draftTimer.current);
      draftTimer.current = window.setTimeout(() => {
        saveDraft(draftKey, { content: nextContent, imageUrl: nextImage })
          .then(() => setDraftStatus('✓ 已自动保存'))
          .catch(() => setDraftStatus(''));
      }, 250);
    },
    [user, draftKey]
  );

  // 返回 = 上一级（来源页面，如该标签的 feed/列表；无来源回首页），不是上一页
  const goBack = useCallback(() => {
    const from = (routeLocation.state as { from?: string } | null)?.from;
    navigate(from || '/');
  }, [navigate, routeLocation.state]);

  const scrollToComposer = useCallback(() => {
    requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      textareaRef.current?.focus();
    });
  }, []);

  // 从通知点入：自动引用对方（接戏/滴滴通知 → 回复框自动 @对方并滚动过去，不抢焦点）
  // 支持两种来源：站内通知弹窗（location.state.replyPostId）与系统推送通知（URL ?reply=&replyAuthor=）
  useEffect(() => {
    if (!user || !data) return;
    const st = (routeLocation.state || {}) as { replyPostId?: number; replyAuthor?: string };
    const sp = new URLSearchParams(routeLocation.search);
    const qReply = sp.get('reply');
    const replyPostId =
      st.replyPostId ??
      (qReply && /^\d+$/.test(qReply) ? Number(qReply) : undefined);
    if (!replyPostId) return;
    const targetPost = data.posts.find((p) => p.id === replyPostId);
    if (!targetPost) return;
    const replyAuthor = st.replyAuthor || sp.get('replyAuthor') || undefined;
    setReplyTarget({ postId: replyPostId, author: replyAuthor || displayName(targetPost) });
    requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    // 清除 state + query：仅首次进入时生效，刷新/返回不重复触发
    navigate(routeLocation.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, data, routeLocation.state, routeLocation.search, navigate]);

  // 接戏：target 为 null 表示直接回复主题（首帖），否则回复指定帖子
  const startReply = useCallback(
    (target: { postId: number; author: string } | null) => {
      if (!user) {
        requireLogin('接戏');
        return;
      }
      setReplyTarget(target);
      scrollToComposer();
    },
    [user, scrollToComposer]
  );

  const cancelReply = useCallback(() => setReplyTarget(null), []);

  // 滴滴发送：带可选角色（characterId=null 时以本人身份）
  const sendDidi = useCallback(
    async (postId: number, characterId: string | null) => {
      if (didiLoading !== null) return; // 已有滴滴请求进行中
      setDidiLoading(postId);
      try {
        const res = await api<{ discussionId: number }>('/zhuge/didi', {
          method: 'POST',
          body: characterId ? { postId, characterId: Number(characterId) } : { postId },
        });
        notifications.show({ message: '已滴滴' });
        refreshUnread();
        void mutate(); // 刷新滴滴数
        // 进入创建的私密主题（返回 = 上一级 = 当前主题）
        navigate(`/d/${res.discussionId}`, {
          state: { from: routeLocation.pathname + routeLocation.search },
        });
      } catch (e) {
        notifications.show({
          message: e instanceof Error ? e.message : '滴滴失败',
          color: 'red',
        });
      } finally {
        setDidiLoading(null);
      }
    },
    [didiLoading, refreshUnread, mutate, navigate, routeLocation.pathname, routeLocation.search]
  );

  // 滴滴入口：点击即发送（角色已在按钮旁 Select 选好，留空 = 本人）
  const handleDidi = useCallback(
    (postId: number) => {
      if (!user) {
        requireLogin('滴滴');
        return;
      }
      void sendDidi(postId, didiCharId);
    },
    [user, didiCharId, sendDidi]
  );

  const handlePickImage = useCallback(async () => {
    if (uploading) return;
    const file = await pickImageFile();
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImageFile(file);
      setImageUrl(url);
      scheduleDraftSave(content, url);
    } catch (e) {
      notifications.show({ message: e instanceof Error ? e.message : '上传失败', color: 'red' });
    } finally {
      setUploading(false);
    }
  }, [uploading, content, scheduleDraftSave]);

  const removeImage = useCallback(() => {
    setImageUrl(null);
    scheduleDraftSave(content, null);
  }, [content, scheduleDraftSave]);

  const submitReply = useCallback(async () => {
    if (!user) {
      requireLogin('接戏');
      return;
    }
    const trimmed = content.trim();
    if (!trimmed && !imageUrl) {
      notifications.show({ message: '内容不能为空', color: 'red' });
      return;
    }
    if (!id) return;
    setSubmitting(true);
    try {
      // 后端契约（src/index.js）：body { content, imageUrl?, replyTo? }（camelCase）
      await api(`/discussions/${id}/posts`, {
        method: 'POST',
        body: {
          content: trimmed,
          ...(imageUrl ? { imageUrl } : {}),
          ...(replyTarget ? { replyTo: replyTarget.postId } : {}),
          ...(replyCharacterId ? { characterId: Number(replyCharacterId) } : {}),
        },
      });
      if (draftTimer.current) window.clearTimeout(draftTimer.current);
      try {
        await clearDraft(draftKey);
        void mutateDrafts();
      } catch {
        /* 草稿清理失败不影响回复成功 */
      }
      setContent('');
      setImageUrl(null);
      setReplyTarget(null);
      setDraftStatus('');
      notifications.show({ message: '回复成功' });
      // 焦点还给输入框，方便连续接戏（效率）
      try {
        textareaRef.current?.focus();
      } catch {
        /* 忽略 */
      }
      await mutate();
      // 刷新讨论列表缓存（评论数变化）
      await globalMutate(
        (k) => typeof k === 'string' && k.startsWith('/discussions'),
        undefined,
        { revalidate: true }
      );
    } catch (e) {
      notifications.show({ message: e instanceof Error ? e.message : '回复失败', color: 'red' });
    } finally {
      setSubmitting(false);
    }
  }, [user, content, imageUrl, id, replyTarget, replyCharacterId, draftKey, mutate, mutateDrafts]);

  const handleCopyLink = useCallback(async () => {
    if (!id) return;
    const ok = await copyText(location.origin + '/d/' + id);
    notifications.show({
      message: ok ? '链接已复制' : '复制失败，请手动复制',
      color: ok ? undefined : 'red',
    });
  }, [id]);

  const handleReport = useCallback(
    (targetType: ReportTargetType, targetId: number) => {
      if (!user) {
        requireLogin('举报');
        return;
      }
      openReportModal(targetType, targetId);
    },
    [user]
  );

  const handleAdmin = useCallback(
    (targetType: AdminTargetType, targetId: number, authorId: number, authorName: string) => {
      if (!user?.isAdmin) return;
      openPostAdminModal({
        targetType,
        targetId,
        authorId,
        authorName,
        onDelete: async (t, tid) => {
          notifications.show({ message: '已删除' });
          await mutate();
          await globalMutate(
            (k) =>
              typeof k === 'string' &&
              (k.startsWith('/discussions') || k.startsWith('/admin/users')),
            undefined,
            { revalidate: true }
          );
          if (t === 'discussion') navigate('/');
        },
        onModeration: async () => {
          notifications.show({ message: '已操作' });
          await globalMutate(
            (k) => typeof k === 'string' && k.startsWith('/admin/users'),
            undefined,
            { revalidate: true }
          );
        },
      });
    },
    [user, mutate, navigate]
  );

  // ===== 加载中骨架 =====
  if (isLoading && !data) {
    return (
      <>
        <Skeleton height={36} width={120} radius="md" mb={12} />
        <Skeleton height={130} radius="md" mb={12} />
        <Skeleton height={110} radius="md" mb={12} />
        <Skeleton height={110} radius="md" mb={12} />
      </>
    );
  }

  // ===== 404 / 无权限（有数据（含 SSR 内联 fallback）时优先渲染，后台重验证失败不覆盖） =====
  if (!data?.discussion) {
    return (
      <div className="empty">
        {error && error instanceof Error ? error.message || '主题不存在' : '主题不存在'}
      </div>
    );
  }

  const d = data.discussion as TopicDiscussion;
  const posts = (data.posts || []) as TopicPost[];
  const firstPost = posts[0] || null;

  // 私密主题（滴滴）：不显示误导性的接戏/滴滴按钮，底部输入区用"回复"措辞
  const isPrivate = !!d.is_private;
  // 从新到旧：首帖（1楼）在最前，第二个是（最新）回复卡片，其后依次是更早的回复；
  // 从旧到新：首帖在前，回复按楼层正序。默认从新到旧
  const replies = (posts.slice(1) as TopicPost[]).slice().sort((a, b) =>
    postOrder === 'new' ? b.number - a.number : a.number - b.number
  );
  // 主题内搜索：首帖（开场内容）与回复都参与匹配；首帖作为主题上下文始终显示，命中则高亮并计入
  const kw = searchQ.trim().toLowerCase();
  const firstMatched = !!firstPost && (!kw || (firstPost.content || '').toLowerCase().includes(kw));
  const visibleReplies = kw
    ? replies.filter((p) => (p.content || '').toLowerCase().includes(kw))
    : replies;
  const totalMatched = kw ? (firstMatched ? 1 : 0) + visibleReplies.length : posts.length;

  // 导出：图片记录（自选样式）/ 文字记录（全部帖子）
  const exportImage = () => {
    openImageExportModal(d, posts as TopicPost[]);
  };
  const exportText = () => {
    exportTextLog(d, posts as TopicPost[]);
    notifications.show({ message: `已导出文字记录（${posts.length} 条）` });
  };

  const jumpToLast = () => {
    if (lastPos === null) return;
    const el = document.querySelector(`[data-num="${lastPos}"]`);
    if (el) {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // 点击回复引用 → 跳转到被回复的帖子并短暂高亮
  const jumpToPost = (targetId: number) => {
    const target = data?.posts?.find((p) => p.id === targetId);
    if (!target) return;
    const el = document.querySelector(`[data-num="${target.number}"]`);
    if (el) {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
      const node = el as HTMLElement;
      node.classList.add('post-flash');
      window.setTimeout(() => node.classList.remove('post-flash'), 1600);
    }
  };

  // 回复引用：优先用后端 reply_to_author，缺失时按 id 查帖子
  const replyToAuthorOf = (p: TopicPost): string | null => {
    if (!p.reply_to_post_id) return null;
    if (p.reply_to_author) return p.reply_to_author;
    const target = posts.find((x) => x.id === p.reply_to_post_id);
    return target ? displayName(target) : '?';
  };

  // 接戏输入卡片（写下你的接戏……）：从新到旧时放在排序选择器之后、回复列表之前；
  // 从旧到新时放在最末尾（所有回复之后）
  const composerCard = (
    <div className="composer" ref={composerRef}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
          minHeight: 20,
        }}
      >
        {replyTarget ? (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            正在接戏{' '}
            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>@{replyTarget.author}</span>
            <Button variant="subtle" size="compact-xs" style={{ marginLeft: 8 }} onClick={cancelReply}>
              取消
            </Button>
          </div>
        ) : (
          <span />
        )}
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{draftStatus}</span>
      </div>

      {!user ? (
        <div className="empty" style={{ padding: '14px 0' }}>
          {isPrivate ? '登录后即可回复' : '登录后即可接戏'}
          <Button variant="subtle" size="compact-sm" style={{ marginLeft: 8 }} onClick={() => requireLogin('接戏')}>
            去登录
          </Button>
        </div>
      ) : (
        <>
          {replyCharacters.length > 0 && (
            <Select
              size="xs"
              label="以角色身份接戏（可选）"
              placeholder="不指定"
              data={replyCharacters.map((c: { id: number; name: string }) => ({ value: String(c.id), label: c.name }))}
              value={replyCharacterId}
              onChange={(v) => {
                replyCharTouchedRef.current = true;
                setReplyCharacterId(v);
                try {
                  if (v) localStorage.setItem(`zhuge-reply-char-${id}`, v);
                  else localStorage.removeItem(`zhuge-reply-char-${id}`);
                } catch {
                  /* 忽略 */
                }
              }}
              clearable
              searchable
              nothingFoundMessage="无匹配角色"
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
              mb={8}
            />
          )}
          <BBCodeEditor
            value={content}
            inputRef={textareaRef}
            onChange={(v) => {
              setContent(v);
              scheduleDraftSave(v, imageUrl);
            }}
            onKeyDown={(e) => {
              // Ctrl/Cmd+Enter 快捷提交（效率加速）
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                void submitReply();
              }
            }}
            placeholder={
              isPrivate
                ? '回复对方……'
                : replyTarget
                  ? `接戏 @${replyTarget.author}……`
                  : '写下你的接戏……'
            }
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button variant="subtle" size="compact-sm" onClick={handlePickImage} loading={uploading}>
              🖼 插图
            </Button>
            {imageUrl && (
              /* 上传后显示行内小缩略图（不撑高输入区），点 ✕ 移除 */
              <span style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
                <img
                  src={imageUrl}
                  alt="配图缩略图"
                  style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, display: 'block' }}
                />
                <button
                  type="button"
                  aria-label="移除图片"
                  onClick={removeImage}
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(0,0,0,.65)',
                    color: '#fff',
                    fontSize: 12,
                    lineHeight: 1,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                  }}
                >
                  ✕
                </button>
              </span>
            )}
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>每帖最多一张</span>
            <span style={{ flex: 1 }} />
            <Button onClick={submitReply} loading={submitting}>
              {isPrivate ? '回复' : '接戏'}
            </Button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      {/* 返回 */}
      <div style={{ marginBottom: 12 }}>
        <Button variant="subtle" size="compact-md" leftSection={<IconArrowLeft size={16} />} onClick={goBack}>
          返回
        </Button>
      </div>

      {/* 主题 + 首帖合并为同一张卡片（作者头 + 标题 + 标签 + 正文 + 操作行） */}
      {firstPost ? (
        <PostCard
          post={firstPost}
          floor="1楼"
          title={d.title}
          topicTags={data.tags}
          replyToAuthor={null}
          user={user}
          onReply={() => startReply(null)}
          onDidi={() => handleDidi(firstPost.id)}
          didiLoading={didiLoading === firstPost.id}
          onDidiChars={setDidiCharId}
          didiCharOptions={didiCharOptions}
          charMap={charMap}
          didiCharId={didiCharId}
          isPrivate={isPrivate}
          isFirstPost
          highlight={kw || undefined}
          onReport={() => handleReport('discussion', d.id)}
          onAdmin={
            user?.isAdmin
              ? () => handleAdmin('discussion', d.id, d.user_id, displayName(d))
              : undefined
          }
          onPoster={() =>
            openShareModal({
              id: d.id,
              title: d.title,
              content: firstPost.content || '',
              imageUrl: firstPost.image_url || null,
              author: {
                name: firstPost.author || displayName(d),
                avatarUrl: firstPost.author_avatar || null,
                gender: firstPost.author_gender || null,
              },
            })
          }
          onEdit={
            user && (user.id === firstPost.user_id || user.isAdmin)
              ? () => setEditingPost(firstPost)
              : undefined
          }
          onSource={() => setSourcePost(firstPost)}
          onAuthorStats={openAuthorStats}
          onCopyLink={handleCopyLink}
        />
      ) : (
        /* 无首帖：至少显示主题信息卡 */
        <div className="topic" style={{ marginBottom: 16 }}>
          <div className="topic-title">{d.title}</div>
          <div className="topic-meta">
            <Avatar user={d} size="sm" showGender />
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>{displayName(d)}</span>
            <span>{timeAgo(d.created_at)}</span>
            {!!d.is_private && <span className="private-badge">私密</span>}
            {data.tags && data.tags.length > 0 && (
              <span className="topic-tags">
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
        </div>
      )}

      {/* 回到上次阅读位置（长戏不迷路） */}
      {showJump && (
        <div style={{ position: 'sticky', top: 56, zIndex: 5, marginBottom: 8 }}>
          <Button size="compact-sm" variant="default" onClick={jumpToLast} leftSection={<span>↩</span>}>
            回到上次位置（{lastPos}楼）
          </Button>
        </div>
      )}

      {/* 私密主题：滴滴响应条。仅【收件人】（被滴滴方）显示「接受/婉拒」；
          发起者（作者）不显示响应条（避免看到"对方滴滴了你"） */}
      {isPrivate && data.isRecipient && (
        <DidiResponseBar status={d.didi_status ?? null} discussionId={d.id} onChanged={() => mutate()} />
      )}

      {/* 主题内搜索 / 导出记录 */}
      <Group justify="flex-end" mb="sm" gap={6}>
        <Button
          variant="subtle"
          size="compact-sm"
          onClick={() => {
            setSearchOpen((v) => !v);
            if (searchOpen) setSearchQ('');
          }}
        >
          {searchOpen ? '收起搜索' : '🔍 搜索本主题'}
        </Button>
        <Menu position="bottom-end" withArrow>
          <Menu.Target>
            <Button variant="subtle" size="compact-sm">
              ⬇ 导出
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<span>🖼</span>} onClick={exportImage}>
              导出图片记录
            </Menu.Item>
            <Menu.Item leftSection={<span>📄</span>} onClick={exportText}>
              导出文字记录
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      {searchOpen && (
        <TextInput
          size="sm"
          placeholder="搜索本主题帖子内容…"
          autoComplete="off"
          value={searchQ}
          onChange={(e) => setSearchQ(e.currentTarget.value)}
          mb="sm"
          autoFocus
          data-autofocus
          rightSection={
            searchQ ? (
              <Button variant="subtle" size="compact-xs" onClick={() => setSearchQ('')}>
                清除
              </Button>
            ) : undefined
          }
        />
      )}

      {/* 回复列表（默认从新到旧：1楼 → 最新回复 → 更早回复；可切换从旧到新） */}
      {replies.length > 1 && (
        <SegmentedControl
          size="xs"
          fullWidth
          mb="sm"
          value={postOrder}
          onChange={(v) => setPostOrder(v as 'new' | 'old')}
          data={[
            { label: '从新到旧', value: 'new' },
            { label: '从旧到新', value: 'old' },
          ]}
        />
      )}
      {kw && (
        <Text size="xs" c="dimmed" mb="sm">
          {totalMatched === 0
            ? `在 ${posts.length} 条帖子中没有找到「${searchQ.trim()}」`
            : `在 ${posts.length} 条帖子中匹配到 ${totalMatched} 条「${searchQ.trim()}」`}
        </Text>
      )}
      {kw && totalMatched === 0 && <div className="empty">没有匹配的帖子</div>}
      {/* 从新到旧：接戏输入卡片放在排序选择器之后、回复列表之前 */}
      {postOrder === 'new' && composerCard}
      {visibleReplies.map((p) => (
        <PostCard
          key={p.id}
          post={p}
          floor={`${p.number}楼`}
          replyToAuthor={replyToAuthorOf(p)}
          user={user}
          onReply={() => startReply({ postId: p.id, author: displayName(p) })}
          onDidi={() => handleDidi(p.id)}
          didiLoading={didiLoading === p.id}
          onDidiChars={setDidiCharId}
          didiCharOptions={didiCharOptions}
          charMap={charMap}
          didiCharId={didiCharId}
          isPrivate={isPrivate}
          highlight={kw || undefined}
          onReport={() => handleReport('post', p.id)}
          onAdmin={
            user?.isAdmin
              ? () => handleAdmin('post', p.id, p.user_id, displayName(p))
              : undefined
          }
          onJumpToReply={(targetId) => jumpToPost(targetId)}
          onAuthorStats={openAuthorStats}
          onSource={() => setSourcePost(p)}
          onEdit={
            user && (user.id === p.user_id || user.isAdmin) ? () => setEditingPost(p) : undefined
          }
        />
      ))}
      {posts.length === 0 && <div className="empty">暂无内容</div>}
      {/* 从旧到新：接戏输入卡片放在最末尾（所有回复之后） */}
      {postOrder === 'old' && composerCard}

      {/* 编辑帖子弹窗 */}
      {editingPost && (
        <EditPostModal
          post={editingPost}
          isFirstPost={editingPost.number === 1}
          discussionTitle={d.title}
          onClose={() => setEditingPost(null)}
          onSaved={() => mutate()}
        />
      )}

      {/* 查看源码弹窗 */}
      {sourcePost && <SourceCodeModal post={sourcePost} onClose={() => setSourcePost(null)} />}
    </>
  );
}

// ===== 帖子卡片（首帖/回复共用；首帖可带主题标题/标签） =====
interface PostCardProps {
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

// 按关键词把一行内容拆成高亮片段（大小写不敏感）
function renderLine(line: string, kw?: string): ReactNode {
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

function PostCard({
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

// ===== 帖子源码弹窗：显示原始 BBCode 文本（所见即所得的反面——看格式标签），可复制 =====
function SourceCodeModal({
  post,
  onClose,
}: {
  post: TopicPost;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = post.content || '（空）';

  const handleCopy = async () => {
    const ok = await copyText(post.content || '');
    if (ok) {
      setCopied(true);
      notifications.show({ color: 'teal', message: '源码已复制' });
      window.setTimeout(() => setCopied(false), 1500);
    } else {
      notifications.show({ color: 'red', message: '复制失败，请手动选择复制' });
    }
  };

  return (
    <Modal opened onClose={onClose} title={`源码 · ${displayName(post)}`} centered size={600}>
      <Stack gap="sm">
        <Text size="xs" c="dimmed">
          这是帖子内容的原始文本（含格式标签，如 [b]加粗[/b]、[color=red]颜色[/color]）。BBCode 不会被执行，仅原样展示。
        </Text>
        <pre
          style={{
            margin: 0,
            maxHeight: '50vh',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'ui-monospace, "SF Mono", Consolas, Menlo, monospace',
            fontSize: 13,
            lineHeight: 1.6,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '10px 12px',
          }}
        >
          {text}
        </pre>
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            关闭
          </Button>
          <Button onClick={handleCopy} loading={copied}>
            {copied ? '已复制' : '复制源码'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ===== 帖子编辑弹窗：内容（BBCode 编辑器）+ 配图；首帖可改标题 =====
function EditPostModal({
  post,
  isFirstPost,
  discussionTitle,
  onClose,
  onSaved,
}: {
  post: TopicPost;
  isFirstPost: boolean;
  discussionTitle: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [content, setContent] = useState(post.content || '');
  const [title, setTitle] = useState(discussionTitle);
  const [imageUrl, setImageUrl] = useState<string | null>(post.image_url || null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handlePickImage = async () => {
    const file = await pickImageFile();
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImageFile(file);
      setImageUrl(url);
    } catch (e) {
      notifications.show({ color: 'red', message: e instanceof Error ? e.message : '上传失败' });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    const c = content.trim();
    if (!c) {
      notifications.show({ color: 'red', message: '内容不能为空' });
      return;
    }
    if (isFirstPost && !title.trim()) {
      notifications.show({ color: 'red', message: '标题不能为空' });
      return;
    }
    setSaving(true);
    try {
      await api(`/posts/${post.id}`, {
        method: 'PUT',
        body: {
          content: c,
          ...(isFirstPost ? { title: title.trim() } : {}),
          imageUrl: imageUrl || null,
        },
      });
      notifications.show({ color: 'teal', message: '已保存' });
      onClose();
      onSaved();
    } catch (e) {
      notifications.show({ color: 'red', message: e instanceof Error ? e.message : '保存失败' });
      setSaving(false);
    }
  };

  return (
    <Modal opened onClose={onClose} title="编辑帖子" centered size={560}>
      <Stack gap="sm">
        {isFirstPost ? (
          <TextInput
            label="标题"
            maxLength={40}
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            autoComplete="off"
          />
        ) : null}
        <BBCodeEditor
          value={content}
          onChange={setContent}
          placeholder="修改内容……"
          minRows={3}
        />
        <Group gap="xs" align="center">
          <Button variant="subtle" size="compact-sm" loading={uploading} onClick={handlePickImage}>
            🖼 更换插图
          </Button>
          {imageUrl ? (
            <>
              {/* 行内小缩略图（不撑高弹窗） */}
              <span style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
                <img
                  src={imageUrl}
                  alt="配图缩略图"
                  style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, display: 'block' }}
                />
              </span>
              <Button variant="subtle" size="compact-xs" color="gray" onClick={() => setImageUrl(null)}>
                移除图片
              </Button>
            </>
          ) : (
            <Text size="xs" c="dimmed">
              无配图
            </Text>
          )}
        </Group>
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave} loading={saving}>
            保存
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
