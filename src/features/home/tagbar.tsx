// ===== 首页顶栏：分类（标签选择 + 排序折叠为一个入口）+ 「开戏」按钮 =====
// 原"标签 chips 横滚条 + 独立排序按钮"整行折叠为左侧一个「分类」菜单：
// 点开 = 标签组（全部/主标签/更多标签…）+ 排序组（推荐/最新/热门）；
// 「开戏」按钮独占右侧。当前筛选摘要显示在分类按钮上（标签名 · 排序名）。
import { Menu } from '@mantine/core';
import type { Tag } from '../../types';

export type SortKey = 'recommend' | 'latest' | 'hot';

const SORT_LABEL: Record<SortKey, string> = {
  recommend: '推荐',
  latest: '最新',
  hot: '热门',
};

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recommend', label: '✨ 推荐（滑卡）' },
  { key: 'latest', label: '🕐 最新（列表）' },
  { key: 'hot', label: '🔥 热门（列表）' },
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

  // 当前选中的次标签（"更多标签…"里选的）：菜单里追加一个高亮项 + 按钮摘要显示其名
  const activeTagName = activeTag != null ? tags.find((t) => t.id === activeTag)?.name : null;
  const selectedSecondary =
    activeTag != null && !primaryTags.some((t) => t.id === activeTag)
      ? tags.find((t) => t.id === activeTag)
      : undefined;

  return (
    <div className="tagbar cat-collapsed">
      <Menu position="bottom-start" width={210} withinPortal closeOnItemClick>
        <Menu.Target>
          <button
            type="button"
            className="btn cat-btn"
            title={`分类筛选：${activeTagName || '全部'} · ${SORT_LABEL[sort]}`}
            aria-label="分类筛选"
          >
            <span className="cat-icon">🗂</span>
            <span className="cat-title">{activeTagName || '全部'}</span>
            <span className="cat-sort">· {SORT_LABEL[sort]}</span>
            <span className="cat-caret">▾</span>
          </button>
        </Menu.Target>
        <Menu.Dropdown className="cat-menu">
          <Menu.Label>分类</Menu.Label>
          <Menu.Item className={activeTag === null ? 'active' : undefined} onClick={() => onTagChange(null)}>
            全部
          </Menu.Item>
          {primaryTags.map((t) => (
            <Menu.Item
              key={t.id}
              className={activeTag === t.id ? 'active' : undefined}
              onClick={() => onTagChange(t.id)}
            >
              {t.name}
            </Menu.Item>
          ))}
          {selectedSecondary ? (
            <Menu.Item className="active" onClick={() => onTagChange(selectedSecondary.id)}>
              {selectedSecondary.name}
            </Menu.Item>
          ) : null}
          <Menu.Item onClick={onOpenTagPicker}>更多标签…</Menu.Item>
          <Menu.Divider />
          <Menu.Label>排序</Menu.Label>
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
      <button
        type="button"
        className="btn btn-accent cat-compose"
        title="开戏"
        onClick={onOpenComposer}
      >
        ＋ 开戏
      </button>
    </div>
  );
}
