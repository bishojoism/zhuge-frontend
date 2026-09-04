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
import GridView from './grid';
import ListView from './list';
import { ComposerContent } from './composer';
import { seedTopicCacheFromList } from './composer';
import { TagPickerContent } from './tagPicker';

// 推荐随机种子：分钟级稳定值（与 SSR 一致：Math.floor(now/60000)+1）。
// 一分钟内所有推荐请求同 seed → 预加载的 recommend 缓存可命中（切标签/排序秒出）；
// 每分钟自然变化，保留"刷新推荐顺序有变化"的体验。
const newSeed = () => Math.floor(Date.now() / 60000) + 1;

const SORT_KEYS: SortKey[] = ['recommend', 'latest', 'hot'];

// 弹窗内容自己订阅 /tags（useTags 为全局 SWR hook，portal 内上下文同样生效）：
// openModalOnce 的 children 是打开瞬间的快照 —— 若 /tags 的"瘦身快照补拉全量"尚未完成，
// 弹窗会一直停留在"只有主标签"直到重开；让内容自订阅后，补拉完成时首开弹窗也会实时补全。
function ModalComposerBody(props: { user: User; defaultTagId: number | null; onPosted: (id: number) => void }) {
  const { tags } = useTags();
  return <ComposerContent user={props.user} tags={tags} defaultTagId={props.defaultTagId} onPosted={props.onPosted} />;
}
function ModalTagPickerBody(props: { activeTag: number | null; onPick: (id: number | null) => void }) {
  const { tags } = useTags();
  return <TagPickerContent tags={tags} activeTag={props.activeTag} onPick={props.onPick} />;
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

  // 分钟级滚动预加载：preloadAllPrimaryLists 内部按分钟 dedupe（preloadedMinute），
  // 跨分钟后 recommend 的 seed 变化 → 旧分钟 seed 的缓存 key 不再命中 → 列表模式停留
  // 超过 1 分钟再切回推荐时必然闪骨架（整屏闪）。这里每 10s 检查一次，分钟边界后
  // 10s 内补拉当前分钟的推荐缓存。开销极小：latest/hot 的 key 不含 seed、跨分钟相同，
  // 被 preloadedKeys Set 跳过；只补拉新 seed 的 recommend key（全部 + 各主标签）。
  useEffect(() => {
    if (!tags.length) return;
    let lastMinute = Math.floor(Date.now() / 60000);
    const iv = window.setInterval(() => {
      const m = Math.floor(Date.now() / 60000);
      if (m !== lastMinute) {
        lastMinute = m;
        preloadAllPrimaryLists(tags);
      }
    }, 10000);
    return () => window.clearInterval(iv);
  }, [tags]);

  // 首页三种模式（推荐/列表/加载中）统一去掉 container 顶部 padding，让 hero 紧贴导航栏
  //（推荐模式由 feed-lock 去掉；列表/加载中无 feed-lock，这里统一处理，消除 hero 上方空隙）
  useEffect(() => {
    document.body.classList.add('zhuge-home');
    // 网格/列表视图不锁滚动：清理历史滑卡版可能残留的锁（bfcache 返回或旧版本把
    // feed-lock + overscroll-behavior:none 留在 body/html 上，新视图无 FeedView 去清）
    document.body.classList.remove('feed-lock');
    document.body.style.overscrollBehavior = '';
    document.documentElement.style.overscrollBehavior = '';
    return () => {
      document.body.classList.remove('zhuge-home');
      document.body.classList.remove('feed-lock');
      document.body.style.overscrollBehavior = '';
      document.documentElement.style.overscrollBehavior = '';
    };
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
  // 初始种子：SSR 内联（每次请求随机 → 推荐池 shuffle 每次不同；与内联讨论列表同 key，
  // 命中 SWR fallback 零请求）；否则随机
  const [feedSeed, setFeedSeed] = useState<number>(initSnap.seed);
  const tagRef = useRef(urlTag);
  const sortRef = useRef(urlSort);

  // 每次挂载（刷新 / 从其它页返回）强制换随机推荐种子：
  // 无 cookie 首页整页缓存会复用旧 seed 的内联列表（缓存窗口内刷新顺序不变），
  // mount 后换随机 seed 重新洗牌 → 刷新前后进入推荐看到不同的列表顺序
  useEffect(() => {
    setFeedSeed(Math.floor(Math.random() * 1e9) + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // URL 变化（点标签 / 前进后退 / 直接输入）→ 同步状态。
  // 进入推荐 → 用 SSR 内联 seed（每次刷新网页时 SSR 重新随机 → 刷新前后切回推荐的序列不同；
  //   且与 SSR 预渲染的内联数据同 seed 同序列 → 请求结果一致，预渲染生效、零 API 秒开、无跳变）；
  // 切标签（仍在推荐）→ 分钟级 seed（预加载缓存命中，秒切）
  useEffect(() => {
    const tagChanged = urlTag !== tagRef.current;
    const enteringRecommend = urlSort === 'recommend' && sortRef.current !== 'recommend';
    tagRef.current = urlTag;
    sortRef.current = urlSort;
    setTag(urlTag);
    setSort(urlSort);
    if (enteringRecommend) {
      // 从列表模式切回推荐：用当前分钟 seed（与 preloadAllPrimaryLists 预热一致，
      // 推荐缓存命中 → 切回立即显示内容，不闪骨架/闪烁）。
      // 不能用 initSnap.seed（页面加载时旧种子，可能已过期且无缓存）。
      setFeedSeed(newSeed());
    } else if (tagChanged) {
      setFeedSeed(newSeed());
    }
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

  // 切标签/排序/换 seed → 重置分页并清空当前列表。
  // SSR 内联 seed 与前端请求 seed 一致（同 key 同序列），整体替换后内容一致，无跳变
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
          children: (
            <ModalComposerBody user={user} defaultTagId={tag} onPosted={handlePosted} />
          ),
        });
      },
      true // 手势内同步叫醒键盘（iOS）
    );
  }, [user, tags, tag, handlePosted]);
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
            <ModalTagPickerBody
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
    // cacheHit：新 key 有缓存（预加载命中）且 items 尚未对齐（itemsBase 未更新）→ 直接用 result。
    // 注意 result 是当前 key 的 SWR 数据（切换标签后 key 已变），不会混入旧标签数据。
    const cacheHit = !!result && !ready;
    // 显示数据：
    // - ready（items 属于当前 baseKey）：用 items；items 为空（整页访问详情页后回首页，
    //   initSnap 残留无数据）时用当前 key 的 result 兜底，避免空态"还没有主题"
    // - !ready（切换标签瞬间 items 还是旧标签）：绝不用旧 items（否则"一闪而逝"旧卡片），
    //   用 result（新 key 预加载缓存）或空（加载中）
    const displayItems = ready
      ? items.length > 0 ? items : result?.data || []
      : cacheHit ? result.data : [];
    const displayHasMore = ready
      ? items.length > 0 ? hasMore : result?.meta.hasMore || false
      : cacheHit ? result.meta.hasMore : false;
    // 有可显示内容（旧 items 或新 result）→ 直接渲染；仅首次加载/切换中（无内容）显示加载中
    // ===== 推荐网格（原滑卡视图改为双列网格 + 无限滚动，与列表模式同构滚动/加载） =====
    return (
      <>
        <div className="list-sticky">{tagbar}</div>
        {displayItems.length === 0 ? (
          !result || (!ready && !cacheHit) ? (
            <div className="feed-loading-skeleton" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="feed-skeleton-card">
                  <div className="feed-skeleton-block" style={{ width: '30%', height: 14 }} />
                  <div className="feed-skeleton-block" style={{ width: '70%', height: 18, marginTop: 8 }} />
                  <div className="feed-skeleton-block" style={{ width: '100%', height: 12, marginTop: 8 }} />
                  <div className="feed-skeleton-block" style={{ width: '50%', height: 20, marginTop: 12 }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">还没有主题，来发第一个吧！</div>
          )
        ) : (
          <GridView
            items={displayItems}
            tags={tags}
            hasMore={displayHasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
            onOpenTopic={openTopic}
          />
        )}
      </>
    );
  }

  // ===== 列表模式（最新/热门）=====
  const listReady = itemsBase === baseKey;
  // 同推荐模式：预加载缓存命中时第一帧直接用 result.data，避免"加载中"闪帧
  const listCacheHit = !!result && !listReady;
  // 与推荐模式一致：!listReady（切换标签瞬间 items 还是旧标签）绝不用旧 items，
  // 用 result（新 key 缓存）或空；listReady 时 items 空（整页访问详情页后回首页）用 result 兜底
  const listItems = listReady
    ? items.length > 0 ? items : result?.data || []
    : listCacheHit ? result.data : [];
  const listHasMore = listReady
    ? items.length > 0 ? hasMore : result?.meta.hasMore || false
    : listCacheHit ? result.meta.hasMore : false;

  return (
    /* 列表模式：hero/tagbar 用 sticky 吸顶（不随列表滚走），列表区正常文档流滚动。
       不锁页面高度——页面滚动条保留但横幅/标签固定，无需像素估算、无溢出问题 */
    <>
      <div className="list-sticky">{tagbar}</div>
      {listItems.length === 0 ? (
        !result || (!listReady && !listCacheHit) ? (
          <div className="feed-loading-skeleton" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="feed-skeleton-card">
                <div className="feed-skeleton-block" style={{ width: '30%', height: 14 }} />
                <div className="feed-skeleton-block" style={{ width: '70%', height: 18, marginTop: 8 }} />
                <div className="feed-skeleton-block" style={{ width: '100%', height: 12, marginTop: 8 }} />
                <div className="feed-skeleton-block" style={{ width: '50%', height: 20, marginTop: 12 }} />
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">还没有主题，来发第一个吧！</div>
        )
      ) : (
        <ListView
          items={listItems}
          tags={tags}
          hasMore={listHasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          onOpenTopic={openTopic}
        />
      )}
    </>
  );
}
