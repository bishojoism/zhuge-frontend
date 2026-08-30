// ===== BBCode 富文本编辑器：工具栏（加粗/斜体/下划线/删除线/颜色）+ 实时预览 =====
// 与 lib/bbcode.tsx 同一白名单：[b] [i] [u] [s] [color=值]；外链/图片等一律不识别
// 编辑态为纯 textarea（保留原生输入/自动保存/快捷键），预览态用 parseBBCode 安全渲染
import { useMemo, useRef, useState } from 'react';
import { ActionIcon, Group, Text, Textarea, Tooltip } from '@mantine/core';
import { parseBBCode } from '../lib/bbcode';

// 预设色板：与解析白名单一致的常用颜色（点击即插入 [color=值]）
const PALETTE: { name: string; value: string }[] = [
  { name: '红', value: 'red' },
  { name: '橙', value: 'orange' },
  { name: '黄', value: 'gold' },
  { name: '绿', value: 'green' },
  { name: '蓝', value: 'blue' },
  { name: '紫', value: 'purple' },
  { name: '粉', value: 'pink' },
  { name: '灰', value: 'gray' },
  { name: '棕', value: 'brown' },
  { name: '黑', value: 'black' },
  { name: '白', value: 'white' },
  { name: '青', value: 'cyan' },
];

interface BBCodeEditorProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minRows?: number;
  autosize?: boolean;
  /** 编辑态 textarea 的 ref（外部需要聚焦/滚动定位时用） */
  inputRef?: React.MutableRefObject<HTMLTextAreaElement | null>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /** 是否显示「编辑 / 预览」切换（默认 true；false 时只保留工具栏） */
  showPreview?: boolean;
}

/**
 * 在文本的光标处插入 BBCode 包裹（纯函数，便于测试）：
 * - 有选区：prefix + 选区 + suffix，新选区 = 包裹内容
 * - 无选区：prefix + suffix，光标置于中间
 * 返回 { text, start, end }，由调用方 setState + 设置 textarea 选区
 */
export function insertBBCode(
  text: string,
  selStart: number,
  selEnd: number,
  prefix: string,
  suffix: string
): { text: string; start: number; end: number } {
  const a = Math.max(0, Math.min(selStart, selEnd));
  const b = Math.max(0, Math.max(selStart, selEnd));
  const selected = text.slice(a, b);
  const next = text.slice(0, a) + prefix + selected + suffix + text.slice(b);
  if (selected) {
    return { text: next, start: a + prefix.length, end: a + prefix.length + selected.length };
  }
  const cursor = a + prefix.length;
  return { text: next, start: cursor, end: cursor };
}

/** 工具栏小按钮（带 tooltip） */
function TplBtn({
  label,
  tip,
  onClick,
  color,
  style,
}: {
  label: string;
  tip: string;
  onClick: () => void;
  color?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Tooltip label={tip} withArrow withinPortal>
      <ActionIcon variant="subtle" size="sm" onClick={onClick} aria-label={tip} style={style}>
        <span style={{ fontWeight: 700, color: color || 'inherit' }}>{label}</span>
      </ActionIcon>
    </Tooltip>
  );
}

export default function BBCodeEditor({
  value,
  onChange,
  placeholder,
  minRows = 2,
  autosize = true,
  inputRef,
  onKeyDown,
  showPreview = true,
}: BBCodeEditorProps) {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  const wrap = (prefix: string, suffix: string) => {
    const ta = internalRef.current;
    if (!ta) {
      // 无 ref（理论不发生）：直接追加在末尾
      onChange(value + prefix + suffix);
      return;
    }
    const { text, start, end } = insertBBCode(value, ta.selectionStart, ta.selectionEnd, prefix, suffix);
    onChange(text);
    // 重渲染后恢复光标/选区（微任务保证新值已应用）
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start, end);
    });
  };

  const wrapColor = (c: string) => wrap(`[color=${c}]`, '[/color]');

  // 预览态内容：与正式渲染完全一致
  const preview = useMemo(
    () => (value ? parseBBCode(value) : <span style={{ opacity: 0.5 }}>（空）</span>),
    [value]
  );

  return (
    <div>
      {/* 工具栏 */}
      <Group gap={4} mb={4} wrap="wrap" align="center">
        <TplBtn label="B" tip="加粗" onClick={() => wrap('[b]', '[/b]')} />
        <TplBtn label="I" tip="斜体" onClick={() => wrap('[i]', '[/i]')} style={{ fontStyle: 'italic' }} />
        <TplBtn label="U" tip="下划线" onClick={() => wrap('[u]', '[/u]')} style={{ textDecoration: 'underline' }} />
        <TplBtn label="S" tip="删除线" onClick={() => wrap('[s]', '[/s]')} style={{ textDecoration: 'line-through' }} />
        <TplBtn label="A⁺" tip="大字" onClick={() => wrap('[big]', '[/big]')} style={{ fontSize: 15, fontWeight: 700 }} />
        <TplBtn label="a⁻" tip="小字" onClick={() => wrap('[small]', '[/small]')} style={{ fontSize: 11 }} />
        <TplBtn label="⧉" tip="可复制文本块（内容一键复制）" onClick={() => wrap('[copy]', '[/copy]')} style={{ fontSize: 14 }} />
        <TplBtn label="🎲" tip="骰子（如 1d20 / 2d6+1，点击掷出）" onClick={() => wrap('[dice]', '[/dice]')} style={{ fontSize: 13 }} />
        <span style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 6px' }} />
        {PALETTE.map((c) => (
          <TplBtn key={c.value} label={c.name} tip={`颜色：${c.name}`} onClick={() => wrapColor(c.value)} color={c.value === 'white' || c.value === 'gold' ? '#b8860b' : c.value === 'gray' ? '#888' : c.value} />
        ))}
        {showPreview ? (
          <>
            <span style={{ flex: 1 }} />
            <Group gap={2} wrap="nowrap">
              <button
                type="button"
                onClick={() => setMode('edit')}
                style={{
                  border: 'none',
                  background: mode === 'edit' ? 'var(--accent-deep)' : 'transparent',
                  color: mode === 'edit' ? '#fff' : 'var(--muted)',
                  borderRadius: 6,
                  fontSize: 12,
                  padding: '3px 10px',
                  cursor: 'pointer',
                }}
              >
                编辑
              </button>
              <button
                type="button"
                onClick={() => setMode('preview')}
                style={{
                  border: 'none',
                  background: mode === 'preview' ? 'var(--accent-deep)' : 'transparent',
                  color: mode === 'preview' ? '#fff' : 'var(--muted)',
                  borderRadius: 6,
                  fontSize: 12,
                  padding: '3px 10px',
                  cursor: 'pointer',
                }}
              >
                预览
              </button>
            </Group>
          </>
        ) : null}
      </Group>

      {mode === 'edit' || !showPreview ? (
        <Textarea
          ref={(el) => {
            internalRef.current = el;
            if (inputRef) inputRef.current = el;
          }}
          autoComplete="off"
          minRows={minRows}
          autosize={autosize}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          styles={{ input: { fontFamily: 'inherit' } }}
        />
      ) : (
        <div
          className="bbcode-preview"
          style={{
            minHeight: 56,
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--card)',
            fontSize: 14,
            lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {preview}
        </div>
      )}

      {preview && mode === 'preview' ? (
        <Text size="xs" c="dimmed" mt={2}>
          （预览 · 点「编辑」返回输入）
        </Text>
      ) : null}
    </div>
  );
}
