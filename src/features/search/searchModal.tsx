// ===== 全局搜索弹窗：关键词 + 标签过滤（弹窗形式，不做独立路由） =====
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CompositionEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Group, Loader, Stack, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useDiscussions, useTags } from '../../api/hooks';
import { openModalOnce } from '../../lib/modals';
import { focusOnEnter } from '../../lib/modalFocus';
import { TagPickerContent } from '../home/tagPicker';
import { TopicCard } from '../home/list';
import { seedTopicCacheFromList } from '../home/composer';
import type { Discussion } from '../../types';

function SearchModalContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  // iOS：React 挂载时 autoFocus 常在点击手势之外，键盘不弹 → 延时再聚焦一次
  useEffect(() => {
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, []);
  const [input, setInput] = useState(''); // 输入框即时值
  const [q, setQ] = useState(''); // 防抖后的生效关键词
  const [tag, setTag] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Discussion[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const timerRef = useRef<number | null>(null);
  const pushedRef = useRef<string | null>(null); // 最近一次由输入框生效的关键词（防抖竞态保护）
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  hasMoreRef.current = hasMore;
  const pageRef = useRef(1);
  pageRef.current = page;
  const appliedKeyRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { tags } = useTags();
  const activeTag = tags.find((t) => t.id === tag) || null;

  const primaryTags = useMemo(
    () =>
      tags
        .filter((t) => t.position != null && !t.is_hidden)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [tags]
  );

  // 输入防抖 300ms → 生效关键词（IME 组合期间不触发，组合结束再触发）
  const scheduleSearch = (v: string) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      pushedRef.current = v.trim();
      setQ(v.trim());
      setPage(1);
    }, 300);
  };
  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.currentTarget.value;
    setInput(v);
    if ((e.nativeEvent as InputEvent).isComposing) return;
    scheduleSearch(v);
  };
  const onCompositionEnd = (e: CompositionEvent<HTMLInputElement>) => {
    scheduleSearch(e.currentTarget.value);
  };
  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    []
  );

  const { result, isLoading, key } = useDiscussions({
    sort: 'latest',
    page,
    q: q || undefined,
    tag: tag || undefined,
  });

  // 关键词/标签变化 → 重置分页与列表
  useEffect(() => {
    setPage(1);
    setItems([]);
    setHasMore(true);
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [q, tag]);

  useEffect(() => {
    if (!result) return;
    const currentPage = pageRef.current;
    if (currentPage === 1) {
      appliedKeyRef.current = key;
      setItems(result.data);
      setHasMore(result.meta.hasMore);
    } else if (appliedKeyRef.current !== key) {
      appliedKeyRef.current = key;
      setItems((prev) => [...prev, ...result.data]);
      setHasMore(result.meta.hasMore);
    }
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [result, key]);

  const loadMore = () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setPage((p) => p + 1);
  };
  // 结果区滚动到底部附近 → 加载下一页
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) loadMore();
  };

  const openTopic = (id: number) => {
    modals.closeAll();
    // 乐观种入详情缓存（用搜索结果数据预填充，跳转后不闪骨架屏）
    const d = items.find((x) => x.id === id);
    if (d) seedTopicCacheFromList(d);
    // 预加载详情页 chunk
    void import('../topic/TopicPage');
    navigate(`/d/${id}`, { state: { from: location.pathname + location.search } });
  };
  const pickTag = (id: number | null) => {
    setTag(id);
    setPage(1);
  };
  const openTagPicker = () => {
    openModalOnce(
      'search-tag-picker',
      (m) => {
        m.open({
          modalId: 'search-tag-picker',
          title: '选择标签',
          centered: true,
          size: 'md',
          children: (
            <TagPickerContent
              tags={tags}
              activeTag={tag}
              onPick={(id) => {
                modals.closeAll();
                pickTag(id);
              }}
            />
          ),
        });
      },
      true // 手势内同步叫醒键盘（标签搜索输入框）
    );
  };

  const idle = !q.trim() && tag === null;
  const resultHint = q
    ? tag
      ? `在标签「${activeTag?.name || tag}」中搜索「${q}」`
      : `搜索「${q}」`
    : tag
      ? `标签「${activeTag?.name || tag}」的主题`
      : '';

  return (
    <Stack gap="sm" style={{ display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
      <TextInput
        ref={inputRef}
        size="lg"
        placeholder="搜索主题标题 / 内容…"
        autoComplete="off"
        value={input}
        onChange={onInput}
        onCompositionEnd={onCompositionEnd}
        autoFocus
        data-autofocus
        rightSection={isLoading ? <Loader size="xs" /> : null}
        aria-label="搜索"
      />
      {/* 标签过滤：全部 + 主标签 + 更多标签 */}
      <div className="tagbar" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
        <button
          type="button"
          className={'tagchip' + (tag === null ? ' active' : '')}
          onClick={() => pickTag(null)}
        >
          全部
        </button>
        {primaryTags.map((t) => (
          <button
            type="button"
            key={t.id}
            className={'tagchip' + (tag === t.id ? ' active' : '')}
            onClick={() => pickTag(t.id)}
          >
            {t.name}
          </button>
        ))}
        <button type="button" className="tagchip" onClick={openTagPicker}>
          更多标签…
        </button>
      </div>
      {idle ? (
        <Text size="sm" c="dimmed" ta="center" py="xl">
          输入关键词，或选择标签，搜索主题
        </Text>
      ) : (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          style={{ overflowY: 'auto', minHeight: 120, paddingRight: 4 }}
        >
          {isLoading && items.length === 0 ? (
            <Stack align="center" py="xl">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                搜索中…
              </Text>
            </Stack>
          ) : items.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="xl">
              {q && tag
                ? `标签「${activeTag?.name || tag}」中没有与「${q}」相关的主题`
                : `没有找到与「${resultHint}」相关的主题`}
            </Text>
          ) : (
            <>
              <Text size="xs" c="dimmed" mb="sm">
                {resultHint}：{items.length}
                {hasMore ? '+' : ''} 个结果
              </Text>
              {items.map((d) => (
                <TopicCard key={d.id} d={d} tags={tags} onOpenTopic={openTopic} />
              ))}
              <div className="load-more">
                {loadingMore ? '加载中…' : hasMore ? '继续滚动加载更多' : '没有更多了'}
              </div>
            </>
          )}
        </div>
      )}
    </Stack>
  );
}

// 打开全局搜索弹窗（导航栏 🔍 / 头像菜单）
export function openSearchModal(): void {
  openModalOnce(
    'search',
    (m) => {
      m.open({
        title: '搜索',
        size: 520,
        ...focusOnEnter('input[aria-label="搜索"]'),
        children: <SearchModalContent />,
      });
    },
    true // 手势内同步叫醒键盘（iOS）
  );
}
