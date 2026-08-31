// ===== 主题详情页 /d/:id：首帖 + 回复、接戏、滴滴、举报、管理、海报、分享 =====
// 页面编排 + 交互逻辑；帖子卡片/弹窗/分页/小部件已拆分到本目录独立文件
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button, Group, Menu, SegmentedControl, Select, Skeleton, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import useSWR, { mutate as globalMutate } from 'swr';
import { IconArrowLeft } from '@tabler/icons-react';
import { api } from '../../api/client';
import { fetcher, refreshListsAfterWrite, useDrafts, useUnread } from '../../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { requireLogin } from '../auth/authModals';
import { openShareModal } from '../share/shareModals';
import { exportTextLog, openImageExportModal } from './exportLog';
import { openReportModal, type ReportTargetType } from './reportModal';
import { openPostAdminModal, type AdminTargetType } from './postAdminModal';
import { openDeleteConfirmModal } from './deleteVerifyModal';
import { copyText, displayName, pickImageFile, tagTextColorOf, timeAgo, uploadImageFile } from '../../lib/utils';
import Avatar from '../../components/Avatar';
import BBCodeEditor from '../../components/BBCodeEditor';
import { clearDraft, saveDraft } from '../../lib/drafts';
import type { CharacterItem, DiscussionDetail, User } from '../../types';
import { PostCard } from './PostCard';
import { EditPostModal, SourceCodeModal } from './postModals';
import { DidiResponseBar } from './topicWidgets';
import { useTopicPagination } from './useTopicPagination';
import type { ReplyDraftData, TopicDiscussion, TopicPost } from './topicTypes';
import { GENDER_LABEL } from './topicTypes';

export default function TopicPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const { user } = useAuth();
  // 回复分页（useTopicPagination：多页缓存合并 + 滚动加载 + 预取下一页 + 目标帖定位）
  const {
    data,
    error,
    isLoading,
    mutate,
    postOrder,
    changeOrder,
    mergedPosts,
    totalPosts,
    hasMore,
    loadMoreRef,
    loadingMore,
    setPendingTarget,
  } = useTopicPagination(id);
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
  const [exporting, setExporting] = useState<'image' | 'text' | null>(null); // 导出全量楼层中（限流严格）
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
  // 通知点入/定位跳转的 query 处理守卫：只处理一次（data 变化/navigate 清除 query 的竞态会导致 effect 反复重跑）
  const autoReplyHandledRef = useRef(false);
  const focusPostHandledRef = useRef(false);

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
    const postsArr = mergedPosts;
    if (!postsArr.length) return;
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
  }, [mergedPosts, id, postOrder, searchOpen]);

  // 有上次位置且未读到底 → 显示"回到上次位置"（用总楼层判断是否已读到底）
  useEffect(() => {
    setShowJump(lastPos !== null && lastPos < totalPosts);
  }, [totalPosts, lastPos]);

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

  // 从通知点入：自动引用对方（公开主题的接戏/滴滴通知 → 回复框自动 @对方并滚动过去，不抢焦点）
  // 支持两种来源：站内通知弹窗（location.state.replyPostId）与系统推送通知（URL ?reply=&replyAuthor=）
  // 私密主题（滴滴/一对一私聊）不自动接戏（无"接戏某楼"概念，通知 url 也不带 reply，这里兜底）
  useEffect(() => {
    if (!user || !data) return;
    if (data.discussion.is_private) return; // 私密主题：不自动接戏
    const st = (routeLocation.state || {}) as { replyPostId?: number; replyAuthor?: string };
    const sp = new URLSearchParams(routeLocation.search);
    const qReply = sp.get('reply');
    const replyPostId =
      st.replyPostId ??
      (qReply && /^\d+$/.test(qReply) ? Number(qReply) : undefined);
    if (!replyPostId) return;
    const targetPost = mergedPosts.find((p) => p.id === replyPostId);
    if (!targetPost) {
      // 目标楼未加载（分页）：先定位加载其所在页，到位后再接戏（不置 handled，等数据到达重跑）
      setPendingTarget((prev) => prev ?? { id: replyPostId });
      return;
    }
    // 只处理一次：navigate 清 query 与 data 更新（乐观→真实）的竞态会让本 effect 反复重跑
    // （注意：在找到目标帖后才置位——乐观数据可能没有该帖，需等真实数据到达）
    if (autoReplyHandledRef.current) return;
    autoReplyHandledRef.current = true;
    const replyAuthor = st.replyAuthor || sp.get('replyAuthor') || undefined;
    setReplyTarget({ postId: replyPostId, author: replyAuthor || displayName(targetPost) });
    requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    // 清除 state + query：仅首次进入时生效，刷新/返回不重复触发
    navigate(routeLocation.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, data, mergedPosts, routeLocation.state, routeLocation.search, navigate]);

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
        void refreshListsAfterWrite(); // 私密列表/滴滴统计同步，回列表页无需刷新网页
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
    const prevData = data; // 记录乐观前数据（失败回滚用）
    // 乐观更新：构造本地新帖，先更新缓存立即显示（不等网络），POST 并行发出
    const optimisticPost: TopicPost = {
      id: Date.now() * -1, // 临时负 id 标记乐观帖
      discussion_id: Number(id),
      number: (totalPosts ?? mergedPosts.length) + 1, // 新楼 = 总楼层 + 1（分页下 posts.length 只是已加载数）
      created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
      user_id: user.id,
      content: trimmed,
      image_url: imageUrl || null,
      edited_at: null,
      is_private: 0,
      reply_to_post_id: replyTarget ? replyTarget.postId : null,
      author: user.username,
      author_gender: user.gender || null,
      author_avatar: user.avatar_url || null,
      character_id: replyCharacterId ? Number(replyCharacterId) : null,
    };
    try {
      // 本地立即显示（追加 + 评论数 +1）
      if (data) {
        await mutate(
          {
            ...data,
            discussion: { ...data.discussion, comment_count: (data.discussion.comment_count || 0) + 1 },
            posts: [...data.posts, optimisticPost],
          },
          { revalidate: false }
        );
      }
      // 后端真实请求（并行，乐观显示期间完成）
      await api(`/discussions/${id}/posts`, {
        method: 'POST',
        body: {
          content: trimmed,
          ...(imageUrl ? { imageUrl } : {}),
          ...(replyTarget ? { replyTo: replyTarget.postId } : {}),
          ...(replyCharacterId ? { characterId: Number(replyCharacterId) } : {}),
        },
      });
    } catch (e) {
      // POST 失败：回滚乐观更新（恢复原数据）
      if (prevData) {
        try {
          await mutate(prevData, { revalidate: false });
        } catch {
          /* 回滚失败忽略 */
        }
      }
      setSubmitting(false);
      notifications.show({ message: e instanceof Error ? e.message : '回复失败', color: 'red' });
      return;
    }
    // POST 成功：立即恢复按钮 + 清空输入 + 显示成功（不等任何后台刷新，避免"已成功但按钮还转圈"）
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    setSubmitting(false);
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
    // 后台：清理草稿 + 真实数据替换乐观帖 + 列表刷新（全部不阻塞按钮恢复）
    void (async () => {
      try {
        await clearDraft(draftKey);
      } catch {
        /* 草稿清理失败不影响回复成功 */
      }
      void mutateDrafts();
    })();
    // 用真实数据替换乐观帖（拿回真实 id/楼层/时间）；失败仅静默（乐观帖仍在，下次进入重拉）
    void mutate().catch(() => {});
    // 刷新讨论列表缓存（评论数/摘要变化），切回列表页无需手动刷新网页
    void refreshListsAfterWrite();
  }, [user, content, imageUrl, id, replyTarget, replyCharacterId, draftKey, mutate, mutateDrafts, data]);

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
          // 我的主题/私密列表也同步（当前页被删时直接离开，无需刷新网页）
          void refreshListsAfterWrite();
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
  // 分页合并后的全部已加载帖子（按楼层正序；'new' 模式渲染时再倒序）
  const posts = mergedPosts as TopicPost[];
  const firstPost = posts.find((p) => p.number === 1) || null;

  // 删除自己的帖子/主题（作者本人或管理员；首帖删除 = 删整个主题）
  // 作者自删：一个弹窗内完成「确认 + 自选密码/通行密钥验证 + 删除」；
  // 管理员删除无需验证（管理操作已有权限体系）。
  const handleDelete = useCallback(
    (post: TopicPost) => {
      const isFirst = post.number === 1;
      const isAdmin = !!user?.isAdmin;
      const doDelete = async (verify?: { password?: string; reauthToken?: string }) => {
        if (isFirst) {
          await api(`/discussions/${Number(id)}`, { method: 'DELETE', body: verify || {} });
          notifications.show({ message: '主题已删除' });
          void refreshListsAfterWrite();
          navigate('/');
        } else {
          await api(`/posts/${post.id}`, { method: 'DELETE', body: verify || {} });
          notifications.show({ message: '帖子已删除' });
          void mutate(); // 刷新详情（删除的帖消失）
          void refreshListsAfterWrite();
        }
      };
      if (isAdmin) {
        // 管理员：确认后直接删
        modals.openConfirmModal({
          title: isFirst ? '删除主题' : '删除帖子',
          centered: true,
          children: (
            <Text size="sm">
              {isFirst
                ? `确定删除整个主题「${d?.title || ''}」？此操作不可恢复。`
                : '确定删除这条帖子？此操作不可恢复。'}
            </Text>
          ),
          labels: { confirm: '删除', cancel: '取消' },
          confirmProps: { color: 'red' },
          onConfirm: async () => {
            try {
              await doDelete();
            } catch (e) {
              notifications.show({
                message: e instanceof Error ? e.message : '删除失败',
                color: 'red',
              });
            }
          },
        });
      } else {
        // 作者自删：确认 + 自选验证 + 删除（合并弹窗）
        openDeleteConfirmModal({
          isFirst,
          title: d?.title,
          onDelete: async (verify) => {
            try {
              await doDelete(verify);
            } catch (e) {
              // 删除失败：弹窗内展示错误（不关闭），可重试
              throw e;
            }
          },
        });
      }
    },
    [id, d, user, mutate, navigate]
  );

  // 私密主题（滴滴）：不显示误导性的接戏/滴滴按钮，底部输入区用"回复"措辞
  const isPrivate = !!d.is_private;
  // 从新到旧：首帖（1楼）在最前，第二个是（最新）回复卡片，其后依次是更早的回复；
  // 从旧到新：首帖在前，回复按楼层正序。默认从新到旧
  // useMemo 缓存排序结果：切换排序/其他状态变化时只重算必要部分（长戏几百楼时避免无谓重排）
  const replies = useMemo(
    () =>
      (posts.slice(1) as TopicPost[]).slice().sort((a, b) =>
        postOrder === 'new' ? b.number - a.number : a.number - b.number
      ),
    [posts, postOrder]
  );
  // 主题内搜索：首帖（开场内容）与回复都参与匹配；首帖作为主题上下文始终显示，命中则高亮并计入
  const kw = searchQ.trim().toLowerCase();
  const firstMatched = !!firstPost && (!kw || (firstPost.content || '').toLowerCase().includes(kw));
  const visibleReplies = useMemo(
    () => (kw ? replies.filter((p) => (p.content || '').toLowerCase().includes(kw)) : replies),
    [kw, replies]
  );
  const totalMatched = kw ? (firstMatched ? 1 : 0) + visibleReplies.length : totalPosts;

  // 导出：图片记录（自选样式）/ 文字记录 —— 需全量楼层，走专用导出接口（一次性全量返回，
  // 但限流 3 次/分钟，比普通读取严格得多；主题内只加载了分页，不能直接拿已加载的 posts）
  const fetchAllPosts = async (): Promise<TopicPost[]> => {
    const r = await api<{ data: DiscussionDetail }>(`/discussions/${Number(id)}/export`);
    return (r.data.posts || []) as TopicPost[];
  };
  const exportImage = async () => {
    if (exporting) return;
    setExporting('image');
    try {
      const all = await fetchAllPosts();
      openImageExportModal(d, all);
    } catch (e) {
      notifications.show({ message: e instanceof Error ? e.message : '导出失败', color: 'red' });
    } finally {
      setExporting(null);
    }
  };
  const exportText = async () => {
    if (exporting) return;
    setExporting('text');
    try {
      const all = await fetchAllPosts();
      exportTextLog(d, all);
      notifications.show({ message: `已导出文字记录（${all.length} 条）` });
    } catch (e) {
      notifications.show({ message: e instanceof Error ? e.message : '导出失败', color: 'red' });
    } finally {
      setExporting(null);
    }
  };

  const jumpToLast = () => {
    if (lastPos === null) return;
    const el = document.querySelector(`[data-num="${lastPos}"]`);
    if (el) {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      // 目标楼未加载（分页）：定位其所在页加载后跳转
      setPendingTarget({ number: lastPos });
    }
  };

  // 点击回复引用 → 跳转到被回复的帖子并短暂高亮
  const jumpToPost = (targetId: number) => {
    const target = posts.find((p) => p.id === targetId);
    if (!target) {
      // 目标未加载（可能在前面的分页里）：定位加载后跳转
      setPendingTarget({ id: targetId });
      return;
    }
    const el = document.querySelector(`[data-num="${target.number}"]`);
    if (el) {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
      const node = el as HTMLElement;
      node.classList.add('post-flash');
      window.setTimeout(() => node.classList.remove('post-flash'), 1600);
    }
  };

  // 定位原帖跳入：?focusPost=<帖id>（私密主题"定位原帖"按钮带此参数），
  // 数据就绪后跳转到该楼并高亮，然后清除 query（刷新/返回不重复触发）
  useEffect(() => {
    if (!data) return;
    const sp = new URLSearchParams(routeLocation.search);
    const fp = sp.get('focusPost');
    if (!fp || !/^\d+$/.test(fp)) return;
    const targetId = Number(fp);
    // 目标未加载（分页）：先定位加载其所在页，到位后跳转（不置 handled，等数据到达重跑）
    if (!mergedPosts.some((p) => p.id === targetId)) {
      setPendingTarget({ id: targetId });
      return;
    }
    // 只处理一次：navigate 清 query 与 data 更新（乐观→真实）的竞态会让本 effect 反复重跑 → 无限更新循环
    if (focusPostHandledRef.current) return;
    focusPostHandledRef.current = true;
    // 数据 + DOM 渲染完成后跳转（帖子可能未渲染完，稍作延迟）
    const t = window.setTimeout(() => jumpToPost(targetId), 300);
    navigate(routeLocation.pathname, { replace: true, state: null });
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, mergedPosts, routeLocation.search, navigate]);

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
          登录后即可接戏
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
              replyTarget ? `接戏 @${replyTarget.author}……` : '写下你的接戏……'
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
            {isPrivate && (
              <span className="private-badge" style={{ marginRight: 8 }}>
                私密
              </span>
            )}
            <Button onClick={submitReply} loading={submitting}>
              接戏
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
          onDelete={
            user && (user.id === firstPost.user_id || user.isAdmin)
              ? () => handleDelete(firstPost)
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
        <DidiResponseBar
          status={d.didi_status ?? null}
          discussionId={d.id}
          onChanged={() => {
            void mutate(); // 本主题响应状态即时更新
            void refreshListsAfterWrite(); // 私密列表响应状态同步，无需刷新网页
          }}
        />
      )}

      {/* 私密主题（滴滴）：定位原帖——跳到被滴滴的帖子所在公开主题并高亮该楼 */}
      {isPrivate && data.originPost && (() => {
        const origin = data.originPost!;
        return (
          <Group mb="sm" gap={8}>
            <Button
              size="compact-sm"
              variant="light"
              leftSection={<span>↩</span>}
              onClick={() =>
                navigate(`/d/${origin.discussionId}?focusPost=${origin.postId}`)
              }
            >
              定位原帖
              {origin.discussionTitle
                ? `：「${String(origin.discussionTitle).slice(0, 12)}」`
                : ''}
            </Button>
          </Group>
        );
      })()}

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
            <Menu.Item
              leftSection={<span>🖼</span>}
              onClick={() => void exportImage()}
              disabled={!!exporting}
            >
              导出图片记录{exporting === 'image' ? '（加载中…）' : ''}
            </Menu.Item>
            <Menu.Item
              leftSection={<span>📄</span>}
              onClick={() => void exportText()}
              disabled={!!exporting}
            >
              导出文字记录{exporting === 'text' ? '（加载中…）' : ''}
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
          onChange={(v) => changeOrder(v as 'new' | 'old')}
          data={[
            { label: '从新到旧', value: 'new' },
            { label: '从旧到新', value: 'old' },
          ]}
        />
      )}
      {kw && (
        <Text size="xs" c="dimmed" mb="sm">
          {totalMatched === 0
            ? `在已加载的 ${posts.length} 条中没有找到「${searchQ.trim()}」${hasMore ? '（继续向下加载可搜到更多）' : ''}`
            : `在已加载的 ${posts.length} 条中匹配到 ${totalMatched} 条「${searchQ.trim()}」${hasMore ? '（继续向下加载可搜到更多）' : ''}`}
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
          onDelete={
            user && (user.id === p.user_id || user.isAdmin) ? () => handleDelete(p) : undefined
          }
        />
      ))}
      {posts.length === 0 && <div className="empty">暂无内容</div>}
      {/* 分页加载更多：滚到底自动加载下一页（预取缓存命中，几乎零等待）；全部加载完显示总楼层 */}
      {hasMore ? (
        <>
          <div ref={loadMoreRef} style={{ height: 1 }} aria-hidden />
          <Text size="xs" c="dimmed" ta="center" my="sm">
            {loadingMore ? '加载中…' : '继续向下加载更多'}
          </Text>
        </>
      ) : posts.length > 1 ? (
        <Text size="xs" c="dimmed" ta="center" my="sm">
          已加载全部 {totalPosts} 楼
        </Text>
      ) : null}
      {/* 从旧到新：接戏输入卡片放在最末尾（所有回复之后） */}
      {postOrder === 'old' && composerCard}

      {/* 编辑帖子弹窗 */}
      {editingPost && (
        <EditPostModal
          post={editingPost}
          isFirstPost={editingPost.number === 1}
          discussionTitle={d.title}
          onClose={() => setEditingPost(null)}
          onSaved={() => {
            void mutate(); // 详情立即刷新（编辑内容/标题即时显示）
            void refreshListsAfterWrite(); // 列表摘要/标题同步，无需刷新网页
          }}
        />
      )}

      {/* 查看源码弹窗 */}
      {sourcePost && <SourceCodeModal post={sourcePost} onClose={() => setSourcePost(null)} />}
    </>
  );
}
