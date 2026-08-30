// ===== 推荐模式：抖音式全屏卡片流（完整移植旧前端 renderFeed/setupFeedScroll） =====
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Discussion, Tag } from '../../types';
import { displayName, tagColorOf, tagTextColorOf, timeAgo } from '../../lib/utils';
import { collapseIosUrlBar, isIosUrlBarCollapsing } from '../../lib/iosUrlBar';
import { parseBBCodeExcerpt } from '../../lib/bbcode';
import Avatar from '../../components/Avatar';
import { openAuthorDidiStats } from '../private/authorDidiStats';

// 锁定页面滚动：只用 overscroll-behavior 防橡皮筋，不设 overflow:hidden。
// 原因：iOS Safari 上 body overflow:hidden 会让 sticky 导航栏失效、且之后
// window.scrollTo(0,0) 归零失效（从主题返回时页面滚下、导航栏被顶出）。
// 实际滚动阻止靠 touchmove/wheel 的 preventDefault（见下方事件处理），
// 页面本身高度被 updateFeedModeHeight 压到正好一屏，无滚动条。
export function lockPageScroll(): void {
  document.body.style.overscrollBehavior = 'none';
  document.documentElement.style.overscrollBehavior = 'none';
  // feed 锁定期间去掉 container 的上下 padding（见 styles.css body.feed-lock），
  // 让 feed 精确填满视口，消除 container padding-bottom 带来的多余滚动空间
  document.body.classList.add('feed-lock');
}
export function unlockPageScroll(): void {
  document.body.style.overscrollBehavior = '';
  document.documentElement.style.overscrollBehavior = '';
  document.body.classList.remove('feed-lock');
}

const ANIM_MS = 360; // 动画锁时长
const TOUCH_THRESHOLD = 50; // 触摸滑动阈值
const WHEEL_THRESHOLD = 60; // 滚轮累积阈值
const PRELOAD_GAP_CARDS = 10; // 还剩 ~10 张时提前加载下一页
const MIN_INNER_SCROLL_H = 320; // 卡内可滚动区域至少这么高才启用"卡内滚动"，矮屏/小卡一律滑动切卡

// feed 卡片位置记忆：从 feed 进主题再返回时恢复之前看的卡片。
// 用 sessionStorage 持久化（模块级变量在返回导航/模块重载时会丢失，导致恢复失效）
const FEED_POS_KEY = 'zhuge-feed-pos';
function readFeedPos(): number {
  try {
    return parseInt(sessionStorage.getItem(FEED_POS_KEY) || '0', 10) || 0;
  } catch {
    return 0;
  }
}
function writeFeedPos(v: number): void {
  try {
    if (v > 0) sessionStorage.setItem(FEED_POS_KEY, String(v));
    else sessionStorage.removeItem(FEED_POS_KEY);
  } catch {
    /* 忽略 */
  }
}
// 标记 FeedView 是否挂载过（模块级，重挂载不清零）：用于区分"首次进入 feed"与"返回导航"
let FEED_MOUNTED = false;

interface FeedViewProps {
  items: Discussion[];
  tags: Tag[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onOpenTopic: (id: number) => void;
  hero: ReactNode;
  tagbar: ReactNode;
  /** 切换标签/排序/seed 时变化，用于把滑动位置重置回第一张 */
  resetKey: string;
}

export default function FeedView({
  items,
  tags,
  hasMore,
  loadingMore,
  onLoadMore,
  onOpenTopic,
  hero,
  tagbar,
  resetKey,
}: FeedViewProps) {
  const modeRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // feedIndex 初始化：若之前进入过 feed 且未切换列表（sessionStorage 记忆有效），恢复位置；
  // 否则从第 1 张开始。用 state 初始值保证任何重挂载（返回导航/门控重挂）都恢复
  const [feedIndex, setFeedIndex] = useState<number>(() => {
    const last = readFeedPos();
    return FEED_MOUNTED && last > 0 ? last : 0;
  });

  // 可变值全部走 ref，保证事件处理器/动画锁读到最新值且监听只挂一次
  const indexRef = useRef(
    FEED_MOUNTED && readFeedPos() > 0 ? readFeedPos() : 0
  );
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const loadMoreRef = useRef(onLoadMore);
  loadMoreRef.current = onLoadMore;
  const animLockRef = useRef(false);
  const wheelAccumRef = useRef(0);
  const touchStartYRef = useRef<number | null>(null);
  const touchScrollInnerRef = useRef(false); // 触摸是否从卡内可滚动内容开始
  const touchInnerRef = useRef<HTMLElement | null>(null); // 手势期间实际跟踪的卡内滚动元素
  const touchInnerTopRef = useRef(0); // 触摸开始时卡内滚动元素的 scrollTop
  const pendingAdvanceRef = useRef(false); // 滑到最后一张且正在加载下一页 → 数据到位后自动前进
  const pendingFromLenRef = useRef(0);
  const resetKeyRef = useRef(resetKey);

  // feed 模式高度：visualViewport 真实可见区贴底，最小 260px；无 visualViewport 用 innerHeight
  const updateFeedModeHeight = useCallback(() => {
    const mode = modeRef.current;
    if (!mode) return;
    let visBottom: number;
    if (window.visualViewport) {
      visBottom = window.visualViewport.offsetTop + window.visualViewport.height;
    } else {
      visBottom = window.innerHeight;
    }
    const top = mode.getBoundingClientRect().top;
    mode.style.height = Math.max(visBottom - top, 160) + 'px';
  }, []);

  // 卡片高度 = viewport 实际高度；translateY 定位当前卡；transition transform .35s ease
  const updateFeedPosition = useCallback((animate: boolean) => {
    const vp = viewportRef.current;
    const track = trackRef.current;
    if (!vp || !track) return;
    const h = vp.clientHeight;
    const cards = track.querySelectorAll<HTMLDivElement>('.feed-card');
    cards.forEach((card) => {
      card.style.height = h + 'px';
    });
    track.style.transition = animate ? 'transform .35s ease' : 'none';
    track.style.transform = `translateY(${-indexRef.current * h}px)`;
    cards.forEach((card, i) => {
      card.classList.toggle('active', i === indexRef.current);
    });
  }, []);

  const goTo = useCallback(
    (next: number, animate: boolean) => {
      const len = itemsRef.current.length;
      if (len === 0) return;
      const clamped = Math.max(0, Math.min(next, len - 1));
      indexRef.current = clamped;
      writeFeedPos(clamped); // 记忆位置：返回 feed 时恢复
      setFeedIndex(clamped);
      updateFeedPosition(animate);
      // 快到底部提前加载下一页（还剩 ~10 张时）
      if (clamped >= len - PRELOAD_GAP_CARDS && hasMoreRef.current) {
        loadMoreRef.current();
      }
    },
    [updateFeedPosition]
  );

  const goNext = useCallback(() => {
    if (animLockRef.current) return;
    animLockRef.current = true;
    window.setTimeout(() => {
      animLockRef.current = false;
    }, ANIM_MS);
    const len = itemsRef.current.length;
    if (indexRef.current < len - 1) {
      goTo(indexRef.current + 1, true);
    } else if (hasMoreRef.current) {
      // 已到最后一张且还有更多：请求下一页，数据到位后自动前进
      pendingAdvanceRef.current = true;
      pendingFromLenRef.current = len;
      loadMoreRef.current();
    }
  }, [goTo]);

  const goPrev = useCallback(() => {
    if (animLockRef.current) return;
    if (indexRef.current <= 0) return;
    animLockRef.current = true;
    window.setTimeout(() => {
      animLockRef.current = false;
    }, ANIM_MS);
    goTo(indexRef.current - 1, true);
  }, [goTo]);

  // 归零页面滚动（多通道）：window.scrollTo + scrollingElement.scrollTop + body.scrollTop。
  // 不再设 overflow:hidden 后，这些归零都能正常生效（iOS 也如此）。
  const forceScrollTop = useCallback(() => {
    try {
      window.scrollTo(0, 0);
    } catch {
      /* 忽略 */
    }
    const se = document.scrollingElement || document.documentElement;
    try {
      se.scrollTop = 0;
    } catch {
      /* 忽略 */
    }
    try {
      document.body.scrollTop = 0;
    } catch {
      /* 忽略 */
    }
  }, []);

  // 推荐模式整体页面不应有滚动：检测到页面滚动位置偏离（进入时残留/返回恢复/iOS 地址栏等）就自动归位，
  // 否则 feed 的测量与卡片定位会错位。
  // 注意：iOS 地址栏收起流程（collapseIosUrlBar 的 1px 触发滚动）期间必须暂停，否则会把触发滚动打回 0，地址栏收不起来
  const recenterPage = useCallback(() => {
    if (isIosUrlBarCollapsing()) return;
    const se = document.scrollingElement || document.documentElement;
    const sy = window.scrollY || se.scrollTop || document.body.scrollTop || 0;
    if (sy !== 0) forceScrollTop();
  }, [forceScrollTop]);

  // 挂载：立即锁定（feed-lock 去 container padding + overscroll-behavior，无 overflow 副作用，
  // 不必延迟；延迟会让首次加载时 padding 未去除、内容先下移再上跳）→ 持续归零若干帧
  // （覆盖 iOS 滚动恢复）→ 地址栏收起后重算。
  useLayoutEffect(() => {
    lockPageScroll();
    forceScrollTop();
    updateFeedModeHeight();
    updateFeedPosition(false);
    let cancelled = false;
    let rafId = 0;
    let frames = 0;
    const step = () => {
      if (cancelled) return;
      forceScrollTop();
      frames++;
      if (frames < 30) {
        // 约 500ms（30 帧）内每帧归零，覆盖 iOS 滚动恢复的任意时机
        rafId = requestAnimationFrame(step);
      } else {
        forceScrollTop();
        recenterPage();
        updateFeedModeHeight();
        updateFeedPosition(false);
        collapseIosUrlBar(() => {
          if (cancelled) return;
          recenterPage();
          updateFeedModeHeight();
          updateFeedPosition(false);
        });
      }
    };
    rafId = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      unlockPageScroll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceScrollTop, recenterPage, updateFeedModeHeight, updateFeedPosition]);

  // 数据变化（追加/切换标签）：重置越界索引、处理"滑到底加载后自动前进"、重新定位
  useLayoutEffect(() => {
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey;
      pendingAdvanceRef.current = false;
      // 换标签/排序/新 seed → 从第 1 张开始
      indexRef.current = 0;
      writeFeedPos(0); // 记忆位置属于旧列表，切换后清空
      setFeedIndex(0);
    } else if (FEED_MOUNTED) {
      // 返回导航（resetKey 不变，FeedView 重新挂载）：恢复记忆的卡片位置
      pendingAdvanceRef.current = false;
      const last = readFeedPos();
      if (last > 0 && last < items.length) {
        indexRef.current = last;
        setFeedIndex(last);
      }
    } else if (pendingAdvanceRef.current && items.length > pendingFromLenRef.current) {
      pendingAdvanceRef.current = false;
      indexRef.current = Math.min(indexRef.current + 1, items.length - 1);
      setFeedIndex(indexRef.current);
    } else if (items.length > 0 && indexRef.current >= items.length) {
      // 越界校正：仅当列表非空时钳制（列表为空/加载中不动 index，避免把恢复的位置打回 0）
      indexRef.current = Math.max(0, items.length - 1);
      setFeedIndex(indexRef.current);
    }
    FEED_MOUNTED = true;
    recenterPage();
    updateFeedModeHeight();
    updateFeedPosition(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, resetKey, recenterPage]);

  // 视口高度变化（窗口 resize / iOS 地址栏显隐）：重算高度并重设卡片位置
  useEffect(() => {
    const onResize = () => {
      recenterPage();
      updateFeedModeHeight();
      updateFeedPosition(false);
    };
    window.addEventListener('resize', onResize);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      vv?.removeEventListener('resize', onResize);
    };
  }, [updateFeedModeHeight, updateFeedPosition, recenterPage]);

  // 滚动位置看门狗：推荐模式下页面整体不应滚动，一旦检测到偏离（外部恢复/异常滚动）立即归位。
  // 双通道：scroll 事件 + 常驻高频轮询（浏览器返回导航的滚动恢复可能不派发 scroll 事件，
  // 且恢复时机不定（可能很晚），常驻 100ms 轮询确保任何时刻偏离都被纠正）
  useEffect(() => {
    const onScroll = () => recenterPage();
    window.addEventListener('scroll', onScroll);
    // 常驻高频轮询：只要 feed 挂载就持续归零页面滚动（feed 模式页面本就不应滚动）
    const iv = window.setInterval(() => {
      const sy = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      if (sy !== 0) recenterPage();
    }, 100);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearInterval(iv);
    };
  }, [recenterPage]);

  // 触摸/滚轮/键盘：监听挂在 feed-viewport 上，卸载时清理
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    // 触摸从"卡内可滚动内容"开始时，本次用于内部滚动（不切卡、不阻止浏览器滚动）；
    // 但卡内可视滚动区太小时（矮屏/小卡，内容根本放不下），滚动区会正好压在触点附近，
    // 若仍按"卡内滚动"处理，滑到下一张后就滑不回去了 → 一律按切卡处理
    const inScrollableInner = (e: TouchEvent): boolean => {
      const t = e.target as HTMLElement | null;
      const inner = t && t.closest ? t.closest('.feed-card-inner') : null;
      if (!inner) return false;
      if (inner.scrollHeight <= inner.clientHeight + 2) return false;
      return inner.clientHeight >= MIN_INNER_SCROLL_H;
    };
    const onTouchStart = (e: TouchEvent) => {
      touchStartYRef.current = e.touches[0].clientY;
      touchScrollInnerRef.current = inScrollableInner(e);
      if (touchScrollInnerRef.current) {
        const t = e.target as HTMLElement;
        touchInnerRef.current = t.closest('.feed-card-inner') as HTMLElement;
        touchInnerTopRef.current = touchInnerRef.current.scrollTop;
      } else {
        touchInnerRef.current = null;
      }
    };
    // 非被动 touchmove：非卡内滚动时 preventDefault，阻止手机滑卡触发页面滚动；
    // 卡内滚动中不 preventDefault，让浏览器原生滚动卡内内容（滚动判定统一在 touchend）
    const onTouchMove = (e: TouchEvent) => {
      if (!touchScrollInnerRef.current) e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => {
      const diff =
        touchStartYRef.current === null ? 0 : touchStartYRef.current - e.changedTouches[0].clientY;
      if (touchScrollInnerRef.current) {
        touchScrollInnerRef.current = false;
        const el = touchInnerRef.current;
        touchInnerRef.current = null;
        if (el) {
          // 只有"沿自然方向且仍在有效滚动范围内"的滚动才算真的在读长文；
          // 滚动边界上的拖动（含 iOS 橡皮筋回弹导致的越界 scrollTop）一律按切卡处理
          const st = el.scrollTop;
          const max = el.scrollHeight - el.clientHeight;
          const delta = st - touchInnerTopRef.current;
          const natural =
            (diff > 0 && delta > 4 && st <= max + 1) || // 上滑：内容向下滚（scrollTop 增大）
            (diff < 0 && delta < -4 && st >= -1); // 下滑：内容向上滚（scrollTop 减小）
          if (natural) {
            // 卡内内容确实滚动了（读长文）：本次手势不切卡
            touchStartYRef.current = null;
            return;
          }
          // 触点虽在可滚动卡内，但手势没有滚动内容（已在滚动边界）：
          // 视作切卡手势继续（解决"滑到下一张就滑不回去"）
        }
      }
      if (touchStartYRef.current === null || animLockRef.current) {
        touchStartYRef.current = null;
        return;
      }
      touchStartYRef.current = null;
      if (Math.abs(diff) > TOUCH_THRESHOLD) {
        if (diff > 0) goNext();
        else goPrev();
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (animLockRef.current) return;
      wheelAccumRef.current += e.deltaY;
      if (wheelAccumRef.current > WHEEL_THRESHOLD) {
        wheelAccumRef.current = 0;
        goNext();
      } else if (wheelAccumRef.current < -WHEEL_THRESHOLD) {
        wheelAccumRef.current = 0;
        goPrev();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        goPrev();
      }
    };
    vp.addEventListener('touchstart', onTouchStart, { passive: true });
    vp.addEventListener('touchmove', onTouchMove, { passive: false });
    vp.addEventListener('touchend', onTouchEnd);
    vp.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('keydown', onKeyDown);
    return () => {
      vp.removeEventListener('touchstart', onTouchStart);
      vp.removeEventListener('touchmove', onTouchMove);
      vp.removeEventListener('touchend', onTouchEnd);
      vp.removeEventListener('wheel', onWheel);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [goNext, goPrev]);

  // 分页哨兵：还剩 ~10 张时提前请求下一页（rootMargin 向下扩 10 个视口高度）
  useEffect(() => {
    const vp = viewportRef.current;
    const sentinel = sentinelRef.current;
    if (!vp || !sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current) {
          loadMoreRef.current();
        }
      },
      { root: vp, rootMargin: `0px 0px ${PRELOAD_GAP_CARDS * vp.clientHeight}px 0px` }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  // iOS 地址栏收起：页面被锁滚动后地址栏无法自动收起会盖住导航，
  // 用通用 collapseIosUrlBar 临时解锁+滚动 1px 触发收起（feed 挂载时调用，见上方 useLayoutEffect）

  return (
    <div className="feed-mode" ref={modeRef}>
      {hero}
      <div className="feed-body">
        <div className="feed-topbar">{tagbar}</div>
        <div className="feed-viewport" id="feed-viewport" ref={viewportRef}>
          <div className="feed-track" id="feed-track" ref={trackRef}>
            {items.map((d, i) => (
              <FeedCard
                key={d.id}
                d={d}
                tags={tags}
                active={i === feedIndex}
                onOpenTopic={onOpenTopic}
              />
            ))}
            <div ref={sentinelRef} className="feed-sentinel" style={{ height: 1 }} />
          </div>
          {/* 上下滑动提示：常驻（viewport 底部绝对定位，不随卡片移动） */}
          <div className="feed-hint">⬆️⬇️ 上下滑动</div>
          {/* 滑到底加载下一页中：底部小加载指示（状态可见性） */}
          {loadingMore && <div className="feed-loading">加载中…</div>}
        </div>
      </div>
    </div>
  );
}

// ===== 单张卡片 =====
function FeedCard({
  d,
  tags,
  active,
  onOpenTopic,
}: {
  d: Discussion;
  tags: Tag[];
  active: boolean;
  onOpenTopic: (id: number) => void;
}) {
  const excerpt = (d.excerpt || '').replace(/\s+/g, ' ').trim();
  const tagNames = (d.tags || '')
    .split(' / ')
    .map((s) => s.trim())
    .filter(Boolean);

  const handleClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('.feed-actions, .feed-tags, button')) return;
    onOpenTopic(d.id);
  };

  return (
    <div className={`feed-card${active ? ' active' : ''}`} onClick={handleClick}>
      <div className="feed-card-inner">
        <div className="feed-card-head">
          <Avatar user={d} showGender />
          <div>
            <div
              className="feed-card-author author-link"
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                openAuthorDidiStats(d.user_id, displayName(d), d.first_character_id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation();
                  openAuthorDidiStats(d.user_id, displayName(d), d.first_character_id);
                }
              }}
            >
              {displayName(d)}
              {/* 作者已获徽章：作者名旁全部展示（进阶徽章 t1 带发光特效） */}
              {d.author_badges
                ? d.author_badges
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
            </div>
            <div className="feed-card-time">{timeAgo(d.last_posted_at || d.created_at)}</div>
          </div>
        </div>
        <div className="feed-card-title">{d.title}</div>
        {excerpt ? (
          <div className="feed-card-excerpt">{parseBBCodeExcerpt(excerpt)}</div>
        ) : null}
        {d.image_url ? (
          <img
            src={d.image_url}
            alt="配图"
            style={{
              maxWidth: '100%',
              maxHeight: '30vh',
              borderRadius: 10,
              margin: '10px 0',
              objectFit: 'cover',
              display: 'block',
            }}
            loading="lazy"
          />
        ) : null}
        {tagNames.length ? (
          <div className="feed-tags">
            {tagNames.map((n) => {
              const bg = tagColorOf(tags, n);
              return (
                <span key={n} className="mini-tag" style={{ background: bg, color: tagTextColorOf(bg) }}>
                  {n}
                </span>
              );
            })}
          </div>
        ) : null}
        <div className="feed-actions">
          <span className="feed-stat">💬 {Math.max(0, (d.comment_count ?? 0) - 1)} 接戏</span>
          {d.didi_count > 0 ? <span className="feed-stat">📨 {d.didi_count} 滴滴</span> : null}
        </div>
      </div>
    </div>
  );
}
