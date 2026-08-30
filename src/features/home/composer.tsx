// ===== 发帖弹窗（openComposer 等价物）：标题/内容/标签/配图 + 云草稿自动保存 =====
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Button, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { api } from '../../api/client';
import { useDrafts, useInitData } from '../../api/hooks';
import { fetcher } from '../../api/hooks';
import useSWR from 'swr';
import { clearDraft, saveDraft } from '../../lib/drafts';
import { pickImageFile, uploadImageFile } from '../../lib/utils';
import BBCodeEditor from '../../components/BBCodeEditor';
import type { CharacterItem, Tag, User } from '../../types';

// 角色性别显示
const GENDER_LABEL: Record<string, string> = { male: '男', female: '女', other: '其他', secret: '保密' };

interface ComposerDraft {
  title: string;
  content: string;
  tagIds: number[];
  imageUrl: string | null;
}

interface ComposerContentProps {
  user: User;
  tags: Tag[];
  /** 提交成功回调：由首页负责 closeAll + 刷新 + 跳转 */
  onPosted: (id: number) => void;
}

function normalizeDraft(raw: unknown): ComposerDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    title: typeof r.title === 'string' ? r.title : '',
    content: typeof r.content === 'string' ? r.content : '',
    tagIds: Array.isArray(r.tagIds) ? r.tagIds.filter((x): x is number => typeof x === 'number') : [],
    imageUrl: typeof r.imageUrl === 'string' ? r.imageUrl : null,
  };
}

export function ComposerContent({ user, tags, onPosted }: ComposerContentProps) {
  // 草稿恢复：SSR 首屏 init 优先，否则取 /me/drafts（打开弹窗时才挂载）
  const { data: initData } = useInitData();
  const { data: draftsData } = useDrafts();
  const draft = useMemo<ComposerDraft | null>(() => {
    const raw =
      (initData?.drafts as Record<string, unknown> | undefined)?.['composer'] ??
      draftsData?.['composer'];
    return normalizeDraft(raw);
  }, [initData, draftsData]);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  // 角色卡：发帖可选"以角色身份演绎"（SWR 共享缓存，SSR 内联即时显示，无等待）
  const { data: charsData } = useSWR<{ data: CharacterItem[] }>('/me/characters', fetcher);
  const characters = charsData?.data ?? [];
  // 角色 value → 完整信息映射（下拉选项显示外貌/性别用）
  const charMap = useMemo(() => new Map(characters.map((c) => [String(c.id), c])), [characters]);
  const [characterId, setCharacterId] = useState<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const restoredRef = useRef(false);

  // 打开时恢复草稿（只恢复一次：SSR init 同步就绪则首帧恢复，否则等 /me/drafts 到位）
  useEffect(() => {
    if (!draft || restoredRef.current) return;
    restoredRef.current = true;
    setTitle(draft.title);
    setContent(draft.content);
    setTagIds(draft.tagIds);
    setImageUrl(draft.imageUrl);
  }, [draft]);

  // 卸载时取消未执行的自动保存（避免提交清空草稿后又被旧定时器写回）
  useEffect(
    () => () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    },
    []
  );

  // 防抖 250ms 自动保存（值显式传入，避免闭包拿到旧值）
  const scheduleSave = (t: string, c: string, ids: number[], img: string | null) => {
    setSaveStatus('saving');
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        await saveDraft('composer', { title: t, content: c, tagIds: ids, imageUrl: img });
        setSaveStatus('saved');
      } catch {
        /* 自动保存失败静默（下次编辑重试） */
      }
    }, 250);
  };

  const cancelPendingSave = () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  };

  const handlePickImage = async () => {
    const file = await pickImageFile();
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImageFile(file);
      setImageUrl(url);
      scheduleSave(title, content, tagIds, url);
    } catch (e) {
      notifications.show({ color: 'red', message: e instanceof Error ? e.message : '上传失败' });
    } finally {
      setUploading(false);
    }
  };

  const removeImage = () => {
    setImageUrl(null);
    scheduleSave(title, content, tagIds, null);
  };

  const toggleTag = (id: number) => {
    const next = tagIds.includes(id) ? tagIds.filter((x) => x !== id) : [...tagIds, id];
    setTagIds(next);
    scheduleSave(title, content, next, imageUrl);
  };

  const handleSubmit = async () => {
    const t = title.trim();
    if (!t) {
      notifications.show({ color: 'red', message: '标题不能为空' });
      return;
    }
    if (tagIds.length === 0) {
      notifications.show({ color: 'red', message: '请至少选择一个标签' });
      return;
    }
    setSubmitting(true);
    try {
      // 后端契约（src/index.js）：body { title, content, tagIds, imageUrl, characterId }
      const res = await api<{ data: { id: number } }>('/discussions', {
        method: 'POST',
        body: {
          title: t,
          content: content.trim(),
          tagIds,
          imageUrl: imageUrl || undefined,
          characterId: characterId ? Number(characterId) : undefined,
        },
      });
      cancelPendingSave();
      try {
        await clearDraft('composer');
      } catch {
        /* 忽略清理失败 */
      }
      modals.closeAll();
      onPosted(res.data.id);
    } catch (e) {
      notifications.show({ color: 'red', message: e instanceof Error ? e.message : '开戏失败' });
      setSubmitting(false);
    }
  };

  // 可选标签：非隐藏 + 公告栏（id=1）仅管理员可选；主标签淡色底高亮
  const primaryTags = useMemo(
    () =>
      tags
        .filter((t) => t.position != null && !t.is_hidden)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [tags]
  );
  const primaryIds = useMemo(() => new Set(primaryTags.map((t) => t.id)), [primaryTags]);
  const selectable = useMemo(
    () => tags.filter((t) => !t.is_hidden && (user.isAdmin || t.id !== 1)),
    [tags, user]
  );
  const filteredTags = useMemo(() => {
    const kw = tagSearch.trim().toLowerCase();
    if (!kw) return selectable;
    return selectable.filter((t) => t.name.toLowerCase().includes(kw));
  }, [selectable, tagSearch]);

  const saveLabel =
    saveStatus === 'saving' ? '自动保存中…' : saveStatus === 'saved' ? '✓ 已自动保存' : '';

  return (
    <Stack gap="sm" style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: 2 }}>
      <TextInput
        label="标题"
        placeholder="标题（不能为空）"
        maxLength={40}
        autoFocus
        data-autofocus
        autoComplete="off"
        value={title}
        onChange={(e) => {
          const v = e.currentTarget.value;
          setTitle(v);
          scheduleSave(v, content, tagIds, imageUrl);
        }}
      />
      <BBCodeEditor
        value={content}
        onChange={(v) => {
          setContent(v);
          scheduleSave(title, v, tagIds, imageUrl);
        }}
        placeholder="内容（可选）……（Ctrl+Enter 提交）"
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            void handleSubmit();
          }
        }}
      />
      {imageUrl ? (
        <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
          <img
            src={imageUrl}
            alt="配图"
            style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 8, display: 'block' }}
          />
          <ActionIcon
            variant="filled"
            color="dark"
            size="sm"
            style={{ position: 'absolute', top: 6, right: 6 }}
            onClick={removeImage}
            aria-label="移除图片"
          >
            ✕
          </ActionIcon>
        </div>
      ) : null}
      <Group gap="xs">
        <Button variant="subtle" size="compact-sm" loading={uploading} onClick={handlePickImage}>
          🖼 插图
        </Button>
        {imageUrl ? (
          <Text size="xs" c="dimmed">
            已添加 1 张图片（每帖最多一张）
          </Text>
        ) : null}
      </Group>
      {characters.length > 0 && (
        <Select
          label="以角色身份演绎（可选）"
          placeholder="不指定"
          data={characters.map((c) => ({ value: String(c.id), label: c.name }))}
          value={characterId}
          onChange={setCharacterId}
          clearable
          searchable
          nothingFoundMessage="无匹配角色"
          renderOption={({ option }) => {
            const c = charMap.get(option.value);
            return (
              <Group gap={8} wrap="nowrap">
                {c?.appearance ? (
                  <img
                    src={c.appearance}
                    alt=""
                    style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : (
                  <span style={{ width: 24, textAlign: 'center', flexShrink: 0, fontSize: 15 }}>👤</span>
                )}
                <span>{option.label}</span>
                {c?.gender ? (
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
                    {GENDER_LABEL[c.gender] || c.gender}
                  </span>
                ) : null}
              </Group>
            );
          }}
        />
      )}
      <Group justify="space-between" wrap="nowrap" align="center">
        <Text size="sm">
          标签{' '}
          <span style={{ color: 'var(--accent-deep)' }}>* 至少选一个</span>
          {tagIds.length ? (
            <span style={{ color: 'var(--accent-deep)' }}>（已选 {tagIds.length} 个）</span>
          ) : null}
        </Text>
        {/* 申请新标签入口（管理员通过后自动创建；放在行尾不增加高度） */}
        <Button
          size="compact-xs"
          variant="subtle"
          leftSection={<span>＋</span>}
          onClick={() => import('./tagRequestModal').then((m) => m.openTagRequestModal())}
        >
          申请
        </Button>
      </Group>
      <TextInput
        placeholder="搜索标签…"
        autoComplete="off"
        value={tagSearch}
        onChange={(e) => setTagSearch(e.currentTarget.value)}
      />
      <div
        style={{
          maxHeight: 280,
          overflowY: 'auto',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 8,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        {filteredTags.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`tagchip comp-tag${primaryIds.has(t.id) ? ' comp-tag-primary' : ''}${
              tagIds.includes(t.id) ? ' active' : ''
            }`}
            onClick={() => toggleTag(t.id)}
          >
            {t.name}
          </button>
        ))}
        {filteredTags.length === 0 ? (
          <Text size="sm" c="dimmed">
            无匹配标签
          </Text>
        ) : null}
      </div>
      {/* 提交按钮固定在底部：弹窗内容超高时滚动，按钮始终可见可点 */}
      <Group
        justify="space-between"
        mt="sm"
        style={{
          position: 'sticky',
          bottom: 0,
          background: 'var(--card)',
          paddingTop: 8,
          paddingBottom: 4,
          zIndex: 1,
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--muted)', minHeight: 16 }}>{saveLabel}</span>
        <Button loading={submitting} onClick={handleSubmit}>
          开戏
        </Button>
      </Group>
    </Stack>
  );
}
