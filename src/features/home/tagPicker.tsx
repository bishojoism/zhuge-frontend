// ===== 更多标签选择弹窗（浏览全部标签 + 搜索过滤，显示讨论数）+ 申请新标签入口 =====
import { useMemo, useState } from 'react';
import { Button, Text, TextInput } from '@mantine/core';
import { openTagRequestModal } from './tagRequestModal';
import type { Tag } from '../../types';

interface TagPickerContentProps {
  tags: Tag[];
  activeTag: number | null;
  /** 点选即切标签（由调用方关闭弹窗 + 重置推荐 seed 重拉） */
  onPick: (id: number | null) => void;
}

export function TagPickerContent({ tags, activeTag, onPick }: TagPickerContentProps) {
  const [q, setQ] = useState('');

  const primaryTags = useMemo(
    () =>
      tags
        .filter((t) => t.position != null && !t.is_hidden)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [tags]
  );
  const secondaryTags = useMemo(
    () => tags.filter((t) => t.position == null && !t.is_hidden),
    [tags]
  );

  const kw = q.trim().toLowerCase();
  const filteredSecondary = kw ? secondaryTags.filter((t) => t.name.toLowerCase().includes(kw)) : secondaryTags;

  return (
    <>
      <TextInput
        placeholder="搜索标签（IP 名 / 别名）…"
        autoComplete="off"
        autoFocus
        data-autofocus
        value={q}
        onChange={(e) => setQ(e.currentTarget.value)}
        mb="sm"
      />
      <Text size="xs" c="dimmed" mb={6}>
        主标签：
      </Text>
      <div className="tagbar" style={{ marginBottom: 10 }}>
        {primaryTags.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`tagchip${activeTag === t.id ? ' active' : ''}`}
            onClick={() => onPick(t.id)}
          >
            {t.name}
          </button>
        ))}
      </div>
      <Text size="xs" c="dimmed" mb={6}>
        IP 标签（{secondaryTags.length}）：
      </Text>
      <div
        style={{
          // 固定 420px 而非 vh 单位：iOS Safari 键盘弹出时 vh 视口被压缩，
          // 48vh 会随键盘变小导致标签区"变矮"；固定像素不受键盘影响
          maxHeight: 420,
          minHeight: 260,
          overflowY: 'auto',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 10,
          marginBottom: 12,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignContent: 'flex-start',
        }}
      >
        {filteredSecondary.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`tagchip${activeTag === t.id ? ' active' : ''}`}
            onClick={() => onPick(t.id)}
          >
            {t.name}
            {t.discussion_count > 0 ? (
              <span style={{ opacity: 0.6, marginLeft: 4, fontSize: 11 }}>{t.discussion_count}</span>
            ) : null}
          </button>
        ))}
        {filteredSecondary.length === 0 ? (
          <Text size="sm" c="dimmed">
            无匹配标签
          </Text>
        ) : null}
      </div>

      {/* 申请新标签入口（弹窗与发帖弹窗共用同一表单） */}
      <Button size="compact-sm" variant="subtle" fullWidth leftSection={<span>＋</span>} onClick={openTagRequestModal}>
        没有想要的标签？申请新增
      </Button>
    </>
  );
}
