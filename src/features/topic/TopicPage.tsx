// ===== 主题详情页 /d/:id：首帖 + 回复、接戏、滴滴、举报、管理、海报、分享 =====
// 页面编排 + 交互逻辑；帖子卡片/弹窗/分页/小部件已拆分到本目录独立文件
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { exportTextLog, openImageExportModal } from './exportLog';
import { openReportModal, type ReportTargetType } from './reportModal';
import { openPostAdminModal, type AdminTargetType } from './postAdminModal';
import { openDeleteConfirmModal } from './deleteVerifyModal';
import { copyText, displayName, pickImageFile, tagTextColorOf, timeAgo, uploadImageFile } from '../../lib/utils';
import { docYBelowNav } from '../../lib/navOffset';
import Avatar from '../../components/Avatar';
import BBCodeEditor from '../../components/BBCodeEditor';
import { clearDraft, saveDraft } from '../../lib/drafts';
import type { CharacterItem, DiscussionDetail, User } from '../../types';
import { PostCard } from './PostCard';
import { SourceCodeModal } from './postModals';
import { DidiResponseBar } from './topicWidgets';
import { useTopicPagination } from './useTopicPagination';
import { openInviteModal } from './inviteModal';
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
    injectOptimistic,
    removeOptimistic,
  } = useTopicPagination(id);
  // 游客不拉认证接口（避免 401 噪音）：通知/草稿/皮都按登录态门控
  const { mutate: refreshUnread } = useUnread(!!user);
  const { data: draftsData, mutate: mutateDrafts } = useDrafts(!!user);

  // 挂载时强制刷新云草稿（SSR fallback 是页面加载时的旧快照，revalidateIfStale:false 不自动重拉）
  useEffect(() => {
    if (user && id) void mutateDrafts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  // 点击作者名 → 查看作者名片（皮/皮下/滴滴统计；动态导入）
  const openAuthorStats = (userId: number, name: string, characterId?: number | null) =>
    import('../private/authorDidiStats').then((m) => m.openAuthorDidiStats(userId, name, characterId));

  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<{ postId: number; author: string } | null>(null);
  // 接戏表单折叠（表单简化）：默认只显示输入框 + 提交 + 高级按钮；皮/插图/格式工具栏收进高级
  const [composerAdvanced, setComposerAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draftStatus, setDraftStatus] = useState('');
  const [exporting, setExporting] = useState<'image' | 'text' | null>(null); // 导出全量楼层中（限流严格）
  const [didiLoading, setDidiLoading] = useState<number | null>(null); // 正在滴滴的帖子 id
  // 滴滴身份：点击滴滴前在按钮旁 Select 选好皮（留空 = 本人）
  const [didiCharId, setDidiCharId] = useState<string | null>(null);
  // 接戏皮：SWR 共享缓存（SSR 内联即时显示）；未登录不请求
  const { data: replyCharsData } = useSWR<{ data: CharacterItem[] }>(user ? '/me/characters' : null, fetcher);
  const replyCharacters = replyCharsData?.data ?? [];
  // 皮 value → 完整信息映射（下拉选项显示外貌/性别用）
  const charMap = new Map(replyCharacters.map((c) => [String(c.id), c]));
  const didiCharOptions = replyCharacters.map((c) => ({ value: String(c.id), label: c.name }));
  const [replyCharacterId, setReplyCharacterId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(`zhuge-reply-char-${id}`);
    } catch {
      return null;
    }
  });
  // 用户是否手动操作过皮选择（手动选过/清空后，不再自动覆盖为主题皮）
  const replyCharTouchedRef = useRef(false);
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

  // 查看源码：sourcePost 非空时打开源码弹窗（显示原始 BBCode 文本）
  const [sourcePost, setSourcePost] = useState<TopicPost | null>(null);

  const composerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const draftTimer = useRef<number | null>(null);
  const restored = useRef(false);
  // 通知点入/定位跳转的 query 处理守卫：只处理一次（data 变化/navigate 清除 query 的竞态会导致 effect 反复重跑）。
  // 记录的是"已处理的 帖子 id"而非布尔：用户已在主题页时再点【另一条】通知（新 reply/focusPost 参数）
  // 会重新定位；同一条通知的重复重跑（清 query 后 effect 再触发）仍被挡住。
  const autoReplyHandledRef = useRef<number | null>(null);
  const focusPostHandledRef = useRef<number | null>(null);

  const draftKey = id ? `reply:${id}` : '';

  // 组件卸载时清掉未触发的防抖定时器
  useEffect(
    () => () => {
      if (draftTimer.current) window.clearTimeout(draftTimer.current);
    },
    []
  );

  // 题主默认皮 = 主题首帖用的皮（"主题皮"）：
  // 仅当本主题无记忆且用户未手动操作时，自动选中主题皮并记入 localStorage
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
  // 注意：页面还在顶部（scrollY≈0）时不记录——重开主题时首帧 1 楼必然在视野上沿，
  // 若立即写入会把 localStorage 里的"上次位置"覆盖成 1（实测复现：22 → 1），
  // 导致下次进入"回到上次位置"失效。回顶=读开头，本就不需要记忆位置。
  useEffect(() => {
    const postsArr = mergedPosts;
    if (!postsArr.length) return;
    const els = document.querySelectorAll('.post');
    const obs = new IntersectionObserver(
      (entries) => {
        if (window.scrollY <= 10) return; // 顶部不记录（重开首帧不污染上次位置）
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
  }, [mergedPosts, id, postOrder]);

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
    // iOS Safari：focus 必须在点击手势内同步调用，延迟到 requestAnimationFrame 会被忽略
    // （弹不出键盘/不聚焦）；滚动不依赖手势时序，留在 rAF 平滑滚动即可。
    // 接戏输入卡始终渲染（两种排序都在），点击接戏时 textarea 已挂载，同步 focus 可靠。
    try {
      textareaRef.current?.focus();
    } catch {
      /* 忽略 */
    }
    requestAnimationFrame(() => {
      const el = composerRef.current;
      if (!el) return;
      // 与跳其他楼层同一套定位：输入卡顶部对齐导航栏下方（docYBelowNav 补偿，
      // 非 scrollIntoView center——居中会把"正在接戏 @xx"与回复目标挤出视口）
      window.scrollTo({ top: docYBelowNav(el), behavior: 'smooth' });
      // 特效：短暂高亮输入卡（对齐跳楼 .post-flash 的视觉提示），表明已就位
      el.classList.add('composer-flash');
      window.setTimeout(() => el.classList.remove('composer-flash'), 1600);
    });
  }, []);

  // 从通知点入：自动引用对方（公开主题的接戏/滴滴通知 → 回复框自动 @对方并滚动过去，不抢焦点）
  // 支持两种来源：站内通知弹窗（location.state.replyPostId）与系统推送通知（URL ?reply=&replyAuthor=）
  // 私密主题（滴滴/一对一私聊）不自动接戏（无"接戏某楼"概念，通知 url 也不带 reply，这里兜底）
  // 用 useLayoutEffect：乐观帧已渲染（含目标楼），在浏览器绘制前 setPendingTarget →
  // useTopicPagination 的 useLayoutEffect 定位同步执行，首帧绘制出来就是目标楼位置
  //（useEffect 会晚一帧：先 paint 页面顶部再跳）
  useLayoutEffect(() => {
    if (!user || !data) return;
    if (data.discussion.is_private) return; // 私密主题：不自动接戏
    const st = (routeLocation.state || {}) as { replyPostId?: number; replyAuthor?: string };
    const sp = new URLSearchParams(routeLocation.search);
    const qReply = sp.get('reply');
    const replyPostId =
      st.replyPostId ??
      (qReply && /^\d+$/.test(qReply) ? Number(qReply) : undefined);
    if (!replyPostId) {
      // URL 无 reply（系统推送未带 / 用户已在页内）：重置守卫，下次再点【同一条】通知可重新定位
      autoReplyHandledRef.current = null;
      return;
    }
    // 通知带的目标楼层号（?replyNumber=）：定位优先按楼层号找——乐观种子里的目标回复帖是
    // 负 id 但带真实楼层号，按 number 立即命中 → 直接滚动零请求（不用等 around 拉目标页）
    const qReplyNumber = sp.get('replyNumber');
    const replyNumber = qReplyNumber && /^\d+$/.test(qReplyNumber) ? Number(qReplyNumber) : undefined;
    const targetPost = mergedPosts.find((p) => p.id === replyPostId);
    // 只处理一次（记录的是 replyPostId 而非布尔：用户已在主题页时再点【另一条】通知
    // （新 reply=）会重新定位；同一条通知的重复重跑仍被挡住）。
    // 注意：**不再 navigate 清 query**——清 query 的 navigate(replace) 是 history.replaceState，
    // iOS Safari 会对其触发滚动恢复归零（scrollRestoration='manual' 在 Safari 上不可靠），
    // 表现为"首帧位置正确、随后跳回顶部"。保留 query 不触发 replaceState，定位零跳变；
    // 刷新/返回会按链接语义重新定位到通知目标楼（自动接戏 @对方同链接语义）。
    if (autoReplyHandledRef.current === replyPostId) return;
    autoReplyHandledRef.current = replyPostId;
    const replyAuthor = st.replyAuthor || sp.get('replyAuthor') || undefined;
    // 自动 @对方（顶部回复框显示"接 xxx"）；targetPost 未加载（分页）时用通知带的 replyAuthor
    setReplyTarget({
      postId: replyPostId,
      author: replyAuthor || (targetPost ? displayName(targetPost) : ''),
    });
    // 滚动定位统一交给 pendingTarget：目标楼已加载（用户在其他楼层浏览过，缓存里有）也要滚过去，
    // 已加载立即滚动高亮，未加载先拉所在页再滚 —— 不再区分"找到/未找到"，否则在主题页点通知不跳楼。
    // 无条件覆盖（不用 prev ?? ）：上一次定位未完成（pendingTarget 非 null）时，新通知必须替换旧目标。
    // 优先按楼层号定位（SSR 内联目标页命中 → 零请求）；无楼层号时退回按帖子 id
    setPendingTarget(replyNumber ? { number: replyNumber } : { id: replyPostId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, data, mergedPosts, routeLocation.state, routeLocation.search]);

  // 通知弹窗点击"相同 URL 的通知"时（React Router navigate 相同 URL 是 no-op，不会重跑上面的 effect）：
  // 通知弹窗发 'zhuge:jump' 自定义事件，这里强制定位到该回复楼
  useEffect(() => {
    if (!user) return;
    const onJump = (e: Event) => {
      const d = (e as CustomEvent).detail as { replyPostId?: number; replyNumber?: number; replyAuthor?: string };
      if (!d?.replyPostId) return;
      const targetPost = mergedPosts.find((p) => p.id === d.replyPostId);
      setReplyTarget({
        postId: d.replyPostId,
        author: d.replyAuthor || (targetPost ? displayName(targetPost) : ''),
      });
      // 优先按楼层号定位（乐观种子命中 → 零请求）
      setPendingTarget(d.replyNumber ? { number: d.replyNumber } : { id: d.replyPostId });
    };
    window.addEventListener('zhuge:jump', onJump);
    return () => window.removeEventListener('zhuge:jump', onJump);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, mergedPosts]);

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

  // 滴滴发送：带可选皮（characterId=null 时以本人身份）
  const sendDidi = useCallback(
    async (postId: number, characterId: string | null) => {
      if (didiLoading !== null) return; // 已有滴滴请求进行中
      setDidiLoading(postId);
      try {
        // 后端 /api/zhuge/didi 返回顶层 { ok, didiCount, discussionId, title, coinReward }，
        // 不是 { data: {...} }（此前误读 res.data → undefined is not an object，且永不跳转）
        const res = await api<{ discussionId: number; coinReward?: number | null }>('/zhuge/didi', {
          method: 'POST',
          body: characterId ? { postId, characterId: Number(characterId) } : { postId },
        });
        notifications.show({ message: '已滴滴' });
        // 每日首次滴滴奖励格币
        if (res.coinReward) {
          notifications.show({ message: `🎉 首次滴滴 +${res.coinReward} 格币`, color: 'green' });
          void globalMutate('/me/coins');
        }
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

  // 滴滴入口：点击即发送（皮已在按钮旁 Select 选好，留空 = 本人）
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
    // 乐观更新：构造本地新帖，注入独立乐观列表立即显示（不进分页缓存，revalidate 不会覆盖它），POST 并行发出
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
      // 本地立即显示：乐观帖独立注入（mergedPosts 合并），并乐观 +1 评论数（不动 posts，避免被 revalidate 覆盖）
      if (data) {
        await mutate(
          {
            ...data,
            discussion: { ...data.discussion, comment_count: (data.discussion.comment_count || 0) + 1 },
          },
          { revalidate: false }
        );
      }
      injectOptimistic(optimisticPost);
      // 后端真实请求（并行，乐观显示期间完成）
      const r = await api<{ data: { coinReward?: number | null } }>(`/discussions/${id}/posts`, {
        method: 'POST',
        body: {
          content: trimmed,
          ...(imageUrl ? { imageUrl } : {}),
          ...(replyTarget ? { replyTo: replyTarget.postId } : {}),
          ...(replyCharacterId ? { characterId: Number(replyCharacterId) } : {}),
        },
      });
      // 每日首次接戏奖励格币
      if (r.data?.coinReward) {
        notifications.show({ message: `🎉 首次接戏 +${r.data.coinReward} 格币`, color: 'green' });
        void globalMutate('/me/coins');
      }
    } catch (e) {
      // POST 失败：回滚乐观更新（移除乐观帖 + 恢复原数据）
      removeOptimistic(optimisticPost.id);
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
    // 新回复在 order=new 第 1 页（最新一页）：无论当前浏览到第几页，强制刷新第 1 页让真实帖尽快覆盖乐观帖
    void globalMutate(`/discussions/${id}?page=1&order=new`).catch(() => {});
    // 刷新讨论列表缓存（评论数/摘要变化），切回列表页无需手动刷新网页
    void refreshListsAfterWrite();
  }, [user, content, imageUrl, id, replyTarget, replyCharacterId, draftKey, mutate, mutateDrafts, data]);

  const handleCopyLink = useCallback(async () => {
    if (!id) return;
    const ok = await copyText(
      location.origin + '/d/' + id + (user ? `?invite=${user.id}` : '')
    );
    notifications.show({
      message: ok ? '链接已复制' : '复制失败，请手动复制',
      color: ok ? undefined : 'red',
    });
  }, [id, user]);

  // 内嵌到网页：复制 iframe 源码（/embed/d/:id 极简版，可正常接戏），供他人嵌入自己的网页
  const handleCopyEmbed = useCallback(async () => {
    if (!id) return;
    const title = String(data?.discussion?.title || '').replace(/"/g, '&quot;');
    const code = `<iframe src="${location.origin}/embed/d/${id}" width="100%" height="600" style="border:0;border-radius:8px" loading="lazy" title="${title}" allowfullscreen></iframe>`;
    const ok = await copyText(code);
    notifications.show({
      message: ok ? 'iframe 嵌入代码已复制，粘贴到你的网页即可' : '复制失败，请手动复制',
      color: ok ? undefined : 'red',
    });
  }, [id, data]);

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

  // ===== 派生数据与 hooks（必须在所有条件 return 之前声明） =====
  // 背景：骨架屏/404 的条件 return 会让后面的 hooks 不执行，导致不同渲染分支 hooks 数量
  // 不一致 → React #300（fewer）/ #310（more）白屏。因此这里把原本在 return 之后的
  // useCallback/useMemo（handleDelete/replies/visibleReplies）及它们依赖的派生数据全部上移。
  // 分页合并后的全部已加载帖子（按楼层正序；'new' 模式渲染时再倒序）
  // 直接用 mergedPosts：翻页/换序瞬间主 data 短暂 undefined 时，已加载楼层仍完整渲染（不闪骨架/不误报 404）
  const posts = mergedPosts as TopicPost[];
  const firstPost = posts.find((p) => p.number === 1) || null;

  // 删除自己的帖子/主题（作者本人或管理员；首帖删除 = 删整个主题）
  // 作者自删：一个弹窗内完成「确认 + 密码验证 + 删除」；
  // 管理员删除无需验证（管理操作已有权限体系）。
  const handleDelete = useCallback(
    (post: TopicPost) => {
      const isFirst = post.number === 1;
      const isAdmin = !!user?.isAdmin;
      const discussionTitle = (data?.discussion as TopicDiscussion | undefined)?.title;
      const doDelete = async (verify?: { password?: string }) => {
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
                ? `确定删除整个主题「${discussionTitle || ''}」？此操作不可恢复。`
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
          title: discussionTitle,
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
    [id, data, user, mutate, navigate]
  );

  // 私密主题（滴滴）：不显示误导性的接戏/滴滴按钮，底部输入区用"回复"措辞
  const isPrivate = !!data?.discussion?.is_private;
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
  // 全部回复直接展示（已移除主题内搜索）
  const visibleReplies = replies;

  // 跳楼/定位（普通函数 + focusPost effect：effect 同样必须在条件 return 之前声明）
  const jumpToLast = () => {
    if (lastPos === null) return;
    const el = document.querySelector(`[data-num="${lastPos}"]`);
    if (el) {
      // 滚动到目标楼（顶部对齐导航栏下方）：window.scrollTo smooth + 动态测量导航栏高度，
      // 与通知定位（useTopicPagination doScroll）同一套补偿，避免写死 64px 在移动端偏大
      window.scrollTo({ top: docYBelowNav(el as HTMLElement), behavior: 'smooth' });
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
      const node = el as HTMLElement;
      window.scrollTo({ top: docYBelowNav(node), behavior: 'smooth' });
      node.classList.add('post-flash');
      window.setTimeout(() => node.classList.remove('post-flash'), 1600);
    }
  };

  // 定位原帖跳入：?focusPost=<帖id>（私密主题"定位原帖"按钮带此参数），
  // 数据就绪后跳转到该楼并高亮。**不再 navigate 清 query**（同 auto-reply：
  // 清 query 的 replaceState 触发 iOS Safari 滚动恢复归零，表现为"先正确、随后跳回顶部"）
  useEffect(() => {
    if (!data) return;
    const sp = new URLSearchParams(routeLocation.search);
    const fp = sp.get('focusPost');
    if (!fp || !/^\d+$/.test(fp)) {
      // URL 无 focusPost：重置守卫，下次再点【同一条】定位通知可重新定位
      focusPostHandledRef.current = null;
      return;
    }
    const targetId = Number(fp);
    // 只处理一次（记录 targetId 而非布尔：已在主题页时再点另一条定位通知（新 focusPost=）会重新跳转）
    if (focusPostHandledRef.current === targetId) return;
    focusPostHandledRef.current = targetId;
    // 用 pendingTarget 定位（与通知跳转同一机制）：目标已加载立即滚动高亮，
    // 未加载由 useTopicPagination 拉所在页再跳。**不用 300ms setTimeout**——
    // 挂载期间 mergedPosts 变化会让本 effect 重跑，cleanup 会取消未触发的定时器，
    // 而守卫又挡住重设 → 跳转永久丢失（实测 focusPost 场景不跳）。
    setPendingTarget({ id: targetId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, mergedPosts, routeLocation.search]);

  // ===== 加载中骨架 =====
  // 条件用 mergedPosts（已合并所有已加载页）而非裸 data：SSR 首帧渲染后底部哨兵可能
  // 立即触发翻页（total > 每页 20），主 data 的 key 切到 page=2（无缓存）→ data 短暂 undefined。
  // 此时 mergedPosts 仍有 page1 内容，不应闪骨架屏；真正空数据（无任何已加载楼层）才骨架。
  if (isLoading && mergedPosts.length === 0 && !data) {
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
  // data 来自 useTopicPagination 的 stableData：翻页/换序瞬间主 data 短暂 undefined 时
  // 已用已加载页顶替，只有真正无任何数据（主题不存在/无权限）才走到这里
  if (!data?.discussion) {
    return (
      <div className="empty">
        {error && error instanceof Error ? error.message || '主题不存在' : '主题不存在'}
      </div>
    );
  }

  const d = data.discussion as TopicDiscussion;

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
      openImageExportModal(d, all, user?.id);
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
      exportTextLog(d, all, user?.id);
      notifications.show({ message: `已导出文字记录（${all.length} 条）` });
    } catch (e) {
      notifications.show({ message: e instanceof Error ? e.message : '导出失败', color: 'red' });
    } finally {
      setExporting(null);
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
          登录后即可接戏
          <Button variant="subtle" size="compact-sm" style={{ marginLeft: 8 }} onClick={() => requireLogin('接戏')}>
            去登录
          </Button>
        </div>
      ) : (
        <>
          {composerAdvanced && replyCharacters.length > 0 && (
            <Select
              size="xs"
              // 皮说明移入选择器自身占位（hint）：与滴滴选择器一致，「（可选）皮上」；
              // 可见 label 移除后补 aria-label 保留无障碍名称
              placeholder="（可选）皮上"
              aria-label="接戏皮（可选）"
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
              nothingFoundMessage="无匹配皮"
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
            showToolbar={composerAdvanced}
            placeholder={
              // 私密主题（滴滴/一对一私聊）用"回复"措辞（P4 措辞统一）；公开主题用"接戏"
              replyTarget
                ? `接戏 @${replyTarget.author}……`
                : isPrivate
                  ? '写下你的回复……'
                  : '写下你的接戏……'
            }
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button variant="subtle" size="compact-sm" onClick={() => setComposerAdvanced((v) => !v)}>
              {composerAdvanced ? '收起高级设置 ▴' : '高级设置 ▾'}
            </Button>
            {composerAdvanced && (
              <>
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
              </>
            )}
            <span style={{ flex: 1 }} />
            {isPrivate && (
              <span className="private-badge" style={{ marginRight: 8 }}>
                私密
              </span>
            )}
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
          onReport={() => handleReport('discussion', d.id)}
          onAdmin={
            user?.isAdmin
              ? () => handleAdmin('discussion', d.id, d.user_id, displayName(d))
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
          onEmbed={!isPrivate ? handleCopyEmbed : undefined}
          onInvite={
            !isPrivate && user && d.user_id === user.id
              ? () => openInviteModal(Number(id), d.title)
              : undefined
          }
          onExportImage={() => void exportImage()}
          onExportText={() => void exportText()}
          exportBusy={!!exporting}
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

      {/* 主题级操作（邀请接戏/导出记录）已收进首楼卡片的「⋯ 更多」菜单，
          不再在卡片下方单独占一行（与帖级操作行分开导致视觉碎行） */}

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
      {/* 从新到旧：接戏输入卡片放在排序选择器之后、回复列表之前 */}
      {postOrder === 'new' && composerCard}
      {visibleReplies.map((p) => (
        <PostCard
          // key 用楼层号而非帖子 id：乐观帖(负 id)→真实帖(正 id)替换时 key 不变，
          // React 原地更新内容不重建 DOM → 定位后数据到达不再"闪烁一帧位置不对"
          //（楼层号在 mergedPosts 中按 number 去重，唯一且稳定）
          key={p.number}
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
          onReport={() => handleReport('post', p.id)}
          onAdmin={
            user?.isAdmin
              ? () => handleAdmin('post', p.id, p.user_id, displayName(p))
              : undefined
          }
          onJumpToReply={(targetId) => jumpToPost(targetId)}
          onAuthorStats={openAuthorStats}
          onSource={() => setSourcePost(p)}
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

      {/* 查看源码弹窗 */}
      {sourcePost && <SourceCodeModal post={sourcePost} onClose={() => setSourcePost(null)} />}
    </>
  );
}
