// ===== 主题回复分页 hook：多页缓存合并 + 预加载 + 目标帖定位 =====
// 背景：主题详情后端按页返回（每页 PAGE_SIZE 楼），前端维护"已加载页"合并出完整楼层列表，
// 滚动到底自动加载下一页并预取下两页（SWR 缓存命中零等待）。
// 同时负责"目标帖定位"：auto-reply/focusPost/跳楼目标不在已加载楼层时，
// 请求其所在页（around 参数，后端算页码）并入，到位后滚动高亮。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  // mergedPosts 按楼层合并去重（真实帖覆盖同楼乐观帖）。切换排序时清空重载。
  const [loadedPages, setLoadedPages] = useState<Record<number, DiscussionDetail>>({});
  useEffect(() => {
    if (data) setLoadedPages((prev) => ({ ...prev, [page]: data }));
  }, [data, page]);
  useEffect(() => {
    if (headData) setLoadedPages((prev) => ({ ...prev, [1]: headData }));
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
    setLoadedPages(headData ? { [1]: headData } : {});
  };

  const mergedPosts = useMemo(() => {
    const real = new Map<number, TopicPost>();
    const optimistic: TopicPost[] = [];
    for (const d of Object.values(loadedPages)) {
      for (const p of (d?.posts || []) as TopicPost[]) {
        if (p.id > 0) real.set(p.number, p);
        else optimistic.push(p);
      }
    }
    // 独立注入的乐观帖：同楼已有真实帖则被覆盖，否则保留显示
    for (const p of optimisticPosts) {
      if (p.id < 0 && !real.has(p.number)) optimistic.push(p);
    }
    const out = [...real.values()];
    for (const p of optimistic) if (!real.has(p.number)) out.push(p);
    return out.sort((a, b) => a.number - b.number);
  }, [loadedPages, optimisticPosts]);

  const totalPosts = data?.totalPosts ?? headData?.totalPosts ?? mergedPosts.length;
  const hasMore = page * PAGE_SIZE < totalPosts;

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
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    if (!hasMore) return;
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
  }, [hasMore, page, postOrder, id]);

  // 目标帖定位：目标不在已加载楼层时，请求其所在页（around）并入，到位后滚动高亮。
  // id 目标用 aroundPostId，楼层目标用 aroundNumber（后端算页码）。
  const [pendingTarget, setPendingTarget] = useState<PendingTarget | null>(null);
  const targetFetchingRef = useRef(false);
  useEffect(() => {
    if (!pendingTarget || !id) return;
    const found = 'id' in pendingTarget
      ? mergedPosts.find((p) => p.id === pendingTarget.id)
      : mergedPosts.find((p) => p.number === pendingTarget.number);
    if (found) {
      setPendingTarget(null);
      const num = found.number;
      window.setTimeout(() => {
        const el = document.querySelector(`[data-num="${num}"]`);
        if (el) {
          (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
          const node = el as HTMLElement;
          node.classList.add('post-flash');
          window.setTimeout(() => node.classList.remove('post-flash'), 1600);
        }
      }, 250); // 等该楼 DOM 渲染完成
      return;
    }
    if (targetFetchingRef.current) return; // 定位请求进行中，等结果
    targetFetchingRef.current = true;
    const qs = 'id' in pendingTarget
      ? `aroundPostId=${pendingTarget.id}`
      : `aroundNumber=${pendingTarget.number}`;
    api<{ data: DiscussionDetail }>(`/discussions/${id}?page=1&order=old&${qs}`)
      .then((r) => {
        setLoadedPages((prev) => ({ ...prev, [r.data.page ?? 99]: r.data }));
      })
      .catch(() => {
        setPendingTarget(null);
        notifications.show({ message: '目标楼层不存在或已删除', color: 'red' });
      })
      .finally(() => {
        targetFetchingRef.current = false;
      });
  }, [pendingTarget, id, mergedPosts]);

  return {
    data,
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
