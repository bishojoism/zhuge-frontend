// 皮上选择器（无文本输入版）：真实 &lt;button&gt; + Menu 下拉 —— iOS 物理上不可能弹"自动填充"。
// 背景：Mantine Select 底层永远是文本 &lt;input&gt;（searchable=false 只是 readOnly input，非 button），
// 而 iOS 对 readonly input 也会弹"自动填充"且无视 autocomplete 属性（off/new-password 均不可靠，
// 社区实证：iOS autofill 在 readonly input 上照常出现并跨屏残留）。
// 本组件 DOM 不含任何 &lt;input&gt;，从根上消除该问题；代价是无打字搜索（皮名靠滚动选择）。
import { Button, Group, Menu } from '@mantine/core';
import type { CharacterItem } from '../../types';
import { GENDER_LABEL } from './topicTypes';

interface CharacterPickerProps {
  options: CharacterItem[];
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  ariaLabel?: string;
  /** 触发器宽度（数字或 CSS 宽度；不传则自适应） */
  width?: number | string;
  size?: 'compact-xs' | 'compact-sm' | 'xs' | 'sm';
  disabled?: boolean;
}

function OptionRow({ c }: { c: CharacterItem }) {
  return (
    <Group gap={8} wrap="nowrap">
      {c.appearance ? (
        <img
          src={c.appearance}
          alt=""
          style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        />
      ) : (
        <span style={{ width: 24, textAlign: 'center', flexShrink: 0, fontSize: 15 }}>👤</span>
      )}
      <span>{c.name}</span>
      {c.gender ? (
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
          {GENDER_LABEL[c.gender] || c.gender}
        </span>
      ) : null}
    </Group>
  );
}

export function CharacterPicker({
  options,
  value,
  onChange,
  placeholder = '（可选）皮上',
  ariaLabel,
  width,
  size = 'compact-xs',
  disabled,
}: CharacterPickerProps) {
  if (!options.length) return null;
  const selected = options.find((c) => String(c.id) === value) || null;
  return (
    <Menu position="bottom-start" withinPortal>
      <Menu.Target>
        <Button
          variant="default"
          size={size}
          disabled={disabled}
          aria-label={ariaLabel}
          style={
            width
              ? { width, color: selected ? undefined : 'var(--muted)' }
              : { color: selected ? undefined : 'var(--muted)' }
          }
          rightSection={<span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
            {selected ? selected.name : placeholder}
          </span>
        </Button>
      </Menu.Target>
      <Menu.Dropdown style={{ minWidth: Math.max(typeof width === 'number' ? width : 170, 170), maxHeight: 280, overflowY: 'auto' }}>
        {value !== null && (
          <Menu.Item onClick={() => onChange(null)} color="gray">
            以本人身份（不使用皮）
          </Menu.Item>
        )}
        {options.map((c) => (
          <Menu.Item
            key={c.id}
            onClick={() => onChange(String(c.id))}
            rightSection={String(c.id) === value ? <span style={{ color: 'var(--primary)' }}>✓</span> : undefined}
          >
            <OptionRow c={c} />
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
