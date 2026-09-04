// ===== 布局：顶部导航（毛玻璃）+ 主容器 + 通知/WS 接线 =====
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ActionIcon, Button, Loader, Menu, Modal, Text, Tooltip, useMantineColorScheme } from '@mantine/core';
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
  IconRefresh,
  IconHome,
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

// 无障碍：每个页面一个主地标（<main>）+ 一个 h1（axe landmark-one-main /
// page-has-heading-one）。h1 视觉隐藏（.vh），文案按路由给页面主题；
// 各页可见大标题仍是 div（视觉不变），读屏先听到 h1 再听正文。
function routeH1(pathname: string): string {
  if (/^\/d\/\d+/.test(pathname)) return '主题详情 - 主格';
  if (/^\/tag\/\d+/.test(pathname)) return '讨论区 - 主格';
  if (pathname.startsWith('/private')) return '我的滴滴 - 主格';
  if (pathname.startsWith('/my')) return '我的主题 - 主格';
  if (pathname.startsWith('/admin')) return '管理后台 - 主格';
  if (pathname.startsWith('/docs/')) return '文档 - 主格';
  return '主格';
}

export default function Layout({ children }: { children: ReactNode }) {
  // 深色/浅色/跟随系统 三态循环切换（图标显示当前状态）
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  // 全局字号档位（头像菜单选择）：根元素 zoom 全局缩放（styles.css data-font-scale），
  // localStorage 持久化；md 为默认不设属性。兼容旧三档值 small/standard/large。
  const [fontScale, setFontScale] = useState<'xs' | 'sm' | 'md' | 'lg' | 'xl'>(() => {
    try {
      const v = localStorage.getItem('zhuge-font-scale');
      const norm = v === 'small' ? 'sm' : v === 'large' ? 'lg' : v === 'standard' ? 'md' : v;
      return norm === 'xs' || norm === 'sm' || norm === 'lg' || norm === 'xl' ? norm : 'md';
    } catch {
      return 'md';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('zhuge-font-scale', fontScale);
    } catch {
      /* localStorage 不可用忽略 */
    }
    if (fontScale === 'md') document.documentElement.removeAttribute('data-font-scale');
    else document.documentElement.setAttribute('data-font-scale', fontScale);
  }, [fontScale]);
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
  // 每日打开应用自动领格币（+5；当天已领则 no-op，领到提示）
  // 领币完成后刷新 next-step 横幅缓存：自动注册瞬间 next-step 请求可能与领币写入
  // 并发，读先于写会拿到"每日打开应用"（daily 未 done）并缓存住——领币落库后这里
  // 主动失效该缓存，横幅才会刷新为真实待办（如"首次发帖"）。
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void api<{ claimed: boolean; amount: number }>('/me/daily-claim', { method: 'POST' })
      .then((r) => {
        if (cancelled) return;
        void mutateCoins();
        void mutate(
          (k) => typeof k === 'string' && k.startsWith('/me/next-step'),
          undefined,
          { revalidate: true }
        );
        if (r.claimed) {
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
  // 底部 tab 导航：home = 路由内容（首页/列表等），inbox = 消息面板，me = 我的面板
  const [tab, setTab] = useState<'home' | 'inbox' | 'me'>('home');
  // 路由变化（点击"我的"里功能跳 /private 等）时自动收起面板露出路由内容
  const routerLocation = useLocation();
  useEffect(() => {
    setTab('home');
  }, [routerLocation.pathname]);
  // 整页刷新中：按钮转圈 + toast 反馈，稍作停顿再 reload（立即 reload 在缓存页下"无感知"）
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    notifications.show({ message: '正在刷新页面…', color: 'gray', autoClose: 1500 });
    setTimeout(() => window.location.reload(), 600);
  };
  // 调试模式（vConsole 虚拟控制台）：localStorage 记忆，dev 模式视为已开启
  const [debugOn, setDebugOn] = useState(() => isDebugMode() || import.meta.env.DEV);
  // AI 自动接戏全局开关：localStorage 记忆（'1' 默认开；'0' 关）。关掉后开戏/接戏弹窗
  // 默认不再勾选，弹窗内高级设置仍可单独开启
  const [aiAutoOn, setAiAutoOn] = useState(() => {
    try {
      return localStorage.getItem('zhuge-ai-auto') !== '0';
    } catch {
      return true;
    }
  });
  const handleAiAutoToggle = () => {
    const next = !aiAutoOn;
    setAiAutoOn(next);
    try {
      localStorage.setItem('zhuge-ai-auto', next ? '1' : '0');
    } catch {
      /* 忽略 */
    }
    pushSetting('aiAuto', next ? 1 : 0);
  };
  // 无障碍变通：Mantine Menu 内部装饰元素（autofocus 定位 div、Menu.Divider、Menu.arrow）
  // 在 role=menu 里会被 axe 判为缺少合法子项（aria-required-children）。
  // 只给"无 role 且不含可聚焦控件"的纯装饰节点补 aria-hidden；功能性宫格/开关组
  // （.menu-groups 内含 role=menuitem 的按钮、开关）绝不能 hidden——aria-hidden 容器
  // 里有可聚焦元素 = aria-hidden-focus（serious）。
  useEffect(() => {
    const FOCUSABLE =
      'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';
    const fix = () => {
      // Mantine Portal 容器（body 直属 div[data-portal]，承载 Menu/Modal/Tooltip）本身无
      // 语义、又在 <main> 之外 → axe region 误报。补 role=presentation：去掉容器自身语义，
      // 内容（role=dialog/menu/tooltip）保持暴露；dialog/menu 内容不受 region 规则约束。
      document.querySelectorAll('body > div[data-portal="true"]').forEach((el) => {
        if (!el.getAttribute('role')) el.setAttribute('role', 'presentation');
      });
      document.querySelectorAll('[role="menu"] > *').forEach((el) => {
        const role = el.getAttribute('role');
        if (
          role === 'menuitem' ||
          role === 'menuitemcheckbox' ||
          role === 'menuitemradio' ||
          role === 'presentation' ||
          role === 'none'
        ) {
          el.removeAttribute('aria-hidden');
          return;
        }
        if (el.matches(FOCUSABLE) || el.querySelector(FOCUSABLE)) {
          el.removeAttribute('aria-hidden');
          return;
        }
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

  // AI 自动接戏默认开关云同步（唯一云同步项）：显示模式/字号是设备偏好，只存本地。
  // 登录后拉取账号设置覆盖本地；云端空则把本地当前值推上云（首设备数据上云）。
  // PUT 按单键合并（/api/me/settings { key, value }）。游客/未登录静默。
  const pushSetting = (key: 'aiAuto', value: unknown) => {
    if (!user) return;
    void api('/me/settings', { method: 'PUT', body: { key, value } }).catch(() => {
      /* 同步失败静默：下次变更再试，本地优先 */
    });
  };
  const syncedUidRef = useRef<number | null>(null);
  useEffect(() => {
    if (!user || syncedUidRef.current === user.id) return;
    syncedUidRef.current = user.id;
    void (async () => {
      try {
        const r = await api<{ data: Partial<Record<'aiAuto', unknown>> }>('/me/settings');
        const s = r.data || {};
        if (s.aiAuto === 0 || s.aiAuto === 1) setAiAutoOn(s.aiAuto === 1);
        else pushSetting('aiAuto', aiAutoOn ? 1 : 0);
      } catch {
        /* 拉取失败：保留本地设置 */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // 显示模式：一行三选（浅色/深色/跟随系统 图标并排，当前项高亮）。
  // 不做三个菜单项分行——菜单里一行搞定，省纵向空间。setColorScheme 持久化同前。
  const schemeRow = (
    <div className="scheme-row" role="group" aria-label="显示模式">
      {(
        [
          { value: 'light', label: '浅色模式', icon: <IconSun size={16} /> },
          { value: 'dark', label: '深色模式', icon: <IconMoon size={16} /> },
          { value: 'auto', label: '跟随系统', icon: <IconDeviceDesktop size={16} /> },
        ] as const
      ).map((m) => (
        <button
          key={m.value}
          type="button"
          className={`scheme-cell${colorScheme === m.value ? ' active' : ''}`}
          title={m.label}
          aria-label={m.label}
          aria-pressed={colorScheme === m.value}
          onClick={() => setColorScheme(m.value)}
        >
          {m.icon}
        </button>
      ))}
    </div>
  );

  // 字号五档：一行五选（A 字大小区分档位，当前档高亮）——根元素 zoom 全局缩放（设备偏好，不同步云端）
  const fontRow = (
    <div className="scheme-row" role="group" aria-label="字号">
      {(
        [
          { value: 'xs', label: '极小字号', fs: 9 },
          { value: 'sm', label: '小字号', fs: 11 },
          { value: 'md', label: '标准字号', fs: 14 },
          { value: 'lg', label: '大字号', fs: 17 },
          { value: 'xl', label: '特大字号', fs: 20 },
        ] as const
      ).map((m) => (
        <button
          key={m.value}
          type="button"
          className={`scheme-cell${fontScale === m.value ? ' active' : ''}`}
          title={m.label}
          aria-label={m.label}
          aria-pressed={fontScale === m.value}
          onClick={() => setFontScale(m.value)}
        >
          <span style={{ fontSize: m.fs, fontWeight: 700, lineHeight: 1 }}>A</span>
        </button>
      ))}
    </div>
  );

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
      </nav>
      {/* 内容区：key=路径 → 路由切换时强制重建整个内容区（清掉旧页残留的 DOM，
          如主题页的帖子卡片在水合/协调后残留在主页顶部）。
          用 <main> 作为页面主地标，并带路由级视觉隐藏 h1（axe 地标/标题规则） */}
      <main className="container" key={location.pathname}>
        <h1 className="vh">{routeH1(location.pathname)}</h1>
        {children}
      </main>
      {/* ===== 底部 tab 面板：消息 ===== */}
      {tab === 'inbox' ? (
        <section className="tab-panel tab-panel-inbox" aria-label="消息">
          {user ? (
            <NotificationsModalContent onClose={() => setTab('home')} />
          ) : (
            <div className="tab-empty-hint">
              <p>登录后查看消息（接戏 / 滴滴 / 投币通知）</p>
              <button type="button" className="btn btn-primary" onClick={openLoginModal}>
                登录
              </button>
            </div>
          )}
        </section>
      ) : null}
      {/* ===== 底部 tab 面板：我的 ===== */}
      {tab === 'me' ? (
        <section className="tab-panel tab-panel-me" aria-label="我的">
          {user ? (
            <>
              <div className="me-head">
                <Avatar user={user} size="md" showGender />
                <div className="me-head-text">
                  <div className="me-username">{user.username}</div>
                  <div className="me-level">
                    🪙 {coinData?.balance ?? ''}
                    {coinData ? ` · ${levelLabel(coinData.level)}` : ''}
                  </div>
                </div>
              </div>
              <div className="me-section-title">快捷入口</div>
              <div className="menu-groups menu-grid" role="group">
                {[
                  { icon: <IconHeartHandshake size={20} />, label: '我的滴滴', onClick: () => navigate('/private') },
                  { icon: <IconFolder size={20} />, label: '我的主题', onClick: () => navigate('/my') },
                  { icon: <IconListCheck size={20} />, label: '今日任务', onClick: () => openCoinsModal() },
                  { icon: <IconStar size={20} />, label: '收藏夹', onClick: () => openFavoritesModal() },
                  { icon: <IconMasksTheater size={20} />, label: '皮', onClick: () => openCharactersModal() },
                  { icon: <IconAward size={20} />, label: '我的徽章', onClick: () => openBadgesModal(user.id) },
                  { icon: <IconUserPlus size={20} />, label: '邀请好友', onClick: () => openInviteModal(user.id, user.username) },
                  { icon: <IconKey size={20} />, label: '账号安全', onClick: () => openSecurityModal() },
                  { icon: <IconPhoto size={20} />, label: '上传头像', onClick: () => openAvatarModal() },
                  { icon: <IconUserCog size={20} />, label: '性别', onClick: () => openGenderModal() },
                  { icon: <IconHelpCircle size={20} />, label: '使用帮助', onClick: () => openHelpModal() },
                  { icon: <IconApi size={20} />, label: '开放 API', onClick: () => openApiTokensModal() },
                  { icon: <IconRobot size={20} />, label: 'MCP', onClick: () => openMcpModal() },
                  { icon: <IconBan size={20} />, label: '屏蔽管理', onClick: () => openBlocksModal() },
                  ...(user.isAdmin
                    ? [{ icon: <IconShield size={20} />, label: '管理', onClick: () => navigate('/admin') }]
                    : []),
                ].map((it) => (
                  <button
                    key={it.label}
                    type="button"
                    className="menu-grid-item"
                    onClick={() => {
                      setTab('home'); // 跳路由前收起面板，露出路由内容
                      it.onClick();
                    }}
                  >
                    {it.icon}
                    <span>{it.label}</span>
                  </button>
                ))}
              </div>
              <div className="me-section-title">偏好</div>
              <div className="me-section-block">{fontRow}{schemeRow}</div>
              <div className="me-section-title">快捷开关</div>
              <div className="toggle-row" role="group" aria-label="快捷开关">
                <button
                  type="button"
                  className={`toggle-cell${debugOn ? ' on' : ''}`}
                  aria-pressed={debugOn}
                  title={`调试模式（vConsole）：${debugOn ? '已开启' : '未开启'}`}
                  onClick={handleDebugToggle}
                >
                  <IconBug size={15} />
                  <span>调试</span>
                </button>
                <button
                  type="button"
                  className={`toggle-cell${push.state === 'subscribed' ? ' on' : ''}${push.busy ? ' busy' : ''}`}
                  aria-pressed={push.state === 'subscribed'}
                  disabled={push.busy}
                  title={
                    push.busy
                      ? '系统通知：处理中…'
                      : push.iosNeedsPwa
                        ? '系统通知：需先安装 PWA'
                        : push.state === 'denied'
                          ? '系统通知：已拒绝（需在浏览器设置中允许）'
                          : push.state === 'unsupported'
                            ? '系统通知：当前浏览器不支持'
                            : push.state === 'subscribed'
                              ? '系统通知：已开启'
                              : '系统通知：未开启'
                  }
                  onClick={handlePushToggle}
                >
                  {push.busy ? <Loader size={13} /> : <IconBellRinging size={15} />}
                  <span>通知</span>
                </button>
                <button
                  type="button"
                  className={`toggle-cell${aiAutoOn ? ' on' : ''}`}
                  aria-pressed={aiAutoOn}
                  title={`AI 自动接戏（开戏/接戏默认勾选）：${aiAutoOn ? '默认开启' : '默认关闭'}`}
                  onClick={handleAiAutoToggle}
                >
                  <span style={{ fontSize: 13, lineHeight: 1 }}>🤖</span>
                  <span>AI</span>
                </button>
              </div>
              {pwaButton ? <div className="me-section-block">{pwaButton}</div> : null}
              <button type="button" className="btn me-logout" onClick={handleLogout}>
                登出
              </button>
            </>
          ) : (
            <>
              <div className="me-head">
                <Avatar user={null} size="md" />
                <div className="me-head-text">
                  <div className="me-username">未登录</div>
                  <div className="me-level">登录后同步你的皮 / 主题 / 格币</div>
                </div>
              </div>
              <div className="me-auth-actions">
                <button type="button" className="btn btn-primary" onClick={openLoginModal}>
                  登录
                </button>
                <button type="button" className="btn btn-accent" onClick={openRegisterModal}>
                  注册新账号
                </button>
              </div>
              <div className="me-section-title">偏好</div>
              <div className="me-section-block">{fontRow}{schemeRow}</div>
              <div className="me-section-title">公开功能</div>
              <div className="me-link-list">
                <button
                  type="button"
                  className="me-link"
                  onClick={() => {
                    setTab('home');
                    navigate('/docs/api');
                  }}
                >
                  开放 API
                </button>
                <button
                  type="button"
                  className="me-link"
                  onClick={() => {
                    setTab('home');
                    navigate('/docs/mcp');
                  }}
                >
                  MCP
                </button>
                <button type="button" className="me-link" onClick={openHelpModal}>
                  使用帮助
                </button>
              </div>
              {pwaButton ? <div className="me-section-block">{pwaButton}</div> : null}
            </>
          )}
        </section>
      ) : null}
      {/* ===== 底部 tab 栏（首页 / 消息 / 我的） ===== */}
      <nav className="bottom-tabbar" aria-label="主导航">
        <button
          type="button"
          className={`tabbar-item${tab === 'home' ? ' active' : ''}`}
          onClick={() => {
            if (location.pathname !== '/' || location.search) navigate('/');
            setTab('home');
          }}
        >
          <IconHome size={22} strokeWidth={tab === 'home' ? 2.4 : 1.8} />
          <span>首页</span>
        </button>
        <button
          type="button"
          className={`tabbar-item${tab === 'inbox' ? ' active' : ''}`}
          onClick={() => setTab(tab === 'inbox' ? 'home' : 'inbox')}
          aria-label="消息"
        >
          <span className="tabbar-icon-wrap">
            <IconBell size={22} strokeWidth={tab === 'inbox' ? 2.4 : 1.8} />
            {unread > 0 ? <span className="tabbar-badge">{unread > 99 ? '99+' : unread}</span> : null}
          </span>
          <span>消息</span>
        </button>
        <button
          type="button"
          className={`tabbar-item${tab === 'me' ? ' active' : ''}`}
          onClick={() => setTab(tab === 'me' ? 'home' : 'me')}
          aria-label="我的"
        >
          <IconUserCircle size={22} strokeWidth={tab === 'me' ? 2.4 : 1.8} />
          <span>我的</span>
        </button>
      </nav>
    </>
  );
}
