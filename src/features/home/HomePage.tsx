// ===== 首页：推荐 feed / 列表 + 标签条 + 发帖弹窗 + 更多标签选择 =====
// 标签有独立路由（/ 全部、/tag/:id），排序走 URL query，返回/前进不丢选择
// 开戏/标签弹窗统一走 openModalOnce（全局互斥：同 id 防抖 + closeAll 后等退出动画再打开）
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { modals } from '@mantine/modals';
import { mutate } from 'swr';
import { useAuth } from '../auth/AuthContext';
import { requireLogin } from '../auth/authModals';
import { useDiscussions, useTags, refreshListsAfterWrite, preloadAllPrimaryLists } from '../../api/hooks';
import { readInitData } from '../../api/client';
import { openModalOnce } from '../../lib/modals';
import { focusOnEnter } from '../../lib/modalFocus';
import type { Discussion, InitData, User } from '../../types';
import TagBar, { type SortKey } from './tagbar';
import FeedView from './feed';
import ListView from './list';
import { ComposerContent } from './composer';
import { seedTopicCacheFromList } from './composer';
import { TagPickerContent } from './tagPicker';

// 推荐随机种子：分钟级稳定值（与 SSR 一致：Math.floor(now/60000)+1）。
// 一分钟内所有推荐请求同 seed → 预加载的 recommend 缓存可命中（切标签/排序秒出）；
// 每分钟自然变化，保留"刷新推荐顺序有变化"的体验。
const newSeed = () => Math.floor(Date.now() / 60000) + 1;

const SORT_KEYS: SortKey[] = ['recommend', 'latest', 'hot'];

// 打开注册弹窗（动态导入；点击手势内同步执行以便 iOS 聚焦）
const openRegisterModal = () => import('../auth/authModals').then((m) => m.openRegisterModal());

function Hero({ user }: { user: User | null | undefined }) {
  // 未登录访客：欢迎语与已登录一致，额外加注册引导按钮（宣传落地引导）
  if (!user) {
    return (
      <div className="hero hero-landing">
        <h1>
          欢迎来到《主格》
          <span className="beta-badge" style={{ verticalAlign: 'middle', marginLeft: 8 }}>
            快速迭代中
          </span>
        </h1>
        <p>这是一个文字角色扮演（语C）平台，可以「滴滴」一键创建仅双方可见的私密主题。</p>
        <button type="button" className="hero-cta" onClick={openRegisterModal}>
          注册《主格》，开始你的故事
        </button>
      </div>
    );
  }
  return (
    <div className="hero">
      <h1>
        欢迎来到《主格》
        <span className="beta-badge" style={{ verticalAlign: 'middle', marginLeft: 8 }}>
          快速迭代中
        </span>
      </h1>
      <p>这是一个文字角色扮演（语C）平台，可以「滴滴」一键创建仅双方可见的私密主题。</p>
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { tags } = useTags();

  // 浏览器标签标题（首页/标签）
  useEffect(() => {
    document.title = '主格 - 文字角色扮演（语C）平台';
  }, []);

  // 预加载：所有主标签 × 全部三种排序的列表数据填充 SWR 缓存，
  // 切标签/排序时秒切零加载（preloadAllPrimaryLists 内部延迟+分批，不阻塞首屏）
  useEffect(() => {
    if (tags.length) preloadAllPrimaryLists(tags);
  }, [tags]);

  // 首页三种模式（推荐/列表/加载中）统一去掉 container 顶部 padding，让 hero 紧贴导航栏
  //（推荐模式由 feed-lock 去掉；列表/加载中无 feed-lock，这里统一处理，消除 hero 上方空隙）
  useEffect(() => {
    document.body.classList.add('zhuge-home');
    return () => document.body.classList.remove('zhuge-home');
  }, []);

  // URL 即状态：/tag/:tagId 选标签，?sort= 选排序（返回/前进自动恢复）
  const { tagId } = useParams<{ tagId?: string }>();
  const [searchParams] = useSearchParams();
  const urlTag = tagId && /^\d+$/.test(tagId) ? Number(tagId) : null;
  const urlSortRaw = searchParams.get('sort') as SortKey | null;
  const urlSort: SortKey = urlSortRaw && SORT_KEYS.includes(urlSortRaw) ? urlSortRaw : 'recommend';

  // SSR 首帧快照：内联 discussions/seed/hasMore 直接作为首屏状态，
  // 首帧即渲染内容或空态（不再闪"加载中"）；无内联数据时回落随机种子+空列表
  const [initSnap] = useState(() => {
    const d = readInitData<InitData>();
    const seed = d?.seed ?? newSeed();
    return {
      seed,
      base: `${urlSort}:${urlTag ?? 'all'}:${seed}`,
      items: Array.isArray(d?.discussions) ? d.discussions : [],
      hasMore: d?.hasMore ?? true,
    };
  });

  const [sort, setSort] = useState<SortKey>(urlSort);
  const [tag, setTag] = useState<number | null>(urlTag);
  // 初始种子：SSR 内联（与内联讨论列表同 key，命中 SWR fallback 零请求）；否则随机
  const [feedSeed, setFeedSeed] = useState<number>(initSnap.seed);
  const tagRef = useRef(urlTag);
  const sortRef = useRef(urlSort);

  // URL 变化（点标签 / 前进后退 / 直接输入）→ 同步状态；
  // 换标签或进入推荐 → 重置随机种子（回到同一标签不重置，保持推荐顺序稳定）
  useEffect(() => {
    const tagChanged = urlTag !== tagRef.current;
    const enteringRecommend = urlSort === 'recommend' && sortRef.current !== 'recommend';
    tagRef.current = urlTag;
    sortRef.current = urlSort;
    setTag(urlTag);
    setSort(urlSort);
    if (tagChanged || enteringRecommend) setFeedSeed(newSeed());
  }, [urlTag, urlSort]);

  // 分页累积（feed/列表共用 useDiscussions）
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Discussion[]>(initSnap.items);
  const [hasMore, setHasMore] = useState(initSnap.hasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  hasMoreRef.current = hasMore;
  const pageRef = useRef(1);
  pageRef.current = page;
  const appliedKeyRef = useRef<string | null>(null);
  const itemsRef2 = useRef<Discussion[]>([]);
  itemsRef2.current = items;

  // 渲染门控：items 所属的 sort:tag:seed 与当前一致才渲染（避免切换时闪现旧卡片）
  const baseKey = `${sort}:${tag ?? 'all'}:${feedSeed}`;
  const baseKeyRef = useRef(baseKey);
  baseKeyRef.current = baseKey;
  const [itemsBase, setItemsBase] = useState(initSnap.base);

  const { result, key } = useDiscussions({
    sort,
    page,
    tag,
    seed: sort === 'recommend' ? feedSeed : undefined,
  });

  // 切标签/排序/换 seed → 重置分页并清空当前列表（渲染门控兜底，防止旧卡片闪现）
  useEffect(() => {
    setPage(1);
    setItems([]);
    setHasMore(true);
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [sort, tag, feedSeed]);

  // 每页数据就绪：page=1 替换，page>1 追加；同 key 重复结果（重验证）跳过避免重复
  useEffect(() => {
    if (!result) return;
    const currentPage = pageRef.current;
    if (currentPage === 1) {
      // 首次（key 变化/标签切换）→ 整体替换；
      // 同 key 的 SWR 重新验证（聚焦回来/后台刷新）→ 保持现有列表，
      // 避免推荐流重排导致当前显示的卡片瞬间变成另一张（"一闪而逝换主题"）
      if (appliedKeyRef.current === key && itemsRef2.current.length > 0) {
        setHasMore(result.meta.hasMore);
      } else {
        appliedKeyRef.current = key;
        setItemsBase(baseKeyRef.current);
        setItems(result.data);
        setHasMore(result.meta.hasMore);
      }
    } else if (appliedKeyRef.current !== key) {
      appliedKeyRef.current = key;
      setItems((prev) => [...prev, ...result.data]);
      setHasMore(result.meta.hasMore);
    }
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [result, key]);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setPage((p) => p + 1);
  }, []);

  // 切标签：写入路由（返回/前进可恢复）；保留当前排序
  const switchTag = useCallback(
    (id: number | null) => {
      if (id === urlTag) return;
      const path = id ? `/tag/${id}` : '/';
      navigate(path + (sort !== 'recommend' ? `?sort=${sort}` : ''));
    },
    [navigate, urlTag, sort]
  );

  // 排序切换：写入 URL query（replace，不污染历史）；进入推荐重置种子
  const changeSort = useCallback(
    (s: SortKey) => {
      if (s === urlSort) return;
      const path = urlTag ? `/tag/${urlTag}` : '/';
      navigate(path + (s !== 'recommend' ? `?sort=${s}` : ''), { replace: true });
    },
    [navigate, urlTag, urlSort]
  );

  // 打开主题：记录来源（返回时回到上一级即该标签/列表）+ 乐观种入详情缓存
  // （用列表已有数据预填充详情页，跳转后首帧直接渲染不闪骨架屏）
  const openTopic = useCallback(
    (id: number) => {
      const d = itemsRef2.current.find((x) => x.id === id);
      if (d) seedTopicCacheFromList(d, tags);
      // 预加载详情页 chunk（点击时并行下载，跳转后零等待）
      void import('../topic/TopicPage');
      navigate(`/d/${id}`, { state: { from: location.pathname + location.search } });
    },
    [navigate, location.pathname, location.search]
  );

  // 发帖成功：刷新列表/标签缓存 + 跳转详情（记录来源）
  const handlePosted = useCallback(
    (id: number) => {
      // 全局刷新：所有排序/标签列表 + 标签计数 + 我的主题，切回列表页无需手动刷新网页
      void refreshListsAfterWrite();
      navigate(`/d/${id}`, { state: { from: location.pathname + location.search } });
    },
    [navigate, location.pathname, location.search]
  );

  const openComposer = useCallback(() => {
    if (!user) {
      requireLogin('开戏');
      return;
    }
    // 打开发帖弹窗前拉全量标签 + 强制刷新云草稿（SSR fallback 是页面加载时的旧快照，
    // revalidateIfStale:false 不自动重拉 → 手动重新验证，保证恢复最新云草稿）
    void mutate('/tags');
    void mutate('/me/drafts');
    openModalOnce(
      'composer',
      (m) => {
        m.open({
          modalId: 'composer',
          title: '开戏',
          centered: true,
          size: 'md',
          ...focusOnEnter('input'), // 标题输入框（弹窗内第一个输入框）
          children: <ComposerContent user={user} tags={tags} onPosted={handlePosted} />,
        });
      },
      true // 手势内同步叫醒键盘（iOS）
    );
  }, [user, tags, handlePosted]);
  const openTagPicker = useCallback(() => {
    // 打开"更多标签"弹窗前拉全量标签（SSR 首屏只内联了主标签）
    void mutate('/tags');
    openModalOnce(
      'tag-picker',
      (m) => {
        m.open({
          modalId: 'tag-picker',
          title: '选择标签',
          centered: true,
          size: 'md',
          ...focusOnEnter('input'), // 搜索标签输入框
          children: (
            <TagPickerContent
              tags={tags}
              activeTag={tag}
              onPick={(id) => {
                modals.closeAll();
                switchTag(id);
              }}
            />
          ),
        });
      },
      true // 手势内同步叫醒键盘（iOS）
    );
  }, [tags, tag, switchTag]);

  const hero = <Hero user={user} />;
  const tagbar = (
    <TagBar
      tags={tags}
      activeTag={tag}
      sort={sort}
      onSortChange={changeSort}
      onTagChange={switchTag}
      onOpenComposer={openComposer}
      onOpenTagPicker={openTagPicker}
    />
  );

  // ===== 推荐模式（feed）=====
  if (sort === 'recommend') {
    const ready = itemsBase === baseKey;
    if (!ready || items.length === 0) {
      // 空态（首次加载 / 切换中 / 无数据）：不挂 feed，保持页面正常滚动。
      // 判定用 result 而非 isLoading：SWR 的 isLoading 首帧恒为 true（即使 fallback 命中），
      // 会闪"加载中"；result 在 fallback/内联数据命中时首帧即存在
      return (
        <>
          {hero}
          {tagbar}
          <div className={!result || !ready ? 'load-more' : 'empty'}>
            {!result || !ready ? '加载中…' : '还没有主题，来发第一个吧！'}
          </div>
        </>
      );
    }
    return (
      <FeedView
        items={items}
        tags={tags}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
        onOpenTopic={openTopic}
        hero={hero}
        tagbar={tagbar}
        resetKey={`${sort}:${tag ?? 'all'}:${feedSeed}`}
      />
    );
  }

  // ===== 列表模式（最新/热门）=====
  const listReady = itemsBase === baseKey;
  return (
    <>
      {hero}
      {tagbar}
      {!listReady || items.length === 0 ? (
        <div className={!result || !listReady ? 'load-more' : 'empty'}>
          {!result || !listReady ? '加载中…' : '还没有主题，来发第一个吧！'}
        </div>
      ) : (
        <ListView
          items={items}
          tags={tags}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          onOpenTopic={openTopic}
        />
      )}
    </>
  );
}
