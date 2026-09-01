// ===== 布局：顶部导航（毛玻璃）+ 主容器 + 通知/WS 接线 =====
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ActionIcon, Box, Button, Group, Loader, Menu, Modal, Switch, Text, Tooltip, useMantineColorScheme } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { mutate } from 'swr';
import {
  IconBell,
  IconBellRinging,
  IconBug,
  IconDownload,
  IconFolder,
  IconHeartHandshake,
  IconHelpCircle,
  IconKey,
  IconLogout,
  IconMasksTheater,
  IconMoon,
  IconPhoto,
  IconShield,
  IconSun,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconUserCog,
  IconUserCircle,
  IconAward,
  IconApi,
  IconBan,
  IconRobot,
  IconLogin,
  IconUserPlus,
  IconListCheck,
  IconStar,
} from '@tabler/icons-react';
import { useAuth } from '../features/auth/AuthContext';
import { useUnread, useCoins, useTags, preloadAllPrimaryLists } from '../api/hooks';
import { api } from '../api/client';
import { levelLabel } from '../lib/coins';
import { useNotifySocket } from '../lib/ws';
import { usePwaInstall } from '../lib/pwa';
import { usePushNotify } from '../lib/pushNotify';
import { collapseIosUrlBar } from '../lib/iosUrlBar';
import { isDebugMode, setDebugMode } from '../lib/vconsole';
import Avatar from './Avatar';

// 新用户一次性引导条（P6，证据：T26 帮助入口无可见文字 + 首页语C黑话密集 + onboarding 曾被移除）：
// 只在首页（/ 或 /tag/N，非 latest/hot 排序）显示，可关闭、localStorage 记忆、不复现、不打断操作
function NewUserHint() {
  const [shown, setShown] = useState(() => {
    try {
      return localStorage.getItem('zhuge-seen-hint') !== '1';
    } catch {
      return false;
    }
  });
  const dismiss = () => {
    try {
      localStorage.setItem('zhuge-seen-hint', '1');
    } catch {
      /* 忽略 */
    }
    setShown(false);
  };
  if (!shown) return null;
  return (
    <div className="new-hint" role="note">
      <span className="new-hint-text">
        🎭 欢迎来到主格：<b>开戏</b>=创建新主题 · <b>接戏</b>=回复楼层继续演绎 · <b>滴滴</b>=私密对戏。
        右上角 <b>?</b> 有完整使用帮助。
      </span>
      <button type="button" className="new-hint-close" onClick={dismiss} aria-label="关闭欢迎提示">
        ✕
      </button>
    </div>
  );
}

// iOS：非 feed 页面在每次路由变化时收起地址栏（feed 页面由自身处理滚动锁定）
function IosUrlBarCollapser() {
  const location = useLocation();
  useEffect(() => {
    if (document.querySelector('.feed-mode')) return; // feed 自行处理
    collapseIosUrlBar();
  }, [location.pathname, location.search]);
  return null;
}

// 弹窗模块动态导入：主包不携带弹窗代码，点开时才加载对应 chunk
const openLoginModal = () => import('../features/auth/authModals').then((m) => m.openLoginModal());
const openRegisterModal = () => import('../features/auth/authModals').then((m) => m.openRegisterModal());
const openSecurityModal = () => import('../features/security/securityModals').then((m) => m.openSecurityModal());
// 通知弹窗：Layout 内嵌 <Modal opened> 单例控制（@mantine/modals 全局栈 7.x OPEN 不去重，
// 重复打开会叠加多个弹窗；本地 state 天然单例），组件静态引入避免重复加载
import { NotificationsModalContent } from '../features/notifications/notificationsModal';
const openDeviceAuthsModal = () => import('../features/device/deviceModals').then((m) => m.openDeviceAuthsModal());
const openAvatarModal = () => import('../features/profile/profileModals').then((m) => m.openAvatarModal());
const openGenderModal = () => import('../features/profile/profileModals').then((m) => m.openGenderModal());
const openHelpModal = () => import('../features/help/helpModal').then((m) => m.openHelpModal());
const openCharactersModal = () => import('../features/characters/charactersModal').then((m) => m.openCharactersModal());
const openBadgesModal = (userId: number) => import('../features/badges/badgesModal').then((m) => m.openBadgesModal(userId));
const openInviteModal = (userId: number, username: string) => import('../features/badges/inviteModal').then((m) => m.openInviteModal(userId, username));
const openApiTokensModal = () => import('../features/api/apiTokensModal').then((m) => m.openApiTokensModal());
const openMcpModal = () => import('../features/api/mcpModal').then((m) => m.openMcpModal());
const openBlocksModal = () => import('../features/private/blocksModal').then((m) => m.openBlocksModal());
const openCoinsModal = () => import('../features/coins/coinsModal').then((m) => m.openTasksModal());
const openFavoritesModal = () => import('../features/coins/favoritesModal').then((m) => m.openFavoritesModal());
// iOS 安装指引静态引入：modals.open 需在点击手势内同步执行，iOS 才显示弹窗
// （动态 import 会延到手势之外，弹窗可能不出现）
import { openIosInstallHint } from '../features/pwa/installHint';

export default function Layout({ children }: { children: ReactNode }) {
  // 深色/浅色/跟随系统 三态循环切换（图标显示当前状态）
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const dark = colorScheme === 'dark';
  const schemeLabel = colorScheme === 'dark' ? '深色模式' : colorScheme === 'light' ? '浅色模式' : '跟随系统';
  const schemeNext = colorScheme === 'light' ? '深色' : colorScheme === 'dark' ? '跟随系统' : '浅色';
  const cycleScheme = () => {
    if (colorScheme === 'light') setColorScheme('dark');
    else if (colorScheme === 'dark') setColorScheme('auto');
    else setColorScheme('light');
  };
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  // 未登录不请求通知（首屏零 API）
  const { unread, mutate: refreshUnread } = useUnread(!!user);
  const { data: coinData, mutate: mutateCoins } = useCoins(!!user);
  // 全局预热首页列表：在任意页面（详情页/我的/私密等）停留时后台预加载
  // "全部 × recommend/latest/hot" + 主标签列表 → 回首页直接命中 SWR 缓存，
  // 零请求零骨架（其他页面点 logo 回首页不再闪加载）。
  // 内部已做"同分钟去重 + 已缓存跳过"，路由变化重复触发是无副作用的 no-op。
  const { tags: layoutTags } = useTags();
  useEffect(() => {
    if (layoutTags.length) preloadAllPrimaryLists(layoutTags);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutTags]);
  // 每日打开应用自动领格币（+10；当天已领则 no-op，领到提示）
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void api<{ claimed: boolean; amount: number }>('/me/daily-claim', { method: 'POST' })
      .then((r) => {
        if (r.claimed && !cancelled) {
          void mutateCoins();
          notifications.show({ message: `每日格币 +${r.amount} 🪙`, color: 'green' });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, mutateCoins]);
  const pwa = usePwaInstall();
  const push = usePushNotify();
  // 通知弹窗（本地 state 单例）
  const [notifOpen, setNotifOpen] = useState(false);
  // 头像下拉菜单（受控）：宫格按钮是自定义 button 而非 Menu.Item，Mantine 不会自动关闭，
  // 打开徽章/角色卡等弹窗前先关菜单，避免弹窗与下拉叠在一起
  const [menuOpen, setMenuOpen] = useState(false);
  // 调试模式（vConsole 虚拟控制台）：localStorage 记忆，dev 模式视为已开启
  const [debugOn, setDebugOn] = useState(() => isDebugMode() || import.meta.env.DEV);
  // 路由变化守卫：离开主题页（/d/:id，返回主页等）时归零页面滚动。
  // 常驻定时器方案：浏览器可能在返回导航后任意时刻异步恢复滚动位置（即使
  // scrollRestoration=manual），一次性补刀不够；用常驻 interval 在"离开主题页后的
  // 一段时间内"持续检查并归零，确保导航栏不被滚出视口。
  const guardLocation = useLocation();
  const prevPathRef = useRef(guardLocation.pathname);
  const leaveTopicAtRef = useRef(0); // 最近一次离开主题页的时间戳（0=不在守卫窗口）
  useEffect(() => {
    const wasTopic = /^\/d\/\d+/.test(prevPathRef.current);
    const nowTopic = /^\/d\/\d+/.test(guardLocation.pathname);
    prevPathRef.current = guardLocation.pathname;
    if (wasTopic && !nowTopic) {
      // 刚从主题页离开 → 开启守卫窗口（5 秒）
      leaveTopicAtRef.current = Date.now();
      // 仅推荐模式（feed）主页需要回顶：列表模式（最新/热门）允许自由滚动，
      // 只清一次主题页的滚动残留即可（不持续拦截，避免"看门狗"阻止下滑）
      const sort = new URLSearchParams(guardLocation.search).get('sort');
      const isFeedHome = !sort && /^\/(tag\/\d+)?$/.test(guardLocation.pathname);
      if (!isFeedHome) return;
      const reset = () => {
        const sy = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
        if (sy !== 0) {
          try { window.scrollTo(0, 0); } catch { /* 忽略 */ }
        }
      };
      reset();
    }
  }, [guardLocation.pathname, guardLocation.search]);

  // 常驻定时器：仅推荐模式（feed）主页持续归零滚动（该模式页面本就不应滚动）；
  // 列表模式（最新/热门）不拦截任何滚动——从主题返回后可直接下滑浏览，无"看门狗"。
  // 覆盖"点 Logo 回主页/整页刷新后 feed 未挂载"等守卫历史路径判断不到的场景。
  useEffect(() => {
    const iv = window.setInterval(() => {
      const isTopic = /^\/d\/\d+/.test(guardLocation.pathname);
      // 推荐模式主页判断：路径是 / 或 /tag/:id，且 sort 非 latest/hot
      const sort = new URLSearchParams(guardLocation.search).get('sort');
      const isFeedHome = !isTopic && !sort && (/^\/(tag\/\d+)?$/.test(guardLocation.pathname));
      // 清除过期的守卫窗口标记（不再用于拦截，仅清理状态）
      if (leaveTopicAtRef.current !== 0 && Date.now() - leaveTopicAtRef.current > 5000) {
        leaveTopicAtRef.current = 0;
      }
      if (isTopic) return; // 主题页内允许滚动
      if (!isFeedHome) return; // 列表模式（最新/热门）主页自由滚动，不拦截
      const sy = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      if (sy !== 0) {
        try { window.scrollTo(0, 0); } catch { /* 忽略 */ }
      }
    }, 100);
    return () => window.clearInterval(iv);
  }, [guardLocation.pathname, guardLocation.search]);

  // 无障碍变通：Mantine Menu 内部装饰元素（autofocus 定位 div、Menu.Label、Menu.Divider、Menu.arrow）
  // 在 role=menu 里会被 axe 判为缺少合法子项（aria-required-children，且 axe 不认 presentation/none）。
  // 菜单打开后给这些非菜单项元素补 aria-hidden，从可访问性树隐藏（不影响 Mantine 的聚焦行为）。
  useEffect(() => {
    const fix = () => {
      document.querySelectorAll('[role="menu"] > *').forEach((el) => {
        if (el.getAttribute('role') === 'menuitem') return; // 菜单项保留
        if (!el.getAttribute('aria-hidden')) el.setAttribute('aria-hidden', 'true');
      });
    };
    fix();
    const obs = new MutationObserver(fix);
    obs.observe(document.body, { subtree: true, childList: true });
    return () => obs.disconnect();
  }, []);

  // 系统通知开关（头像菜单内嵌 Switch）：开/关 + 各状态提示；任何情况都有反馈，不静默
  const handlePushToggle = async () => {
    if (push.busy) {
      notifications.show({ message: '正在处理中，请稍候…', color: 'gray' });
      return;
    }
    if (push.state === 'subscribed') {
      await push.disable();
      notifications.show({ message: '已关闭系统通知', color: 'gray' });
      return;
    }
    if (push.iosNeedsPwa) {
      notifications.show({
        message: 'iPhone 需先安装《主格》到主屏幕（导航栏下载图标 → 添加到主屏幕）才能开启系统通知',
        color: 'clay',
      });
      openIosInstallHint();
      return;
    }
    if (!push.supported) {
      notifications.show({ message: '当前浏览器不支持系统通知', color: 'clay' });
      return;
    }
    if (push.state === 'denied') {
      notifications.show({
        message: '通知权限已被拒绝。请点击浏览器地址栏左侧的锁/盾牌图标 → 网站设置 → 通知 → 改为「允许」，然后刷新页面重试',
        color: 'clay',
      });
      return;
    }
    const r = await push.enable();
    if (r.ok) {
      notifications.show({ message: '已开启系统通知', color: 'green' });
      return;
    }
    // 订阅失败：区分网络受限与其他原因，给出可操作提示
    const reason = r.reason || '';
    if (reason.includes('denied')) {
      notifications.show({ message: '通知权限已被拒绝，请在浏览器站点设置中允许后再试', color: 'clay' });
      return;
    }
    if (reason === 'permission-timeout' || reason === 'unsupported') {
      notifications.show({ message: '当前环境无法请求通知权限，请稍后重试', color: 'clay' });
      return;
    }
    if (
      reason.includes('AbortError') ||
      reason.includes('Registration failed') ||
      reason.includes('NetworkError') ||
      reason.includes('push timeout')
    ) {
      // 推送服务连接失败/超时：多为网络受限（Chrome/Edge 的推送服务 FCM 在国内常不可达）
      notifications.show({
        message: '开启失败：无法连接浏览器推送服务（网络受限，如代理/VPN 环境常见）。请更换网络（或开代理）后重试',
        color: 'clay',
      });
      return;
    }
    notifications.show({ message: `开启失败：${reason || '未知原因'}`, color: 'clay' });
  };

  // 调试模式开关（vConsole 虚拟控制台）：开启初始化并显示，关闭销毁；localStorage 记忆
  const handleDebugToggle = async () => {
    const next = !debugOn;
    setDebugOn(next);
    const ok = await setDebugMode(next);
    notifications.show({
      message: next ? (ok ? '已开启调试模式（虚拟控制台）' : '虚拟控制台初始化失败') : '已关闭调试模式',
      color: next ? (ok ? 'green' : 'clay') : 'gray',
    });
  };

  // WebSocket 实时通知：连上/收到消息都刷新未读数
  useNotifySocket({
    enabled: !!user,
    onEvent: () => {
      mutate('/me/notifications');
    },
  });

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  // PWA 安装按钮：
  // - Android Chrome / 桌面 Chrome/Edge：beforeinstallprompt 触发时显示，点击弹系统安装面板
  // - iOS：无该事件，始终显示「安装」图标，点击弹出「添加到主屏幕」指引
  const pwaButton = pwa.canInstall ? (
    <Tooltip label="安装《主格》" withArrow>
      <ActionIcon
        variant="subtle"
        size="lg"
        onClick={() => pwa.promptInstall()}
        aria-label="安装应用"
        title="安装《主格》"
      >
        <IconDownload size={20} />
      </ActionIcon>
    </Tooltip>
  ) : pwa.canInstallIos ? (
    <Tooltip label="安装《主格》" withArrow>
      <ActionIcon
        variant="subtle"
        size="lg"
        onClick={() => openIosInstallHint()}
        aria-label="安装应用"
        title="安装《主格》"
      >
        <IconDownload size={20} />
      </ActionIcon>
    </Tooltip>
  ) : null;

  return (
    <>
      <IosUrlBarCollapser />
      <nav className="nav">
        <Link
          className="nav-logo"
          to="/"
          onClick={(e) => {
            // 点击回首页：先同步归零页面滚动（iOS 返回时滚动恢复晚于 feed 挂载，
            // 仅靠 feed 的 recenterPage 兜底会漏）。已在首页时阻止重复导航，避免历史栈污染。
            window.scrollTo(0, 0);
            if (location.pathname === '/' && !location.search) {
              e.preventDefault();
            }
          }}
          aria-label="回到首页"
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontFamily: 'inherit',
            lineHeight: 'inherit',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <span className="dot">主</span>主格
        </Link>
        <div className="nav-spacer" />
        <div className="nav-user">
          <Tooltip label={`切换到${schemeNext}`} withArrow>
            <ActionIcon
              variant="subtle"
              size="lg"
              onClick={cycleScheme}
              aria-label="切换显示模式"
              title={`当前：${schemeLabel}，点击切换到${schemeNext}`}
            >
              {colorScheme === 'dark' ? (
                <IconMoon size={20} />
              ) : colorScheme === 'light' ? (
                <IconSun size={20} />
              ) : (
                <IconDeviceDesktop size={20} />
              )}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="使用帮助" withArrow>
            <ActionIcon
              variant="subtle"
              size="lg"
              onClick={() => openHelpModal()}
              aria-label="使用帮助"
              title="使用帮助"
            >
              <IconHelpCircle size={20} />
            </ActionIcon>
          </Tooltip>
          {pwaButton}
          {user ? (
            <>
              <Tooltip label="通知" withArrow>
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  onClick={() => setNotifOpen(true)}
                  style={{ position: 'relative' }}
                  aria-label="通知"
                >
                  <IconBell size={20} />
                  {unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
                </ActionIcon>
              </Tooltip>
              <Menu position="bottom-end" withArrow opened={menuOpen} onChange={setMenuOpen}>
                <Menu.Target>
                  {/* 不用 Button 包裹：避免按钮自身的 overflow/圆角裁剪性别徽标；
                      role=button 让 Mantine 注入的 aria-haspopup/aria-expanded 合法 */}
                  <span
                    className="nav-avatar-btn"
                    aria-label="用户菜单"
                    role="button"
                    tabIndex={0}
                    onClick={() => setMenuOpen(true)}
                  >
                    <Avatar user={user} size="md" showGender className="nav-avatar" />
                  </span>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>
                    {user.username}
                    <Text component="span" size="xs" style={{ color: 'var(--primary)' }} ml={6}>
                      🪙 {coinData?.balance ?? ''}
                    </Text>
                    <Text component="span" size="xs" c="dimmed" ml={4}>
                      {coinData ? `· ${levelLabel(coinData.level)}` : ''}
                    </Text>
                  </Menu.Label>
                  {/* 功能宫格：按语义分组（我的内容 / 我的账号 / 系统），高频置顶，便于扫视 */}
                  <div className="menu-groups">
                    {[
                      {
                        title: '我的内容',
                        items: [
                          { icon: <IconHeartHandshake size={20} />, label: '我的滴滴', onClick: () => navigate('/private') },
                          { icon: <IconFolder size={20} />, label: '我的主题', onClick: () => navigate('/my') },
                          { icon: <IconListCheck size={20} />, label: '今日任务', onClick: () => openCoinsModal() },
                          { icon: <IconStar size={20} />, label: '收藏夹', onClick: () => openFavoritesModal() },
                        ],
                      },
                      {
                        title: '我的账号',
                        items: [
                          { icon: <IconMasksTheater size={20} />, label: '角色卡', onClick: () => openCharactersModal() },
                          { icon: <IconAward size={20} />, label: '我的徽章', onClick: () => openBadgesModal(user.id) },
                          { icon: <IconUserPlus size={20} />, label: '邀请好友', onClick: () => openInviteModal(user.id, user.username) },
                          { icon: <IconKey size={20} />, label: '账号安全', onClick: () => openSecurityModal() },
                          { icon: <IconPhoto size={20} />, label: '上传头像', onClick: () => openAvatarModal() },
                          { icon: <IconUserCog size={20} />, label: '性别', onClick: () => openGenderModal() },
                        ],
                      },
                      {
                        title: '系统',
                        items: [
                          { icon: <IconApi size={20} />, label: '开放 API', onClick: () => openApiTokensModal() },
                          { icon: <IconRobot size={20} />, label: 'MCP', onClick: () => openMcpModal() },
                          { icon: <IconDeviceMobile size={20} />, label: '设备授权', onClick: () => openDeviceAuthsModal() },
                          { icon: <IconBan size={20} />, label: '屏蔽管理', onClick: () => openBlocksModal() },
                          ...(user.isAdmin
                            ? [{ icon: <IconShield size={20} />, label: '管理', onClick: () => navigate('/admin') }]
                            : []),
                        ],
                      },
                    ].map((g) => (
                      <div key={g.title} className="menu-group">
                        <div className="menu-group-title">{g.title}</div>
                        <div className="menu-grid">
                          {g.items.map((it) => (
                            <button
                              key={it.label}
                              type="button"
                              className="menu-grid-item"
                              onClick={() => {
                                setMenuOpen(false);
                                it.onClick();
                              }}
                            >
                              {it.icon}
                              <span>{it.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <Menu.Divider />
                  {/* 调试模式开关（vConsole 虚拟控制台）：同系统通知，用自定义 div 保证 Switch 点击可靠 */}
                  <div className="menu-push-row" role="menuitem" onClick={(e) => e.stopPropagation()}>
                    <Group justify="space-between" wrap="nowrap" w="100%">
                      <Group gap={6} wrap="nowrap">
                        <IconBug size={16} />
                        <Text size="sm">调试模式</Text>
                        <Text size="xs" c="dimmed">
                          {debugOn ? '已开启' : '未开启'}
                        </Text>
                      </Group>
                      <Box
                        pos="relative"
                        display="inline-flex"
                        style={{ alignItems: 'center', justifyContent: 'center' }}
                        w={44}
                        h={22}
                      >
                        <Switch size="sm" checked={debugOn} onChange={handleDebugToggle} aria-label="调试模式" />
                      </Box>
                    </Group>
                  </div>
                  {/* 系统通知开关：不用 Menu.Item（button 内嵌 Switch 非法嵌套，点击可能被吞），
                      用自定义 div 保证点击事件可靠触发 */}
                  <div className="menu-push-row" role="menuitem" onClick={(e) => e.stopPropagation()}>
                    <Group justify="space-between" wrap="nowrap" w="100%">
                      <Group gap={6} wrap="nowrap">
                        <IconBellRinging size={16} />
                        <Text size="sm">系统通知</Text>
                        {push.busy ? (
                          <Text size="xs" c="dimmed">
                            处理中…
                          </Text>
                        ) : push.iosNeedsPwa ? (
                          <Text size="xs" style={{ color: 'var(--st-warn)' }}>
                            需先安装
                          </Text>
                        ) : push.state === 'subscribed' ? (
                          <Text size="xs" style={{ color: 'var(--st-ok)' }}>
                            已开启
                          </Text>
                        ) : push.state === 'denied' ? (
                          <Text size="xs" style={{ color: 'var(--st-danger)' }}>
                            已拒绝
                          </Text>
                        ) : push.state === 'unsupported' ? (
                          <Text size="xs" c="dimmed">
                            不支持
                          </Text>
                        ) : (
                          <Text size="xs" c="dimmed">
                            未开启
                          </Text>
                        )}
                      </Group>
                      <Box
                        pos="relative"
                        display="inline-flex"
                        style={{ alignItems: 'center', justifyContent: 'center' }}
                        w={44}
                        h={22}
                      >
                        <Switch
                          size="sm"
                          checked={push.state === 'subscribed'}
                          // 只禁用"处理中"：iOS 普通标签页 PushManager 不存在（supported=false），
                          // 但此时点按应进入"需先安装/不支持"提示分支，不能直接禁用
                          disabled={push.busy}
                          onChange={handlePushToggle}
                          aria-label="系统通知"
                        />
                        {push.busy && <Loader size={14} style={{ position: 'absolute', inset: 0, margin: 'auto' }} />}
                      </Box>
                    </Group>
                  </div>
                  <Menu.Divider />
                  <Menu.Item leftSection={<IconLogout size={16} />} onClick={handleLogout}>
                    <Text component="span" style={{ color: 'var(--st-danger)' }}>
                      登出
                    </Text>
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </>
          ) : (
            <>
              {/* 未登录：单个用户图标下拉菜单（登录 / 注册新账号），省导航栏空间 */}
              <Menu position="bottom-end" withArrow>
                <Menu.Target>
                  <ActionIcon
                    variant="subtle"
                    size="lg"
                    aria-label="登录或注册"
                    title="登录 / 注册"
                  >
                    <IconUserCircle size={22} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconLogin size={16} />} onClick={() => openLoginModal()}>
                    登录
                  </Menu.Item>
                  <Menu.Item leftSection={<IconUserPlus size={16} />} color="clay" onClick={() => openRegisterModal()}>
                    注册或新设备
                  </Menu.Item>
                  {/* 未登录也能用的公开项：开放 API / MCP 文档（无需登录可看；生成令牌才需登录） */}
                  <Menu.Divider />
                  <Menu.Item leftSection={<IconApi size={16} />} onClick={() => navigate('/docs/api')}>
                    开放 API
                  </Menu.Item>
                  <Menu.Item leftSection={<IconRobot size={16} />} onClick={() => navigate('/docs/mcp')}>
                    MCP
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </>
          )}
        </div>
      </nav>
      {/* 通知弹窗：单例（本地 state 控制，避免 modals 栈叠加）
          transition duration 0：点击通知跳转时弹窗立即消失，不做 200ms 淡出——
          否则用户会看到"点击后弹窗慢慢淡出"的延迟感（误以为加载中） */}
      <Modal opened={notifOpen} onClose={() => setNotifOpen(false)} title="通知" size={480} centered transitionProps={{ transition: 'pop', duration: 0 }}>
        <NotificationsModalContent onClose={() => setNotifOpen(false)} />
      </Modal>
      {/* 内容区：key=路径 → 路由切换时强制重建整个内容区（清掉旧页残留的 DOM，
          如主题页的帖子卡片在水合/协调后残留在主页顶部） */}
      {/* 新用户引导条（仅首页：/ 或 /tag/N 且非 latest/hot） */}
      {(() => {
        const p = location.pathname;
        const sort = new URLSearchParams(location.search).get('sort');
        const isHome = (p === '/' || /^\/tag\/\d+$/.test(p)) && !sort;
        return isHome ? <NewUserHint /> : null;
      })()}
      <div className="container" key={location.pathname}>{children}</div>
    </>
  );
}
