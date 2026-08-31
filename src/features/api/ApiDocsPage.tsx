// ===== 开放 API 文档页（/docs/api）：全端点列表、参数、认证、限流说明 =====
import { useEffect } from 'react';
import { Badge, Stack, Table, Text } from '@mantine/core';

// 端点表：method | 路径 | 说明 | 认证
interface Endpoint {
  method: string;
  path: string;
  desc: string;
  auth: boolean;
  body?: string;
}

const GROUPS: { title: string; items: Endpoint[] }[] = [
  {
    title: '主题 / 内容',
    items: [
      { method: 'GET', path: '/api/discussions?tag=&sort=&page=&seed=&q=', desc: '主题列表（推荐/最新/热门、标签过滤、搜索）', auth: false },
      { method: 'GET', path: '/api/discussions/:id', desc: '主题详情（帖子分页：?page=&order=new|old=&aroundPostId=&aroundNumber= 定位目标楼）', auth: false },
      { method: 'GET', path: '/api/discussions/:id/export', desc: '主题记录导出（一次性全量楼层，上限 5000；限流 3 次/分钟）', auth: false },
      { method: 'POST', path: '/api/discussions', desc: '发布主题（至少选一个标签；可选角色/图片）', auth: true, body: '{ title, content, tagIds[], imageUrl?, characterId? }' },
      { method: 'POST', path: '/api/discussions/:id/posts', desc: '接戏回复（可选回复目标/角色/图片；Ctrl+Enter 同逻辑）', auth: true, body: '{ content, replyTo?, imageUrl?, characterId? }' },
      { method: 'DELETE', path: '/api/discussions/:id', desc: '删除主题（作者需密码/通行密钥验证；管理员免验证）', auth: true },
      { method: 'DELETE', path: '/api/posts/:id', desc: '删除帖子（首帖=级联删整个主题；作者需密码/通行密钥验证）', auth: true },
      { method: 'POST', path: '/api/discussions/:id/invite', desc: '邀请接戏（仅作者，点名邀请 1-8 人接自己的戏，每主题累计最多 20 人；被邀请者收通知）', auth: true, body: '{ userIds: number[] }' },
      { method: 'GET', path: '/api/discussions/:id/invite-candidates', desc: '邀请候选用户（30 天活跃、同标签优先、排除已邀请）', auth: true },
      { method: 'POST', path: '/api/zhuge/didi', desc: '滴滴：一键创建私密主题（可选以角色身份）', auth: true, body: '{ postId, characterId? }' },
      { method: 'POST', path: '/api/discussions/:id/didi-response', desc: '接受 / 婉拒滴滴', auth: true, body: '{ status: "accepted" | "declined" }' },
    ],
  },
  {
    title: '互动 / 格币',
    items: [
      { method: 'POST', path: '/api/posts/:id/like', desc: '点赞（toggle，每帖一次；首次互动 +1 格币）', auth: true },
      { method: 'POST', path: '/api/posts/:id/favorite', desc: '收藏（toggle，每帖一次；首次互动 +1 格币）', auth: true },
      { method: 'POST', path: '/api/posts/:id/coin', desc: '投币 1 格币（作者实得 0.9；允许给自己投；自投不通知）', auth: true },
      { method: 'POST', path: '/api/posts/:id/tip', desc: '打赏自定义格币（≥1；10% 税；允许打赏自己；自赏不通知）', auth: true, body: '{ amount }' },
      { method: 'POST', path: '/api/me/daily-claim', desc: '每日登录领 10 格币（当天已领则 no-op）', auth: true },
      { method: 'GET', path: '/api/me/coins', desc: '格币余额 + 累计获得 + 等级 + 今日任务进度', auth: true },
      { method: 'GET', path: '/api/me/favorites', desc: '我的收藏夹（含首帖互动计数）', auth: true },
    ],
  },
  {
    title: '认证 / 账号安全',
    items: [
      { method: 'POST', path: '/api/register', desc: '密码注册（可选邀请人）', auth: false, body: '{ username, password, invitedBy? }' },
      { method: 'POST', path: '/api/login', desc: '密码登录（返回 Set-Cookie 会话）', auth: false, body: '{ username, password }' },
      { method: 'POST', path: '/api/logout', desc: '退出登录', auth: true },
      { method: 'POST', path: '/api/me/username', desc: '设置用户名（通行密钥首次登录后）', auth: true, body: '{ username }' },
      { method: 'POST', path: '/api/passkey/register/begin|finish', desc: '绑定通行密钥（WebAuthn 两段式）', auth: true },
      { method: 'POST', path: '/api/passkey/login/begin|finish', desc: '通行密钥登录', auth: false },
      { method: 'POST', path: '/api/reauth/begin', desc: '重认证第一步（确认通行密钥，签发一次性令牌）', auth: true },
      { method: 'POST', path: '/api/reauth/finish', desc: '重认证第二步（验证通行密钥 → 5 分钟一次性 reauthToken）', auth: true },
      { method: 'POST', path: '/api/me/password', desc: '设置/修改密码（需 reauthToken 或当前密码）', auth: true, body: '{ newPassword, currentPassword? | reauthToken? }' },
      { method: 'POST', path: '/api/me/password/remove', desc: '删除密码（需通行密钥重认证）', auth: true },
      { method: 'POST', path: '/api/me/passkeys/:id/remove', desc: '解绑通行密钥（需 reauthToken 或当前密码）', auth: true },
      { method: 'GET', path: '/api/me/security', desc: '账号安全信息（密码/通行密钥）', auth: true },
    ],
  },
  {
    title: '个人（需登录）',
    items: [
      { method: 'GET', path: '/api/me', desc: '当前用户信息', auth: true },
      { method: 'GET', path: '/api/me/characters', desc: '我的角色卡列表', auth: true },
      { method: 'POST', path: '/api/characters', desc: '创建角色卡', auth: true, body: '{ name, gender?, age?, identity?, note?, appearance? }' },
      { method: 'PUT', path: '/api/characters/:id', desc: '更新角色卡', auth: true },
      { method: 'DELETE', path: '/api/characters/:id', desc: '删除角色卡', auth: true },
      { method: 'GET', path: '/api/me/discussions', desc: '我发布的公开主题', auth: true },
      { method: 'GET', path: '/api/me/private', desc: '我的私密主题（滴滴）列表 + 响应统计', auth: true },
      { method: 'GET', path: '/api/me/drafts', desc: '我的云草稿', auth: true },
      { method: 'POST', path: '/api/me/drafts', desc: '保存草稿', auth: true, body: '{ key, data }' },
      { method: 'DELETE', path: '/api/me/drafts?key=', desc: '删除草稿', auth: true },
      { method: 'POST', path: '/api/me/avatar', desc: '设置头像（站内图 URL）', auth: true, body: '{ url }' },
      { method: 'POST', path: '/api/me/gender', desc: '设置性别', auth: true, body: '{ gender }' },
      { method: 'GET', path: '/api/me/notifications', desc: '通知列表 + 未读数（含跳转 url）', auth: true },
      { method: 'POST', path: '/api/me/notifications/read', desc: '标记已读（单条 { id } 或全部 { all: true }）', auth: true },
      { method: 'GET', path: '/api/me/badges', desc: '我的徽章 + 邀请统计', auth: true },
      { method: 'GET', path: '/api/me/invites', desc: '邀请明细（谁通过我的链接注册）', auth: true },
      { method: 'GET', path: '/api/me/blocks', desc: '我的屏蔽列表', auth: true },
      { method: 'POST', path: '/api/me/blocks', desc: '屏蔽用户', auth: true, body: '{ userId }' },
      { method: 'DELETE', path: '/api/me/blocks/:userId', desc: '取消屏蔽', auth: true },
    ],
  },
  {
    title: '开放 API 令牌',
    items: [
      { method: 'POST', path: '/api/me/api-tokens', desc: '创建令牌（最多 5 个；明文只返回一次）', auth: true, body: '{ name }' },
      { method: 'GET', path: '/api/me/api-tokens', desc: '令牌列表（含最后使用时间，无明文）', auth: true },
      { method: 'DELETE', path: '/api/me/api-tokens/:id', desc: '撤销令牌（立即失效）', auth: true },
    ],
  },
  {
    title: '设备 / 推送',
    items: [
      { method: 'GET', path: '/api/device/auth-requests/mine', desc: '我的待处理设备授权请求', auth: true },
      { method: 'GET', path: '/api/device/auth/:id', desc: '设备授权请求详情', auth: true },
      { method: 'POST', path: '/api/device/auth/:id/approve', desc: '批准设备授权', auth: true },
      { method: 'POST', path: '/api/device/auth/:id/deny', desc: '拒绝设备授权', auth: true },
      { method: 'POST', path: '/api/push/subscribe', desc: '订阅 Web Push（浏览器通知）', auth: true, body: '{ endpoint, keys }' },
      { method: 'POST', path: '/api/push/unsubscribe', desc: '取消推送订阅', auth: true },
    ],
  },
  {
    title: '标签 / 其他',
    items: [
      { method: 'GET', path: '/api/tags', desc: '全部标签', auth: false },
      { method: 'POST', path: '/api/tag-requests', desc: '申请新标签（管理员批准后创建）', auth: true, body: '{ name, reason? }' },
      { method: 'GET', path: '/api/tag-requests', desc: '我的标签申请列表', auth: true },
      { method: 'POST', path: '/api/tag-requests/:id/handle', desc: '处理标签申请（管理员：批准/驳回）', auth: true },
      { method: 'GET', path: '/api/users', desc: '用户列表', auth: false },
      { method: 'GET', path: '/api/author-card?userId=&characterId=', desc: '作者名片（角色/皮下/徽章/滴滴统计）', auth: false },
      { method: 'GET', path: '/api/users/:id/didi-stats', desc: '用户的滴滴响应统计（接/拒/待）', auth: false },
      { method: 'GET', path: '/api/sticky-discussions', desc: '置顶主题列表', auth: false },
      { method: 'POST', path: '/api/reports', desc: '举报内容', auth: true, body: '{ targetType, targetId, reason }' },
      { method: 'POST', path: '/api/upload', desc: '上传图片（返回站内 /img/ URL）', auth: true },
      { method: 'GET', path: '/api/init', desc: '首屏初始化数据（用户/标签/草稿/未读数）', auth: false },
    ],
  },
];

function MethodBadge({ method }: { method: string }) {
  const color = method === 'GET' ? 'green' : method === 'POST' ? 'blue' : method === 'DELETE' ? 'red' : 'gray';
  return <Badge size="xs" color={color} variant="light">{method}</Badge>;
}

export default function ApiDocsPage() {
  useEffect(() => {
    document.title = '开放 API 文档 - 主格';
  }, []);

  return (
    <Stack gap="lg" py="md" className="container" style={{ maxWidth: 900 }}>
      <div>
        <Text fw={700} size="xl">
          《主格》开放 API 文档
        </Text>
        <Text size="sm" c="dimmed">
          让程序（机器人 / 脚本 / 自动化）以你的身份操作《主格》。所有响应为 JSON；错误统一返回
          <Text component="code" span>{"{ error: '...' }"}</Text>
          + 状态码。
        </Text>
      </div>

      <Stack gap={6}>
        <Text fw={600}>🔑 认证方式</Text>
        <Text size="sm">
          公开读取接口（主题/标签/用户等）无需认证。写操作与个人数据需要登录，两种方式任选：
        </Text>
        <Text size="sm" style={{ fontFamily: 'monospace', background: 'var(--card-soft, rgba(127,142,163,.08))', padding: '8px 12px', borderRadius: 8 }}>
          # 方式一：浏览器会话（网页自动携带 cookie）<br />
          # 方式二：个人访问令牌（推荐给程序）<br />
          # 在 头像菜单 → 开放 API 生成令牌后：<br />
          Authorization: Bearer &lt;你的令牌&gt;
        </Text>
      </Stack>

      <Stack gap={6}>
        <Text fw={600}>🚦 限流（每分钟）</Text>
        <Text size="sm">
          按 IP 或令牌独立计数：认证类 12 次 / 上传 10 次 / 写操作（发帖·回复·滴滴·举报等）40 次 / 普通读取 180 次。
          超出返回 429「请求过于频繁」。程序请控制频率，避免短时间大量请求。
        </Text>
      </Stack>

      <Stack gap={6}>
        <Text fw={600}>❌ 常见错误码</Text>
        <Text size="sm">
          400 参数或校验失败 · 401 未登录 · 403 无权限（或封禁） · 404 不存在 · 429 触发限流
        </Text>
      </Stack>

      {GROUPS.map((g) => (
        <Stack key={g.title} gap={6}>
          <Text fw={600}>{g.title}</Text>
          <Table.ScrollContainer minWidth={640}>
            <Table striped highlightOnHover verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={70}>方法</Table.Th>
                  <Table.Th>路径</Table.Th>
                  <Table.Th>说明</Table.Th>
                  <Table.Th>请求体</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {g.items.map((e) => (
                  <Table.Tr key={e.method + e.path}>
                    <Table.Td><MethodBadge method={e.method} /></Table.Td>
                    <Table.Td>
                      <Text size="sm" style={{ fontFamily: 'monospace' }}>{e.path}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{e.desc}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
                        {e.body || (e.auth ? '（需认证）' : '—')}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Stack>
      ))}

      <Stack gap={6}>
        <Text fw={600}>🧪 快速上手（curl）</Text>
        <Text size="sm" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', background: 'var(--card-soft, rgba(127,142,163,.08))', padding: '10px 14px', borderRadius: 8 }}>
{`# 读主题列表（无需认证）
curl '${typeof window !== 'undefined' ? window.location.origin : ''}/api/discussions'

# 发帖（带令牌）
curl -X POST '${typeof window !== 'undefined' ? window.location.origin : ''}/api/discussions' \\
  -H 'Authorization: Bearer <令牌>' \\
  -H 'Content-Type: application/json' \\
  -d '{"title":"标题","content":"内容","tagIds":[2]}'

# 接戏回复
curl -X POST '${typeof window !== 'undefined' ? window.location.origin : ''}/api/discussions/1/posts' \\
  -H 'Authorization: Bearer <令牌>' \\
  -H 'Content-Type: application/json' \\
  -d '{"content":"接戏内容"}'`}
        </Text>
      </Stack>
    </Stack>
  );
}
