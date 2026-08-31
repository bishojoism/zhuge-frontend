// ===== 帖子弹窗：源码查看（原始 BBCode） =====
import { useState } from 'react';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck } from '@tabler/icons-react';
import { copyText, displayName } from '../../lib/utils';
import type { TopicPost } from './topicTypes';

// ===== 帖子源码弹窗：显示原始 BBCode 文本（所见即所得的反面——看格式标签），可复制 =====
export function SourceCodeModal({
  post,
  onClose,
}: {
  post: TopicPost;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = post.content || '（空）';

  const handleCopy = async () => {
    const ok = await copyText(post.content || '');
    if (ok) {
      setCopied(true);
      notifications.show({ color: 'teal', message: '源码已复制' });
      window.setTimeout(() => setCopied(false), 1500);
    } else {
      notifications.show({ color: 'red', message: '复制失败，请手动选择复制' });
    }
  };

  return (
    <Modal opened onClose={onClose} title={`源码 · ${displayName(post)}`} centered size={600}>
      <Stack gap="sm">
        <Text size="xs" c="dimmed">
          这是帖子内容的原始文本（含格式标签，如 [b]加粗[/b]、[color=red]颜色[/color]）。BBCode 不会被执行，仅原样展示。
        </Text>
        <pre
          style={{
            margin: 0,
            maxHeight: '50vh',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'ui-monospace, "SF Mono", Consolas, Menlo, monospace',
            fontSize: 13,
            lineHeight: 1.6,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '10px 12px',
          }}
        >
          {text}
        </pre>
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            关闭
          </Button>
          <Button onClick={handleCopy} color={copied ? 'teal' : undefined} leftSection={copied ? <IconCheck size={14} /> : undefined}>
            {copied ? '已复制' : '复制源码'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ===== 帖子编辑弹窗已移除（编辑功能下线） =====
