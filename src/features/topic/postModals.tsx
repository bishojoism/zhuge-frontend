// ===== 帖子弹窗：源码查看（原始 BBCode）+ 编辑（内容/配图，首帖可改标题） =====
import { useState } from 'react';
import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck } from '@tabler/icons-react';
import { api } from '../../api/client';
import { copyText, displayName, pickImageFile, uploadImageFile } from '../../lib/utils';
import BBCodeEditor from '../../components/BBCodeEditor';
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

// ===== 帖子编辑弹窗：内容（BBCode 编辑器）+ 配图；首帖可改标题 =====
export function EditPostModal({
  post,
  isFirstPost,
  discussionTitle,
  onClose,
  onSaved,
}: {
  post: TopicPost;
  isFirstPost: boolean;
  discussionTitle: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [content, setContent] = useState(post.content || '');
  const [title, setTitle] = useState(discussionTitle);
  const [imageUrl, setImageUrl] = useState<string | null>(post.image_url || null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handlePickImage = async () => {
    const file = await pickImageFile();
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImageFile(file);
      setImageUrl(url);
    } catch (e) {
      notifications.show({ color: 'red', message: e instanceof Error ? e.message : '上传失败' });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    const c = content.trim();
    if (!c) {
      notifications.show({ color: 'red', message: '内容不能为空' });
      return;
    }
    if (isFirstPost && !title.trim()) {
      notifications.show({ color: 'red', message: '标题不能为空' });
      return;
    }
    setSaving(true);
    try {
      await api(`/posts/${post.id}`, {
        method: 'PUT',
        body: {
          content: c,
          ...(isFirstPost ? { title: title.trim() } : {}),
          imageUrl: imageUrl || null,
        },
      });
      notifications.show({ color: 'teal', message: '已保存' });
      onClose();
      onSaved();
    } catch (e) {
      notifications.show({ color: 'red', message: e instanceof Error ? e.message : '保存失败' });
      setSaving(false);
    }
  };

  return (
    <Modal opened onClose={onClose} title="编辑帖子" centered size={560}>
      <Stack gap="sm">
        {isFirstPost ? (
          <TextInput
            label="标题"
            maxLength={40}
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            autoComplete="off"
          />
        ) : null}
        <BBCodeEditor
          value={content}
          onChange={setContent}
          placeholder="修改内容……"
          minRows={3}
        />
        <Group gap="xs" align="center">
          <Button variant="subtle" size="compact-sm" loading={uploading} onClick={handlePickImage}>
            🖼 更换插图
          </Button>
          {imageUrl ? (
            <>
              {/* 行内小缩略图（不撑高弹窗） */}
              <span style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
                <img
                  src={imageUrl}
                  alt="配图缩略图"
                  style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, display: 'block' }}
                />
              </span>
              <Button variant="subtle" size="compact-xs" color="gray" onClick={() => setImageUrl(null)}>
                移除图片
              </Button>
            </>
          ) : (
            <Text size="xs" c="dimmed">
              无配图
            </Text>
          )}
        </Group>
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave} loading={saving}>
            保存
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
