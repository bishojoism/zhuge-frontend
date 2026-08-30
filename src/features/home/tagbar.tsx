// ===== 首页标签条：主标签 chips + 排序菜单 + 「＋」开戏按钮 =====
import { useLayoutEffect, useRef } from 'react';
import { Menu } from '@mantine/core';
import type { Tag } from '../../types';

export type SortKey = 'recommend' | 'latest' | 'hot';

// 模块级：tagbar 横向滚动位置跨挂载持久。
// 首页「加载中 → 加载出内容」时 tagbar 会从 fragment 移到 FeedView 的 prop 中，
// React 会卸载重挂载 TagBar，组件内 useRef 会丢失；用模块级变量保住 scrollLeft。
let tagbarScrollLeft = 0;

const SORT_LABEL: Record<SortKey, string> = {
  recommend: '推荐',
  latest: '最新',
  hot: '热门',
};

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recommend', label: '✨ 推荐' },
  { key: 'latest', label: '🕐 最新' },
  { key: 'hot', label: '🔥 热门' },
];

interface TagBarProps {
  tags: Tag[];
  activeTag: number | null;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  onTagChange: (id: number | null) => void;
  onOpenComposer: () => void;
  onOpenTagPicker: () => void;
}

export default function TagBar({
  tags,
  activeTag,
  sort,
  onSortChange,
  onTagChange,
  onOpenComposer,
  onOpenTagPicker,
}: TagBarProps) {
  // 主标签：position 排序、过滤隐藏
  const primaryTags = tags
    .filter((t) => t.position != null && !t.is_hidden)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  // 当前选中的是次标签 → 标签条里动态插入一个高亮 chip（与旧版一致）
  const selectedSecondary = activeTag != null
    ? tags.find((t) => t.id === activeTag && t.position == null && !t.is_hidden)
    : undefined;

  // 切标签时保留 .tagbar-scroll 的 scrollLeft（实时保存到模块级，跨挂载恢复）
  const scrollRef = useRef<HTMLDivElement>(null);

  const saveScroll = () => {
    tagbarScrollLeft = scrollRef.current?.scrollLeft ?? 0;
  };

  const handleChip = (id: number | null) => {
    saveScroll();
    onTagChange(id);
  };

  // 挂载时恢复（模块级持久化，覆盖「加载中 → 内容」切换导致的重挂载）
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = tagbarScrollLeft;
  }, []);

  return (
    <div className="tagbar">
      <div className="tagbar-scroll" ref={scrollRef} onScroll={saveScroll}>
        <button
          type="button"
          className={`tagchip${activeTag === null ? ' active' : ''}`}
          onClick={() => handleChip(null)}
        >
          全部
        </button>
        {primaryTags.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`tagchip${activeTag === t.id ? ' active' : ''}`}
            onClick={() => handleChip(t.id)}
          >
            {t.name}
          </button>
        ))}
        {selectedSecondary ? (
          <span className="tagchip active" key={`secondary-${selectedSecondary.id}`}>
            {selectedSecondary.name}
          </span>
        ) : null}
        <button type="button" className="tagchip" onClick={onOpenTagPicker}>
          更多标签…
        </button>
      </div>
      <div className="tagbar-actions">
        <div className="sort-menu-wrap">
          <Menu
            position="bottom-end"
            width={140}
            withinPortal
            closeOnClickOutside
            closeOnItemClick
            closeOnEscape
          >
            <Menu.Target>
              <button
                type="button"
                className="btn sort-btn"
                title={`排序：${SORT_LABEL[sort]}`}
                aria-label="排序"
              >
                <span className="sort-icon">⇅</span>
              </button>
            </Menu.Target>
            <Menu.Dropdown className="sort-menu">
              {SORT_OPTIONS.map((o) => (
                <Menu.Item
                  key={o.key}
                  className={sort === o.key ? 'active' : undefined}
                  onClick={() => onSortChange(o.key)}
                >
                  {o.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </div>
        <button
          type="button"
          className="btn btn-accent"
          style={{ padding: '6px 10px', fontSize: 14 }}
          title="开戏"
          onClick={onOpenComposer}
        >
          ＋
        </button>
      </div>
    </div>
  );
}
