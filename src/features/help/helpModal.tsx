// ===== 使用帮助弹窗（Nielsen 原则 10：帮助与文档） =====
// 维护说明：
// - body 里可用 **加粗**（渲染层转 <b>，勿用未处理的 markdown 星号残留）
// - 条目与文案需与当前 UI 保持一致（新增/改动功能时同步更新）
import { List, Stack, Text, ThemeIcon } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconCircleCheck } from '@tabler/icons-react';
import { openModalOnce } from '../../lib/modals';
import type { ReactNode } from 'react';

// 把 **加粗** 渲染为 <b>（防止 markdown 星号原样显示）
function renderBody(body: string): ReactNode[] {
  const parts = body.split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) => (i % 2 === 1 ? <b key={i}>{p}</b> : p));
}

const HELP_ITEMS: { title: string; body: string }[] = [
  {
    title: '开戏',
    body: '首页右上角「＋」：填标题即可开戏（默认发布到「讨论区」标签，可展开「高级设置」改标签、加内容、选皮或插图）。内容自动云端保存，换设备也能续写；发布后草稿自动清除。',
  },
  {
    title: '接戏',
    body: '在主题里点「接戏」续写楼层：默认只需写内容，**展开「高级设置」可**选皮、插图或 BBCode 格式。Ctrl + Enter 快捷提交，**提交后立即显示**，中途退出自动保存草稿。点击某条回复的「接戏」可 @指定楼层。',
  },
  {
    title: '皮',
    body: '头像菜单「皮」打开皮管理：创建/编辑你的演绎皮（姓名+性别必填，年龄/身份/备注/外貌在「更多资料」里）。开戏/接戏/滴滴时可选择"皮上"演绎，帖子与通知会显示该皮的名字与头像。',
  },
  {
    title: '滴滴',
    body: '在帖子下点「滴滴（私服）」一键创建仅你与对方可见的私密主题，对方可在里面**接受 / 婉拒**。点作者名可看对方的接戏率与婉拒数。头像菜单「我的滴滴」查看私密主题列表与响应情况。',
  },
  {
    title: '邀请接戏',
    body: '主题首楼点「⋯ 更多」菜单里的「🎭 邀请接戏」点名邀请戏友：一次最多 8 人，同标签优先，可搜索用户名；被邀请者会收到通知。每主题累计最多邀请 20 人。',
  },
  {
    title: '浏览与排序',
    body: '首页上下滑动翻卡，顶部可切「推荐 / 最新 / 热门」和标签。主题内可切「从新到旧 / 从旧到新」，长戏自动折叠可展开；**再次打开主题可回到上次位置**。',
  },
  {
    title: '文字格式（BBCode）',
    body: '支持 [b]粗体[/b]、[i]斜体[/i]、[u]下划线[/u]、[s]删除线[/s]、[big]/[small] 字号、[color=red]颜色[/color]、[copy]可复制块[/copy]、[dice]1d20[/dice] 骰子（**结果由服务端掷定**，不可伪造）。外链/图片/音频等一律不支持。',
  },
  {
    title: '格币与三连',
    body: '**每日打开自动 +5 格币**；今日任务另有奖励（首次开戏 +5、接戏 +3、滴滴 +3、点赞/收藏/投币/打赏各有）。**一键三连**（🎉）= 点赞+投币+收藏一步完成。投币/打赏作者实得 90%。累计格币提升等级（Lv.2 起作者名旁显示）。',
  },
  {
    title: '徽章与邀请',
    body: '注册、首次开戏/接戏/滴滴得基础徽章；累计开戏 10 个、接戏 20 次、滴滴 10 次、邀请 3 人得进阶徽章。头像菜单「邀请好友」可复制链接或生成海报，好友注册后你得「以文会友」。',
  },
  {
    title: '作者名片与屏蔽',
    body: '点作者名或徽章看名片：皮/皮下信息、徽章、被滴滴的接戏率与婉拒数；名片里可直接**屏蔽该用户**（头像菜单「屏蔽管理」可取消）。',
  },
  {
    title: '收藏夹',
    body: '头像菜单「收藏夹」查看收藏的帖子（点开定位到收藏的楼），每条可三连。收藏仅自己可见。',
  },
  {
    title: '通知',
    body: '顶部铃铛看未读通知（接戏、滴滴、回复、@等），点开自动进入对应主题并定位。通知**皮上显示**（对方用皮触发时显示皮名与头像）。开启「系统通知」后浏览器也会推送。',
  },
  {
    title: '导出记录',
    body: '主题首楼点「⋯ 更多」菜单里的「🖼 导出图片记录 / 📄 导出文字记录」，可保存为图片（多种样式）或文字记录，方便留档分享。',
  },
  {
    title: '账号安全',
    body: '使用用户名 + 密码登录/注册（未登录会自动创建游客账号；头像菜单「账号安全」可设置密码转正，跨设备找回内容）。**删除自己的主题或帖子需输入当前密码验证**，防止误删/盗号删内容。',
  },
  {
    title: '标签与 API',
    body: '开戏弹窗「＋申请」可申请新标签（管理员通过后可用）。头像菜单「开放 API / MCP」可生成令牌让程序或 AI 客户端（Claude / Cursor）以你的身份操作，详见「开放 API 文档」。',
  },
];

function HelpModalContent() {
  return (
    <Stack gap="sm" py="xs">
      <List spacing="sm" size="sm" icon={<ThemeIcon color="slate" size={18} radius="xl"><IconCircleCheck size={12} /></ThemeIcon>}>
        {HELP_ITEMS.map((it) => (
          <List.Item key={it.title}>
            <Text fw={600} span>
              {it.title}：
            </Text>
            <Text span c="dimmed">
              {renderBody(it.body)}
            </Text>
          </List.Item>
        ))}
      </List>
    </Stack>
  );
}

export function openHelpModal(): void {
  openModalOnce('help', (m) => {
    m.open({
      title: '使用帮助',
      size: 480,
      children: <HelpModalContent />,
    });
  });
}
