// ===== 开放 API 弹窗：头像菜单「开放 API」入口 =====
// 个人访问令牌：程序调用 API 用（Authorization: Bearer <token>），替代 cookie
import { useState } from 'react';
import { Button, Divider, Group, Loader, Stack, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { api } from '../../api/client';
import { openModalOnce } from '../../lib/modals';
import { useNavigate } from 'react-router-dom';
import { useApiTokens, type ApiTokenRow } from '../../api/hooks';

export function openApiTokensModal(): void {
  openModalOnce('api-tokens', (m) => {
    m.open({
      modalId: 'api-tokens',
      title: '开放 API',
      centered: true,
      size: 'md',
      children: <ApiTokensContent />,
    });
  });
}

export function ApiTokensContent() {
  const navigate = useNavigate();
  // SWR 缓存：令牌列表跨弹窗复用；创建/撤销后 mutate 刷新
  const { data: rows, mutate } = useApiTokens();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  // 新令牌明文默认隐藏，手动点眼睛显示
  const [newTokenVisible, setNewTokenVisible] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const create = async () => {
    const n = name.trim();
    setCreating(true);
    try {
      const r = await api<{ data: { id: number; token: string } }>('/me/api-tokens', { method: 'POST', body: { name: n } });
      setNewToken(r.data.token); // 明文默认隐藏，眼睛显示
      setNewTokenVisible(false);
      setName('');
      void mutate();
    } catch (e) {
      notifications.show({ message: e instanceof Error ? e.message : '创建失败', color: 'red' });
    } finally {
      setCreating(false);
    }
  };

  const copyToken = async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      notifications.show({ message: '令牌已复制，请妥善保存（只显示这一次）', color: 'green' });
    } catch {
      notifications.show({ message: '复制失败，请手动复制', color: 'red' });
    }
  };

  const revoke = async (t: ApiTokenRow) => {
    setRevokingId(t.id);
    try {
      await api(`/me/api-tokens/${t.id}`, { method: 'DELETE' });
      notifications.show({ message: `已撤销「${t.name}」`, color: 'green' });
      void mutate();
    } catch (e) {
      notifications.show({ message: e instanceof Error ? e.message : '撤销失败', color: 'red' });
    } finally {
      setRevokingId(null);
    }
  };

  const copyCurl = async () => {
    const example = `# 读取主题列表
curl '${window.location.origin}/api/discussions'

# 以你的身份开戏（用你的令牌）
curl -X POST '${window.location.origin}/api/discussions' \\
  -H 'Authorization: Bearer ${newToken || '<你的令牌>'}' \\
  -H 'Content-Type: application/json' \\
  -d '{"title":"标题","content":"内容","tagIds":[2]}'

# 接戏回复
curl -X POST '${window.location.origin}/api/discussions/1/posts' \\
  -H 'Authorization: Bearer ${newToken || '<你的令牌>'}' \\
  -H 'Content-Type: application/json' \\
  -d '{"content":"接戏内容"}'
`;
    try {
      await navigator.clipboard.writeText(example);
      notifications.show({ message: '示例已复制', color: 'green' });
    } catch {
      notifications.show({ message: '复制失败', color: 'red' });
    }
  };

  return (
    <Stack gap="md" py="xs">
      <Text size="sm">
        个人访问令牌（最多 5 个）：让第三方程序以你的身份调用《主格》API，用于机器人、脚本、自动化。
      </Text>

      {/* 创建 */}
      {newToken ? (
        <Stack gap={6} style={{ border: '1px solid var(--st-ok)', borderRadius: 10, padding: 12 }}>
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm" fw={600}>
              ✅ 新令牌已生成（点眼睛查看，请复制保存）
            </Text>
            <Button size="compact-xs" variant="subtle" onClick={() => setNewTokenVisible((v) => !v)}>
              {newTokenVisible ? '🙈 隐藏' : '👁 显示'}
            </Button>
          </Group>
          <Text size="xs" style={{ wordBreak: 'break-all', fontFamily: 'monospace', userSelect: 'all' }}>
            {newTokenVisible ? newToken : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
          </Text>
          <Group gap={8}>
            <Button size="compact-sm" variant="default" onClick={copyToken}>
              复制令牌
            </Button>
            <Button size="compact-sm" variant="subtle" onClick={() => setNewToken(null)}>
              我已保存
            </Button>
          </Group>
        </Stack>
      ) : (
        <Group gap={8} wrap="nowrap">
          <TextInput
            placeholder="令牌名称（可留空）"
            autoComplete="off"
            maxLength={40}
            style={{ flex: 1 }}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void create();
            }}
          />
          <Button size="compact-sm" variant="default" loading={creating} onClick={create}>
            生成
          </Button>
        </Group>
      )}

      {/* 列表 */}
      <Divider label="我的令牌" labelPosition="left" />
      {rows === undefined ? (
        <Loader size="sm" />
      ) : rows.length === 0 ? (
        <Text size="xs" c="dimmed">
          还没有令牌。生成一个，用程序接入《主格》。
        </Text>
      ) : (
        <Stack gap={6}>
          {rows.map((t) => (
            <Group key={t.id} justify="space-between" wrap="nowrap">
              <Stack gap={1} style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" truncate>
                  {t.name}
                </Text>
                <Text size="xs" c="dimmed">
                  创建于 {(t.created_at || '').slice(0, 10)}
                  {t.last_used_at ? ` · 最近使用 ${(t.last_used_at || '').slice(0, 10)}` : ' · 尚未使用'}
                </Text>
              </Stack>
              <Button size="compact-xs" variant="subtle" color="red" loading={revokingId === t.id} onClick={() => revoke(t)}>
                撤销
              </Button>
            </Group>
          ))}
        </Stack>
      )}

      {/* 文档 */}
      <Divider label="使用说明" labelPosition="left" />
      <Stack gap={4}>
        <Text size="xs" c="dimmed">
          1. 所有 API 地址：<Text component="span" style={{ fontFamily: 'monospace' }}>{window.location.origin}/api/…</Text>
        </Text>
        <Text size="xs" c="dimmed">
          2. 认证：请求头加 <Text component="span" style={{ fontFamily: 'monospace' }}>Authorization: Bearer &lt;令牌&gt;</Text>（公开读取接口无需认证）
        </Text>
        <Text size="xs" c="dimmed">
          3. 可用的登录操作：开戏、接戏、滴滴、皮、通知等与网页一致
        </Text>
        <Text size="xs" c="dimmed">
          4. 令牌泄露请立即撤销；撤销后立即失效
        </Text>
        <Button size="compact-xs" variant="subtle" style={{ alignSelf: 'flex-start' }} onClick={copyCurl}>
          📋 复制 curl 示例
        </Button>
        <Button
          size="compact-xs"
          variant="subtle"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => {
            // 先关弹窗再跳转（SPA 路由切换不会卸载 portal 上的 modal）
            modals.closeAll();
            navigate('/docs/api');
          }}
        >
          📖 查看完整 API 文档
        </Button>
      </Stack>
    </Stack>
  );
}
