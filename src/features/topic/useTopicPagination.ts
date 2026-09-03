// ===== 主题回复分页 hook：多页缓存合并 + 预加载 + 目标帖定位 =====
// 背景：主题详情后端按页返回（每页 PAGE_SIZE 楼），前端维护"已加载页"合并出完整楼层列表，
// 滚动到底自动加载下一页并预取下两页（SWR 缓存命中零等待）。
// 同时负责"目标帖定位"：auto-reply/focusPost/跳楼目标不在已加载楼层时，
// 请求其所在页（around 参数，后端算页码）并入，到位后滚动高亮。
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { mutate as globalMutate } from 'swr';
import { notifications } from '@mantine/notifications';
import { api, readInitData } from '../../api/client';
import { useTopic } from '../../api/hooks';
import { docYBelowNav } from '../../lib/navOffset';
import type { DiscussionDetail, InitData } from '../../types';
import { PAGE_SIZE, type PendingTarget, type TopicPost } from './topicTypes';

export function useTopicPagination(id: string | undefined) {
  // 排序与页码：'new'=从新到旧（desc 分页）/ 'old'=从旧到新（asc 分页）
  const [postOrder, setPostOrder] = useState<'new' | 'old'>('new');
  const [page, setPage] = useState(1); // 当前已加载到的页码（含预取缓存）
  const { data, error, isLoading, mutate } = useTopic(id, page, postOrder);
  // 首帖页：'new'（从新到旧）时最新一页不含首帖（1楼），恒拉 asc 第 1 页补首帖；
  // 'old' 模式与主 hook 的 page=1 同 key，SWR dedupe 不重复请求
  const { data: headData, mutate: mutateHead } = useTopic(id, 1, 'old');

  // 校正窗口（目标锁）实时读取当前 data/headData 用：interval 回调闭包内判断
  // "真实数据是否已替换乐观帖"（data/headData 无负 id），决定能否解锁结束校正。
  const dataRef = useRef(data);
  dataRef.current = data;
  const headDataRef = useRef(headData);
  headDataRef.current = headData;

  // 乐观种子强制重验：从列表点进主题时（seedTopicCacheFromList / seedTopicCache）会往 SWR
  // 缓存写入"只有 1 条首帖（id 为负值）"的乐观数据，而全局 revalidateIfStale:false 会抑制
  // 挂载后的自动重新验证 → 详情永远停留在乐观数据，回复列表为空。
  // 检测到乐观帖（id < 0）时主动强制重验 data 与 headData 两个 key，拉真实数据替换。
  // （SSR 直接访问/已有真实缓存时 id > 0，不触发，保持"首帧零 API"优化）
  useEffect(() => {
    if (!id) return;
    const hasOptimistic = (d: DiscussionDetail | undefined) =>
      !!d && (d.posts || []).some((p) => p.id < 0);
    if (hasOptimistic(data) || hasOptimistic(headData)) {
      void mutate();
      void mutateHead();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, data, headData]);

  // loadedPages：已加载的各页数据（key=页码）。当前页（data）与首帖页（headData）变化时自动并入，
  // loadedPages：已加载的各页数据。key 用 'head'（首帖页/order=old page1）与 String(page)（当前 order 的当前页）
  // 分开——不能都用 page 作 key：order=new 的 page1 和 order=old 的 page1 会互相覆盖，
  // 从通知点入时两者并发拉取，headData（旧→最旧楼）常覆盖 data（新→最新页），导致最新回复丢失。
  // SSR 内联的定位目标页（topicAround，系统通知 ?replyNumber=/?focusPost= 点入时）并入初始
  // loadedPages：首帧即有目标楼，useLayoutEffect 直接定位，不走"进入→拉页→跳转"兜底。
  const [loadedPages, setLoadedPages] = useState<Record<string, DiscussionDetail>>(() => {
    const init = readInitData<InitData>();
    const around = init?.topicAround ?? null;
    if (!around) return {};
    const pages: Record<string, DiscussionDetail> = {};
    pages.around = around;
    return pages;
  });
  useEffect(() => {
    if (data) setLoadedPages((prev) => ({ ...prev, [String(page)]: data }));
  }, [data, page]);
  useEffect(() => {
    if (headData) setLoadedPages((prev) => ({ ...prev, head: headData }));
  }, [headData]);

  // 独立乐观帖：回复后注入（负 id 标记），不塞进任何一页的 posts——
  // 否则 revalidate 当前页会把乐观帖覆盖掉（新回复在 order=new 第 1 页，当前页可能没有它，
  // 导致"乐观帧后消失一阵，加载到第 1 页才回来"）。独立注入后 revalidate 不会覆盖它，
  // 真实帖（同 number）到达时按楼层合并自动替换。
  const [optimisticPosts, setOptimisticPosts] = useState<TopicPost[]>([]);
  const injectOptimistic = useCallback((post: TopicPost) => {
    setOptimisticPosts((prev) => [...prev, post]);
  }, []);
  const removeOptimistic = useCallback((postId: number) => {
    setOptimisticPosts((prev) => prev.filter((p) => p.id !== postId));
  }, []);

  // id 变化（/d/196 → /d/<滴滴私密主题> 等路由切换，同一组件实例复用）：
  // 必须重置本主题专属状态——否则旧主题的 loadedPages/乐观帖残留在合并池，
  // 新主题页会把上一个主题的楼层一起渲染出来（滴滴私密主题夹带原主题帖子的 bug）。
  // 用 render-phase setState（React 官方派生态模式）：id 一变，下次渲染即清空，
  // 不会先闪一帧旧内容。
  const [prevTopicId, setPrevTopicId] = useState(id);
  if (prevTopicId !== id) {
    setPrevTopicId(id);
    setPage(1);
    setLoadedPages({});
    setOptimisticPosts([]);
  }

  const changeOrder = (v: 'new' | 'old') => {
    setPostOrder(v);
    setPage(1);
    // 清空已加载页但保留首帖页（headData 引用不变，并入 effect 不会重跑）
    setLoadedPages(headData ? { head: headData } : {});
  };

  const mergedPosts = useMemo(() => {
    const real = new Map<number, TopicPost>();
    // 乐观帖也按楼层去重：列表点入时同一份乐观种子（负 id 首帖占位）被同时写入
    // order=new 与 order=old 两个 key，data（new page1）与 headData（old page1）都会并入
    // loadedPages → 同一个乐观 1 楼会被合并两次 → 顶部主题卡之外再渲染一个 1 楼。
    // 按 number 去重后只剩一个；真实数据（正 id）到达后同楼覆盖，行为不变。
    const optimistic = new Map<number, TopicPost>();
    // 直接并入当前页 data 与首帖页 headData，再并已加载的其它页（loadedPages）：
    // loadedPages 的并入是 effect（挂载后首次渲染才跑），SSR fallback 首帧 data 已有 20 条
    // 但 loadedPages 还是空 → 若只依赖 loadedPages，首帧 mergedPosts 为空 → 闪"暂无内容"再恢复。
    for (const d of [data, headData, ...Object.values(loadedPages)]) {
      if (!d) continue;
      for (const p of (d.posts || []) as TopicPost[]) {
        if (p.id > 0) real.set(p.number, p);
        else if (!optimistic.has(p.number)) optimistic.set(p.number, p);
      }
    }
    // 独立注入的乐观帖：同楼已有真实帖则被覆盖，否则保留显示
    for (const p of optimisticPosts) {
      if (p.id < 0 && !real.has(p.number) && !optimistic.has(p.number)) optimistic.set(p.number, p);
    }
    const out = [...real.values()];
    for (const p of optimistic.values()) if (!real.has(p.number)) out.push(p);
    return out.sort((a, b) => a.number - b.number);
  }, [data, headData, loadedPages, optimisticPosts]);

  const totalPosts = data?.totalPosts ?? headData?.totalPosts ?? mergedPosts.length;
  const hasMore = page * PAGE_SIZE < totalPosts;

  // 稳定数据源：主 data（当前 page 的 key）在翻页/换序的瞬间会短暂 undefined（新 key 无缓存），
  // 若直接暴露给页面，TopicPage 会闪骨架屏/误报"主题不存在"。只要任何一页已加载，
  // 就用已加载页顶替（同一主题的 discussion/tags 各页相同），等主 data 到达自然替换。
  const stableData = useMemo(() => {
    if (data) return data;
    for (const d of Object.values(loadedPages)) if (d) return d;
    return headData || undefined;
  }, [data, loadedPages, headData]);

  // 预加载：当前页到位后预取下一页、下下页（填充 SWR 缓存，滚到底零等待）
  useEffect(() => {
    if (!id || !hasMore) return;
    const prefetch = (p: number) => {
      const key = `/discussions/${id}?page=${p}&order=${postOrder}`;
      void globalMutate<DiscussionDetail>(
        key,
        async () => {
          const r = await api<{ data: DiscussionDetail }>(key);
          return r.data;
        },
        { revalidate: false }
      ).catch(() => {});
    };
    const t1 = window.setTimeout(() => prefetch(page + 1), 600);
    const t2 = window.setTimeout(() => prefetch(page + 2), 1400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [id, page, postOrder, hasMore]);

  // 滚动到底部哨兵 → 加载下一页
  // 注意：乐观首帧（含 id<0 乐观帖）时不自动翻页——乐观数据只有 1 条（首帖占位），
  // 页面内容不足一屏会让底部哨兵立即触发翻页，把当前页推到 page=2、绕开 page=1 的乐观缓存
  // （通知点入时种子只种了 page=1）→ 骨架屏。等真实数据（强制重验）替换乐观帖后再翻。
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    if (!hasMore) return;
    if (data && (data.posts || []).some((p) => p.id < 0)) return; // 乐观首帧不翻页
    setLoadingMore(true);
    const el = loadMoreRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setPage((p) => p + 1);
      },
      { rootMargin: '300px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, page, postOrder, id, data]);

  // 目标帖定位：目标不在已加载楼层时，请求其所在页（around）并入，到位后滚动高亮。
  // id 目标用 aroundPostId，楼层目标用 aroundNumber（后端算页码）。
  // 用 useLayoutEffect：乐观帧已含目标楼（含其前后楼层），DOM 在 paint 前就绪时同步滚动，
  // 第一帧绘制出来就是目标楼位置，不会先闪"页面顶部主题数据"再跳。
  const [pendingTarget, setPendingTarget] = useState<PendingTarget | null>(null);
  const targetFetchingRef = useRef(false);
  // 定位后的"校正窗口"（目标锁）：乐观帖(负 id)随后被真实帖(正 id)替换（React key=id → DOM 重建），
  // 且目标楼上方的楼层陆续插入 → 目标楼位置会漂移。mergedPosts 变化会重跑本 effect，
  // found 仍命中 → 重新滚动到目标楼校正。解锁条件见 effect 内注释：
  // 真实数据到位 + 目标楼位置连续稳定 2s（10 × 200ms）→ 清空定位结束校正；
  // 绝对上限 8s 兜底。**窗口必须覆盖 iOS 的晚到扰动**（replaceState 滚动恢复归零、
  // 慢网真实数据替换、图片懒加载布局偏移都可能发生在跳转后 1.5~4s）——
  // 原 1.5s 窗口在这些扰动之后早已关闭，表现正是"乐观帧正确、随后停在错误位置"。
  const jumpSettleTimerRef = useRef<number | null>(null);
  // 目标锁轮询（校正窗口内常驻）：每 200ms 校验目标楼位置，检测到滚动突变（相邻 tick
  // 位移 > 一屏 = 浏览器重置/布局漂移，非正常浏览滚动）或布局偏移（目标楼在文档中
  // 绝对位置突变而滚动位置没动 = 图片加载/真实数据替换撑高页面）立即重新定位。
  const jumpWatchRef = useRef<number | null>(null);
  // 用户滚动意图：touchmove / wheel / 滚动键（空格、PageUp/Down、方向键、Home/End）触发。
  // 校正只在用户"没在滚动"时进行——用户一旦开始手动滚动（阅读），立即把手柄交还给用户：
  // 目标锁停止抢滚动并结束校正，effect 重跑也不再 tryScroll 抢回。否则会出现
  // "用户在乐观帧手动滚了一点，数据到达时看门狗又把它滚回目标楼"的抢滚动问题。
  // 用 touchmove/wheel 而非 scroll 事件：程序化 window.scrollTo 也会触发 scroll，
  // 无法区分"用户滚动"与"浏览器重置/校正滚动"；touchmove/wheel 只来自用户手势。
  const lastUserScrollRef = useRef(0);
  useEffect(() => {
    const mark = () => {
      lastUserScrollRef.current = Date.now();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if ([' ', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) mark();
    };
    window.addEventListener('touchmove', mark, { passive: true });
    window.addEventListener('wheel', mark, { passive: true });
    window.addEventListener('keydown', onKeyDown, { passive: true });
    return () => {
      window.removeEventListener('touchmove', mark);
      window.removeEventListener('wheel', mark);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
  // 用户最近 ~1.5s 内是否在滚动（滚动意图窗口：覆盖一次拖拽/惯性滚动的持续时间）
  const userIsScrolling = () => Date.now() - lastUserScrollRef.current < 1500;
  // 本次定位的"首次滚动"是否已执行：首次滚动（跳转本身）不受用户滚动守卫约束，
  // 之后的校正（数据变化重跑 effect）才尊重用户滚动，避免"刚跳完又被抢"。
  const initialJumpScrollRef = useRef(false);
  useEffect(() => {
    if (!pendingTarget) initialJumpScrollRef.current = false;
  }, [pendingTarget]);
  // 主动取消定位校正（解锁）：停看门狗轮询与绝对上限 timer，清空 pendingTarget。
  // 暴露给页面层：用户显式发起新的跳转（回到上次位置/引用跳楼）时先取消在跑的旧锁——
  // 否则通知跳转留下的看门狗（最长 8s）会继续把滚动拽回旧目标，跟新跳转打架
  // （表现：点了"回到上次位置"又被拽回去，像锁没解开）。
  const cancelTargetLock = useCallback(() => {
    if (jumpWatchRef.current) window.clearInterval(jumpWatchRef.current);
    jumpWatchRef.current = null;
    if (jumpSettleTimerRef.current) window.clearTimeout(jumpSettleTimerRef.current);
    jumpSettleTimerRef.current = null;
    setPendingTarget(null);
  }, []);
  useLayoutEffect(() => {
    if (!pendingTarget || !id) return;
    // 清掉旧的校正窗口：pendingTarget 变更（新跳转替换旧目标）或数据变化重跑本 effect 时，
    // 旧看门狗必须立即停——即使新目标尚未找到（fetch 中），也不能让旧锁继续拽滚动
    if (jumpSettleTimerRef.current) window.clearTimeout(jumpSettleTimerRef.current);
    if (jumpWatchRef.current) window.clearInterval(jumpWatchRef.current);
    const found = 'id' in pendingTarget
      ? mergedPosts.find((p) => p.id === pendingTarget.id)
      : mergedPosts.find((p) => p.number === pendingTarget.number);
    if (found) {
      const num = found.number;
      // 目标楼能否滚到视口顶部：乐观帧只含少量楼层（缺目标楼之前的楼层），页面高度不足，
      // 此时定位滚不到顶（视口顶部是主题数据），滚了也是白滚，等真实楼层到达页面变高后再定位。
      // 用「目标楼到文档底部的高度 ≥ 视口高度」判断下方是否有足够内容把它顶到视口顶部。
      const canPinToTop = (() => {
        const el0 = document.querySelector(`[data-num="${num}"]`);
        if (!el0) return true; // DOM 未渲染，先按可定位处理（轮询会重查）
        const rect = el0.getBoundingClientRect();
        const docEl = document.documentElement;
        const heightBelow = docEl.scrollHeight - (rect.top + window.scrollY);
        return heightBelow >= window.innerHeight;
      })();
      // 确定性滚动：不用 scrollIntoView——iOS Safari 对刚更新的 DOM 调用 scrollIntoView
      // 是异步的，可能被延迟/取消/与浏览器滚动恢复冲突（表现为"先闪顶部再跳"）。
      // 用 getBoundingClientRect 计算目标楼相对文档的绝对 y，window.scrollTo 同步设置
      // （语义同 scrollIntoView block:'start'：目标楼顶部对齐视口顶部，扣除 sticky 导航栏高度）。
      const doScroll = (el: HTMLElement) => {
        const absY = docYBelowNav(el);
        window.scrollTo(0, absY);
        // 下一帧验证：滚动若被浏览器异步化/取消，实测位置与目标偏差 → 补滚一次
        requestAnimationFrame(() => {
          const want = docYBelowNav(el);
          if (Math.abs(window.scrollY - want) > 4) {
            window.scrollTo(0, want);
          }
        });
      };
      // 目标卡片闪亮提示（post-flash CSS 动画）：三条定位路径共用，保证特效一致
      // （钉顶路径 tryScroll / 短主题滚 maxScroll / 目标锁重定位都触发——
      // 否则短主题通知跳转（canPinToTop false）会没有闪亮，与钉顶跳转观感不一致）
      const flashPost = (node: HTMLElement) => {
        node.classList.add('post-flash');
        window.setTimeout(() => node.classList.remove('post-flash'), 1600);
      };
      // 结束校正（解锁）：清掉目标锁轮询与绝对上限 timer，清空 pendingTarget。
      // 三种触发：位置稳定 2s + 真实数据到位；8s 绝对上限；用户开始手动滚动（把手柄交还）。
      // 解锁 = 复用组件级 cancelTargetLock（同一份清理逻辑）
      const unlockTargetLock = cancelTargetLock;
      // 校正窗口（目标锁）：定位完成后持续校验目标楼位置，直到"真实数据到位 + 位置稳定"。
      // 为什么窗口必须比原来的 1.5s 长：iOS Safari 的扰动会晚到——
      //  1) 主题页 auto-reply effect 里 navigate(replace) 清 ?reply= query，iOS Safari 对该
      //     replaceState 的滚动恢复/归零可能延迟 1~3s 才发生（代码历史注释已记录"归零"现象）；
      //  2) 慢网下真实数据（page1 revalidate）晚于乐观帧 2~3s 到达，替换后布局可能偏移；
      //  3) 帖子配图等懒加载在跳转后数秒才完成，改变目标楼上方的布局高度。
      // 原 1.5s 窗口在这些扰动之后早已关闭 → pendingTarget 被清空 → 无人再校正，
      // 表现正是"乐观帧正确，下一帧真实数据到达后停在错误位置"。
      // 新窗口：每 200ms 校验一次，检测到滚动突变（相邻 tick 位移 > 一屏 = 浏览器重置/
      // 布局漂移，非正常浏览滚动）立即重新定位；位置连续稳定 2s 且真实数据已替换乐观帖
      // → 解锁清 pendingTarget；绝对上限 8s 兜底（异常情况防永久锁定）。
      let stableTicks = 0;
      // 锁定起点：SSR 路线首帧即真实数据（无乐观帧阶段），稳定解锁若只看"2s 稳定"会在
      // 跳转后 ~2s 就解锁——而 iOS replaceState（清 ?reply= query）的滚动恢复/归零可能
      // 延迟 1~3s 才发生，正好落在解锁之后 → 又出现"先正确、随后停在错误位置"。
      // 因此稳定解锁额外要求锁定时长 ≥ 4s（覆盖晚到扰动窗口；锁本身是被动的，
      // 只在目标离开预期位置时重定位，不干扰正常阅读；8s 绝对上限兜底）。
      const lockStartedAt = Date.now();
      const targetLockInterval = window.setInterval(() => {
        const el = document.querySelector(`[data-num="${num}"]`);
        if (!el) return; // DOM 未就绪：tryScroll 轮询负责
        const node = el as HTMLElement;
        const sy = window.scrollY;
        const rect = node.getBoundingClientRect();
        const wantY = docYBelowNav(node);
        // 用户正在手动滚动（阅读）：不抢滚动。目标离开预期位置 → 立即结束校正，
        // 把手柄交还给用户（跳转的目的已达成，后续交给用户自由浏览）。
        // 这防止"用户在乐观帧手动滚了一点，看门狗又把它滚回目标楼"。
        if (userIsScrolling()) {
          if (Math.abs(sy - wantY) > 40) {
            unlockTargetLock();
          }
          return;
        }
        // 页面本身无法滚动（内容不足一屏）→ 无事可做，等页面长高后 effect 重跑
        const docEl = document.documentElement;
        const maxScroll = docEl.scrollHeight - window.innerHeight;
        if (maxScroll <= 0) {
          stableTicks = 0;
          return;
        }
        // 位置校验：目标楼必须停在"导航栏下缘"（容差 40px）。不在 → 重新定位。
        // 这覆盖所有错位来源，包括原"相邻 tick 位移 > 一屏"突变检测会漏掉的情况：
        // 小主题/末楼的目标楼离顶不远（如胖胖胖最新通知：4 楼主题目标楼仅 sy=693），
        // iOS replaceState 滚动恢复把 scrollY 归零后位移 < 一屏 → 原阈值不触发，
        // 页面卡在顶部（实测复现：归零后 5.8s 不恢复）。位置校验不看位移大小，
        // 只看"目标楼是否在预期位置"，任何来源的错位都会被纠正；
        // 用户滚动时不触发（上面 user-scroll 分支已交还手柄）。
        // 目标楼无法钉到视口顶部时（末楼/短主题，wantY > maxScroll）：滚到 maxScroll
        // 把它尽量带入视口——不能"跳过"，否则短主题目标楼在视口外（实测：胖胖胖第二条
        // 通知目标 2 楼在 absTop=1333，页面停在顶部完全不可见）。
        const targetY = Math.min(wantY, maxScroll);
        if (Math.abs(sy - targetY) > 40) {
          window.scrollTo(0, targetY);
          flashPost(node); // 重定位同样闪亮提示（首帧定位未走 tryScroll 的路径在这里补上）
          stableTicks = 0;
          return;
        }
        // 位置正确（目标可钉顶时=导航栏下缘；不可钉顶时=maxScroll 已把目标带入视口）：
        // 真实数据已替换乐观帖（data/headData 无负 id）才累计稳定；乐观帧期间不累计，
        // 等 revalidate 完成后重新累计 → 慢网下真实数据晚到也不会提前解锁。
        const dataReal = !dataRef.current || !(dataRef.current.posts || []).some((p) => p.id < 0);
        const headReal = !headDataRef.current || !(headDataRef.current.posts || []).some((p) => p.id < 0);
        if (dataReal && headReal) {
          stableTicks += 1;
          if (stableTicks >= 10 && Date.now() - lockStartedAt >= 4000) {
            // 10 × 200ms = 2s 位置稳定 + 真实数据到位 + 锁定时长 ≥ 4s（覆盖
            // iOS replaceState 晚到滚动恢复窗口）→ 校正结束
            unlockTargetLock();
          }
        } else {
          stableTicks = 0;
        }
      }, 200);
      jumpWatchRef.current = targetLockInterval;
      // 绝对上限：8s 后无论数据是否稳定都解锁（防异常永久锁定；正常路径 2~4s 内已解锁）
      jumpSettleTimerRef.current = window.setTimeout(() => {
        jumpSettleTimerRef.current = null;
        unlockTargetLock();
      }, 8000);
      if (!canPinToTop) {
        // 页面太矮，目标楼无法钉到视口顶部：滚到 targetY = min(目标位置, maxScroll) 把它
        // 尽量带入视口。**判断必须与目标锁一致（|scrollY - targetY| > 40 才滚）**——
        // 用"目标是否在视口内"（rect.top > innerHeight）判断会漏掉"目标部分可见但不在
        // 目标位置"的情况（如先跳 4 楼到 sy=693 后再点 2 楼通知：2 楼 rect.top=607 < 844，
        // 初始滚动被跳过，200ms 后目标锁才补滚 → 观感"卡一下再跳转"，实测 +215ms）。
        // 乐观帧阶段页面会长高，mergedPosts 变化会重跑本 effect 再校正。
        const el0 = document.querySelector(`[data-num="${num}"]`);
        if (el0) {
          const node0 = el0 as HTMLElement;
          const m = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
          const targetY = Math.min(docYBelowNav(node0), m);
          if (Math.abs(window.scrollY - targetY) > 40) {
            window.scrollTo(0, targetY);
          }
          flashPost(node0); // 目标已带入视口（或本就可见）：同样闪亮提示
        }
        return;
      }
      // 初始定位：数据已到位但 DOM 可能还没渲染（通知点入时 page1 缓存被乐观种子短暂覆盖
      // 又强制重验，真实楼层可能延后出现）：轮询等目标楼 DOM 出现再滚动，最多 ~1s。
      // 用户滚动守卫：首次滚动（跳转本身）不受约束；后续因数据变化（乐观→真实替换）重跑
      // 本 effect 时，若用户已开始手动滚动则不抢回（目标锁会在用户滚动时把手柄交还，
      // 见 interval 内 user-scroll 分支）——否则"乐观帧滚了一点就被抢回"。
      if (initialJumpScrollRef.current && userIsScrolling()) {
        return;
      }
      let tries = 0;
      const tryScroll = () => {
        const el = document.querySelector(`[data-num="${num}"]`);
        if (el) {
          // 非首次滚动（initialJumpScrollRef=true）且用户正在滚动 → 不抢（覆盖上次 run
          // 遗留的轮询链：数据变化重跑 effect 后旧 tryScroll 的 setTimeout 仍可能触发）
          if (initialJumpScrollRef.current && userIsScrolling()) {
            return;
          }
          const node = el as HTMLElement;
          doScroll(node);
          flashPost(node);
          return;
        }
        tries += 1;
        if (tries < 10) window.setTimeout(tryScroll, 100);
      };
      tryScroll();
      initialJumpScrollRef.current = true;
      return;
    }
    if (targetFetchingRef.current) return; // 定位请求进行中，等结果
    targetFetchingRef.current = true;
    const qs = 'id' in pendingTarget
      ? `aroundPostId=${pendingTarget.id}`
      : `aroundNumber=${pendingTarget.number}`;
    api<{ data: DiscussionDetail }>(`/discussions/${id}?page=1&order=old&${qs}`)
      .then((r) => {
        // key 用 'old:' 前缀：定位请求是 order=old 的页，不能占用当前 order 的 page key（否则覆盖最新页）
        setLoadedPages((prev) => ({ ...prev, [`old:${r.data.page ?? 99}`]: r.data }));
      })
      .catch(() => {
        setPendingTarget(null);
        notifications.show({ message: '目标楼层不存在或已删除', color: 'red' });
      })
      .finally(() => {
        targetFetchingRef.current = false;
      });
  }, [pendingTarget, id, mergedPosts]);

  // 卸载时清掉定位校正 timer/看门狗（避免组件卸载后 setState 警告）
  useEffect(
    () => () => {
      if (jumpSettleTimerRef.current) window.clearTimeout(jumpSettleTimerRef.current);
      if (jumpWatchRef.current) window.clearInterval(jumpWatchRef.current);
    },
    []
  );

  return {
    data: stableData,
    error,
    isLoading,
    mutate,
    postOrder,
    changeOrder,
    page,
    mergedPosts,
    totalPosts,
    hasMore,
    loadMoreRef,
    loadingMore,
    setPendingTarget,
    cancelTargetLock,
    injectOptimistic,
    removeOptimistic,
  };
}
