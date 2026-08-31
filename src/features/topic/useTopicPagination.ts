// ===== 主题回复分页 hook：多页缓存合并 + 预加载 + 目标帖定位 =====
// 背景：主题详情后端按页返回（每页 PAGE_SIZE 楼），前端维护"已加载页"合并出完整楼层列表，
// 滚动到底自动加载下一页并预取下两页（SWR 缓存命中零等待）。
// 同时负责"目标帖定位"：auto-reply/focusPost/跳楼目标不在已加载楼层时，
// 请求其所在页（around 参数，后端算页码）并入，到位后滚动高亮。
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { mutate as globalMutate } from 'swr';
import { notifications } from '@mantine/notifications';
import { api } from '../../api/client';
import { useTopic } from '../../api/hooks';
import type { DiscussionDetail } from '../../types';
import { PAGE_SIZE, type PendingTarget, type TopicPost } from './topicTypes';

export function useTopicPagination(id: string | undefined) {
  // 排序与页码：'new'=从新到旧（desc 分页）/ 'old'=从旧到新（asc 分页）
  const [postOrder, setPostOrder] = useState<'new' | 'old'>('new');
  const [page, setPage] = useState(1); // 当前已加载到的页码（含预取缓存）
  const { data, error, isLoading, mutate } = useTopic(id, page, postOrder);
  // 首帖页：'new'（从新到旧）时最新一页不含首帖（1楼），恒拉 asc 第 1 页补首帖；
  // 'old' 模式与主 hook 的 page=1 同 key，SWR dedupe 不重复请求
  const { data: headData, mutate: mutateHead } = useTopic(id, 1, 'old');

  // 【诊断】SWR 主数据/页码/加载态变化
  useEffect(() => {
    console.log('[zhuge-ssr] useTopicPagination state', {
      id,
      page,
      postOrder,
      dataPosts: data?.posts?.length ?? 'undefined',
      dataTotal: data?.totalPosts ?? 'undefined',
      isLoading,
      hasError: !!error,
    });
  }, [id, page, postOrder, data, isLoading, error]);

  // 【诊断】headData（首帖页 order=old page1）状态
  useEffect(() => {
    console.log('[zhuge-ssr] headData state', {
      id,
      headPosts: headData?.posts?.length ?? 'undefined',
      headTotal: headData?.totalPosts ?? 'undefined',
    });
  }, [id, headData]);

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
  const [loadedPages, setLoadedPages] = useState<Record<string, DiscussionDetail>>({});
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

  // 【诊断】mergedPosts 与 loadedPages 推导
  useEffect(() => {
    console.log('[zhuge-ssr] merged derived', {
      mergedLen: mergedPosts.length,
      loadedKeys: Object.keys(loadedPages),
      optimisticLen: optimisticPosts.length,
    });
  }, [mergedPosts, loadedPages, optimisticPosts]);

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
  // 定位后的"校正窗口"：乐观帖(负 id)随后被真实帖(正 id)替换（React key=id → DOM 重建），
  // 且目标楼上方的楼层陆续插入 → 目标楼位置会漂移。mergedPosts 变化会重跑本 effect，
  // found 仍命中 → 重新滚动到目标楼校正；3 秒无变化视为数据稳定，清空定位结束校正。
  const jumpSettleTimerRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!pendingTarget || !id) return;
    const found = 'id' in pendingTarget
      ? mergedPosts.find((p) => p.id === pendingTarget.id)
      : mergedPosts.find((p) => p.number === pendingTarget.number);
    console.log('[zhuge-jump] pendingTarget effect', {
      pendingTarget,
      found: found ? { id: found.id, number: found.number } : null,
      mergedLen: mergedPosts.length,
    });
    if (found) {
      // 数据已到位但 DOM 可能还没渲染（通知点入时 page1 缓存被乐观种子短暂覆盖又强制重验，
      // 真实楼层可能延后出现）：轮询等目标楼 DOM 出现再滚动，最多 ~2s，超时才放弃。
      // 不立即清空 pendingTarget：mergedPosts 后续变化（乐观→真实替换/楼层插入）会
      // 重跑本 effect 校正滚动位置；3 秒无变化视为稳定，清空结束校正窗口。
      // timer 在轮询前就设好：即使 2s 内 DOM 一直没出现（轮询耗尽），3s 后也自动清空。
      if (jumpSettleTimerRef.current) window.clearTimeout(jumpSettleTimerRef.current);
      jumpSettleTimerRef.current = window.setTimeout(() => {
        jumpSettleTimerRef.current = null;
        setPendingTarget(null);
      }, 3000);
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
      if (!canPinToTop) {
        // 页面太矮定位不到位：跳过这次滚动，等 mergedPosts 变化（真实楼层插入）重跑本 effect
        // 再瞬时定位（届时下方空间足够，一次到位，不再"先滚不到位再跳"）
        console.log(`[zhuge-jump] skip scroll (page too short) num=${num} mergedLen=${mergedPosts.length}`);
        return;
      }
      let tries = 0;
      const tryScroll = () => {
        const el = document.querySelector(`[data-num="${num}"]`);
        console.log(`[zhuge-jump] tryScroll num=${num} tries=${tries} el=${!!el}`);
        if (el) {
          // 统一瞬时跳转：useLayoutEffect 在浏览器绘制前同步执行，瞬时滚动发生在 paint 前，
          // 第一帧绘制出来就是目标楼位置（不闪"页面顶部主题数据"再跳）；数据到达的校正也瞬时
          (el as HTMLElement).scrollIntoView({ behavior: 'auto', block: 'start' });
          const node = el as HTMLElement;
          node.classList.add('post-flash');
          window.setTimeout(() => node.classList.remove('post-flash'), 1600);
          return;
        }
        tries += 1;
        if (tries < 20) window.setTimeout(tryScroll, 100);
      };
      tryScroll();
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

  // 卸载时清掉定位校正 timer（避免组件卸载后 setState 警告）
  useEffect(
    () => () => {
      if (jumpSettleTimerRef.current) window.clearTimeout(jumpSettleTimerRef.current);
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
    injectOptimistic,
    removeOptimistic,
  };
}
