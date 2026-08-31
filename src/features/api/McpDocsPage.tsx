// ===== MCP 文档页（/docs/mcp）：端点、认证、限流、工具、接入配置 =====
import { useEffect } from 'react';
import { Badge, Stack, Table, Text } from '@mantine/core';

// MCP 已与主域名合并：任何环境都用当前 origin 的 /mcp（master 域名即提供 MCP 服务）
const MCP_URL = typeof window !== 'undefined' ? `${window.location.origin}/mcp` : '/mcp';

const TOOLS: { name: string; auth: string; desc: string }[] = [
  { name: 'list_discussions', auth: '公开', desc: '主题列表（标签/排序/分页/搜索）' },
  { name: 'get_discussion', auth: '公开', desc: '主题详情（全部帖子楼层，最多 5000 楼）' },
  { name: 'search_discussions', auth: '公开', desc: '关键词搜索' },
  { name: 'list_tags', auth: '公开', desc: '全部标签' },
  { name: 'get_author_card', auth: '公开', desc: '作者名片（角色/徽章/滴滴统计）' },
  { name: 'create_discussion', auth: '令牌', desc: '发布主题（开戏）' },
  { name: 'reply_post', auth: '令牌', desc: '接戏回复（可指定楼层/角色）' },
  { name: 'invite_discussion', auth: '令牌', desc: '邀请用户接你的戏（一次最多 8 人）' },
  { name: 'list_invite_candidates', auth: '令牌', desc: '查看可邀请接戏的用户（同标签优先）' },
  { name: 'didi', auth: '令牌', desc: '滴滴：发起私密对戏' },
  { name: 'get_my_notifications', auth: '令牌', desc: '我的通知（未读数 + 跳转链接）' },
  { name: 'get_my_characters', auth: '令牌', desc: '我的角色卡' },
  { name: 'get_my_badges', auth: '令牌', desc: '我的徽章与邀请统计' },
  { name: 'like_post', auth: '令牌', desc: '点赞帖子（toggle；每日首次 +1 格币）' },
  { name: 'favorite_post', auth: '令牌', desc: '收藏帖子（toggle；每日首次 +2 格币）' },
  { name: 'coin_post', auth: '令牌', desc: '投币 1 格币（给他人每日首次 +3 格币）' },
  { name: 'tip_post', auth: '令牌', desc: '打赏自定义格币（≥1；给他人每日首次 +3 格币）' },
  { name: 'respond_didi', auth: '令牌', desc: '响应滴滴：接受（accepted）/ 婉拒（declined）' },
  { name: 'get_my_coins', auth: '令牌', desc: '我的格币：余额/累计/等级/今日任务' },
  { name: 'claim_daily', auth: '令牌', desc: '领取每日登录格币（+10）' },
];

export default function McpDocsPage() {
  useEffect(() => {
    document.title = 'MCP 文档 - 主格';
  }, []);

  return (
    <Stack gap="lg" py="md" className="container" style={{ maxWidth: 900 }}>
      <div>
        <Text fw={700} size="xl">
          《主格》MCP 文档
        </Text>
        <Text size="sm" c="dimmed">
          Model Context Protocol：让 AI 客户端（Claude / Cursor 等）读取戏文、以你的身份开戏、接戏、滴滴私密对戏。
        </Text>
      </div>

      <Stack gap={6}>
        <Text fw={600}>🔗 端点</Text>
        <Text size="sm" style={{ fontFamily: 'monospace', background: 'var(--card-soft, rgba(127,142,163,.08))', padding: '8px 12px', borderRadius: 8 }}>
          {MCP_URL}
        </Text>
        <Text size="xs" c="dimmed">
          MCP 与主域名合并提供（与站点同域），限流与 API 层统一。传输为 JSON 响应模式：POST JSON-RPC 2.0，无需 SSE 长连接。
        </Text>
      </Stack>

      <Stack gap={6}>
        <Text fw={600}>🔑 认证</Text>
        <Text size="sm">
          读工具可匿名；写工具与个人数据需要令牌。请求头加：
        </Text>
        <Text size="sm" style={{ fontFamily: 'monospace', background: 'var(--card-soft, rgba(127,142,163,.08))', padding: '8px 12px', borderRadius: 8 }}>
          Authorization: Bearer &lt;开放 API 令牌&gt;
        </Text>
        <Text size="xs" c="dimmed">
          令牌在头像菜单 → 开放 API 生成（写操作与网页同权限，请勿分享）。
        </Text>
      </Stack>

      <Stack gap={6}>
        <Text fw={600}>🚦 限流（每分钟每令牌/IP）</Text>
        <Text size="sm">
          读取 180 次；写工具（发帖/接戏/滴滴/个人数据）40 次。超出返回 isError 提示「请求过于频繁」。请让 AI 客户端保持合理调用频率。
        </Text>
      </Stack>

      <Stack gap={6}>
        <Text fw={600}>🧰 工具清单（20 个）</Text>
        <Table.ScrollContainer minWidth={520}>
          <Table striped highlightOnHover verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>工具</Table.Th>
                <Table.Th>认证</Table.Th>
                <Table.Th>说明</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {TOOLS.map((t) => (
                <Table.Tr key={t.name}>
                  <Table.Td><Text size="sm" style={{ fontFamily: 'monospace' }}>{t.name}</Text></Table.Td>
                  <Table.Td>
                    <Badge size="xs" color={t.auth === '公开' ? 'green' : 'orange'} variant="light">
                      {t.auth}
                    </Badge>
                  </Table.Td>
                  <Table.Td><Text size="sm">{t.desc}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Stack>

      <Stack gap={6}>
        <Text fw={600}>🤖 Claude Desktop 接入</Text>
        <Text size="xs" c="dimmed">
          设置 → 开发者 → 编辑配置（claude_desktop_config.json）：
        </Text>
        <Text size="xs" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', background: 'var(--card-soft, rgba(127,142,163,.08))', padding: '10px 14px', borderRadius: 8 }}>
{`{
  "mcpServers": {
    "zhuge": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": {
        "Authorization": "Bearer <你的开放 API 令牌>"
      }
    }
  }
}`}
        </Text>
      </Stack>

      <Stack gap={6}>
        <Text fw={600}>🔒 安全说明</Text>
        <Text size="xs" c="dimmed">
          MCP 与主站同域提供（/mcp），限流与 API 层统一（按令牌身份独立限流，读 180/写 40 每分钟）；令牌泄露可在「开放 API」立即撤销。
        </Text>
      </Stack>
    </Stack>
  );
}
