// ===== MCP 弹窗：头像菜单「MCP」入口 =====
// 《主格》本身就是 MCP 服务器：端点 URL、令牌（本界面可创建，默认隐藏，眼睛显示）、Claude 配置
import { useState } from 'react';
import { ActionIcon, Button, Divider, Group, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { api } from '../../api/client';
import { openModalOnce } from '../../lib/modals';
import { useNavigate } from 'react-router-dom';

const MCP_TOOLS = [
  ['list_discussions / get_discussion', '读主题、看戏文'],
  ['list_tags / get_author_card', '标签与作者名片'],
  ['create_discussion / reply_post / didi', '开戏、接戏、滴滴私密对戏（需令牌）'],
  ['get_my_notifications / get_my_characters / get_my_badges', '个人数据（需令牌）'],
];

export function openMcpModal(): void {
  openModalOnce('mcp', (m) => {
    m.open({
      modalId: 'mcp',
      title: 'MCP（AI 接入）',
      centered: true,
      size: 'md',
      children: <McpContent />,
    });
  });
}

function McpContent() {
  const navigate = useNavigate();
  // MCP 已与主域名合并：任何环境都用当前 origin 的 /mcp（master 域名即提供 MCP 服务）
  const mcpUrl = `${window.location.origin}/mcp`;
  // 令牌：不落本机（每次打开为空）；可在本界面创建；默认隐藏（眼睛切换）
  const [token, setToken] = useState('');
  const [showForm, setShowForm] = useState(false); // 生成表单展开
  const [creating, setCreating] = useState(false); // 创建请求中
  const [tokenName, setTokenName] = useState('');
  const [newTokenPlain, setNewTokenPlain] = useState<string | null>(null); // 创建后的令牌（默认隐藏）
  const [newTokenVisible, setNewTokenVisible] = useState(false); // 新令牌明文显示开关（默认隐藏）
  // 配置文本中的令牌：默认掩码，手动显示
  const [configVisible, setConfigVisible] = useState(false);

  // 本界面直接创建令牌（与「开放 API」同一后端，不跳转）
  const createToken = async () => {
    setCreating(true);
    try {
      const r = await api<{ data: { id: number; token: string } }>('/me/api-tokens', { method: 'POST', body: { name: tokenName } });
      setNewTokenPlain(r.data.token); // 明文默认隐藏，眼睛显示
      setNewTokenVisible(false);
      setToken(r.data.token); // 自动填入（输入框默认掩码）
      setTokenName('');
      setShowForm(false);
    } catch (e) {
      notifications.show({ message: e instanceof Error ? e.message : '创建失败', color: 'red' });
    } finally {
      setCreating(false);
    }
  };

  const copyToken = async () => {
    if (!token.trim()) {
      notifications.show({ message: '请先粘贴你的开放 API 令牌', color: 'red' });
      return;
    }
    try {
      await navigator.clipboard.writeText(token.trim());
      notifications.show({ message: '令牌已复制', color: 'green' });
    } catch {
      notifications.show({ message: '复制失败，请手动复制', color: 'red' });
    }
  };

  const configJson = JSON.stringify(
    {
      mcpServers: {
        zhuge: {
          type: 'http',
          url: mcpUrl,
          headers: { Authorization: 'Bearer ' + (token.trim() || '<你的开放 API 令牌>') },
        },
      },
    },
    null,
    2
  );
  // 配置文本展示：默认掩码令牌（手动点眼睛显示明文）
  const displayConfig = configVisible ? configJson : configJson.replace(/Bearer [^"]+/, 'Bearer ••••••••');

  const copyConfig = async (withToken: boolean) => {
    const cfg = JSON.stringify(
      {
        mcpServers: {
          zhuge: {
            type: 'http',
            url: mcpUrl,
            ...(withToken ? { headers: { Authorization: 'Bearer ' + (token.trim() || '<你的开放 API 令牌>') } } : {}),
          },
        },
      },
      null,
      2
    );
    try {
      await navigator.clipboard.writeText(cfg);
      notifications.show({ message: withToken ? 'MCP 配置已复制（含令牌）' : 'MCP 配置已复制（仅只读）', color: 'green' });
    } catch {
      notifications.show({ message: '复制失败，请手动复制', color: 'red' });
    }
  };

  return (
    <Stack gap="md" py="xs">
      <Text size="sm">
        《主格》本身就是 <b>MCP 服务器</b>——Claude / Cursor 等支持 MCP 的 AI 客户端可直接连接，读取戏文、帮你开戏接戏。
      </Text>

      <Stack gap={4} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
        <Text size="xs" c="dimmed">
          MCP 端点
        </Text>
        <Text size="sm" style={{ fontFamily: 'monospace', userSelect: 'all' }}>
          {mcpUrl}
        </Text>
      </Stack>

      {/* 令牌：本界面创建；默认隐藏（眼睛切换显示），复制直接可用；不保存到本机 */}
      <Stack gap={6} style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: '10px 12px' }}>
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" fw={600}>
            🔑 你的令牌
          </Text>
          <Group gap={6} wrap="nowrap">
            <Button size="compact-xs" variant="default" onClick={copyToken}>
              复制令牌
            </Button>
            <Button size="compact-xs" variant="subtle" onClick={() => setShowForm((v) => !v)}>
              {showForm ? '取消' : '＋ 生成令牌'}
            </Button>
          </Group>
        </Group>
        <PasswordInput
          placeholder="粘贴或在本界面生成的开放 API 令牌"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.currentTarget.value)}
          size="xs"
        />
        {/* 生成令牌内联表单 */}
        {showForm && (
          <Group gap={8} wrap="nowrap">
            <TextInput
              placeholder="令牌名称（可留空）"
              autoComplete="off"
              maxLength={40}
              style={{ flex: 1 }}
              value={tokenName}
              onChange={(e) => setTokenName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createToken();
              }}
            />
            <Button size="compact-sm" variant="default" loading={creating} disabled={creating} onClick={createToken}>
              创建
            </Button>
          </Group>
        )}
        {/* 新令牌（默认隐藏，眼睛显示） */}
        {newTokenPlain && (
          <Stack gap={4} style={{ border: '1px solid var(--st-ok)', borderRadius: 8, padding: '8px 10px' }}>
            <Group justify="space-between" wrap="nowrap">
              <Text size="xs" fw={600} style={{ color: 'var(--st-ok)' }}>
                ✅ 新令牌已生成（点眼睛查看，请复制保存）
              </Text>
              <Button size="compact-xs" variant="subtle" onClick={() => setNewTokenVisible((v) => !v)}>
                {newTokenVisible ? '🙈 隐藏' : '👁 显示'}
              </Button>
            </Group>
            <Text size="xs" style={{ wordBreak: 'break-all', fontFamily: 'monospace', userSelect: 'all' }}>
              {newTokenVisible ? newTokenPlain : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
            </Text>
            <Group gap={8}>
              <Button size="compact-xs" variant="default" onClick={async () => { try { await navigator.clipboard.writeText(newTokenPlain); notifications.show({ message: '令牌已复制', color: 'green' }); } catch { notifications.show({ message: '复制失败，请手动复制', color: 'red' }); } }}>
                复制令牌
              </Button>
              <Button size="compact-xs" variant="subtle" onClick={() => setNewTokenPlain(null)}>
                我已保存
              </Button>
            </Group>
          </Stack>
        )}
        <Text size="xs" c="dimmed">
          令牌不保存到本机，关闭弹窗后清空；点右侧眼睛可查看明文。已有令牌可在「开放 API」撤销管理。
        </Text>
      </Stack>

      <Divider label="Claude Desktop 配置" labelPosition="left" />
      <Group justify="space-between" wrap="nowrap">
        <Text size="xs" c="dimmed">
          设置 → 开发者 → 编辑配置（claude_desktop_config.json），粘贴后重启：
        </Text>
        <ActionIcon variant="subtle" size="sm" aria-label={configVisible ? '隐藏令牌' : '显示令牌'} onClick={() => setConfigVisible((v) => !v)}>
          {configVisible ? '🙈' : '👁'}
        </ActionIcon>
      </Group>
      <Text size="xs" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', background: 'var(--card-soft, rgba(127,142,163,.08))', padding: '8px 12px', borderRadius: 8 }}>
        {displayConfig}
      </Text>
      <Group gap={8}>
        <Button size="compact-sm" variant="default" onClick={() => copyConfig(true)}>
          📋 复制配置（含令牌）
        </Button>
        <Button size="compact-sm" variant="subtle" onClick={() => copyConfig(false)}>
          复制配置（仅只读）
        </Button>
      </Group>

      <Divider label="可用工具" labelPosition="left" />
      <Stack gap={4}>
        {MCP_TOOLS.map(([tools, desc]) => (
          <Text key={tools} size="xs" c="dimmed">
            <Text component="span" style={{ fontFamily: 'monospace' }}>{tools}</Text>
            {' — '}
            {desc}
          </Text>
        ))}
      </Stack>

      <Text size="xs" c="dimmed">
        令牌即账号权限，请勿分享；泄露可在「开放 API」立即撤销。
      </Text>
      <Button
        size="compact-xs"
        variant="subtle"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => {
          // 先关弹窗再跳转（SPA 路由切换不会卸载 portal 上的 modal）
          modals.closeAll();
          navigate('/docs/mcp');
        }}
      >
        📖 查看完整 MCP 文档
      </Button>
    </Stack>
  );
}
