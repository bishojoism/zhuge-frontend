import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { localStorageColorSchemeManager, MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { SWRConfig } from 'swr';
// Mantine 全量样式（标准版）。注意：不要用 styles.layer.css——Vite 直接打包 layer 版会丢失
// Mantine 组件样式（.mantine-Menu-item / .mantine-Modal 等），导致菜单项/弹窗边距空白失效
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { theme } from './theme';
import App from './App';
import { AuthProvider } from './features/auth/AuthContext';
import { readInitData } from './api/client';
import { lockZoom } from './lib/lockZoom';
import type { InitData } from './types';
import './styles.css';

// 深色/浅色模式持久化（localStorage，防刷新闪烁脚本在 index.html 里提前设置 data-mantine-color-scheme）
const colorSchemeManager = localStorageColorSchemeManager({ key: 'zhuge-color-scheme' });

// 阻止页面被捏合/双击/手势/桌面快捷键缩放（防止缩放破坏布局与滑动体验）
lockZoom();

// 禁用浏览器自动恢复滚动位置：推荐模式（feed）是"整页锁定 + 卡片定位"设计，
// 页面本身不应滚动；浏览器默认 scrollRestoration='auto' 会在返回导航时异步恢复旧滚动位置，
// 与 feed 的锁定冲突（recenterPage 挂载时已归零，但浏览器恢复发生在之后且可能不派发 scroll 事件）。
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// 邀请链接捕获：?invite=<uid>（来自"我的徽章"弹窗复制的链接）→ 存 localStorage，
// 注册弹窗提交时带上 invitedBy（邀请人与被邀请人各得邀请徽章）
try {
  const inviteParam = new URLSearchParams(window.location.search).get('invite');
  if (inviteParam && /^\d{1,10}$/.test(inviteParam)) {
    localStorage.setItem('zhuge-invite', inviteParam);
  }
} catch {
  /* 忽略 */
}

// 生产环境注册 Service Worker（本地开发不注册，避免缓存干扰）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// 虚拟控制台（真机调试）：dev 自动开 / ?vconsole=1 开 / 头像菜单"调试模式"开关记忆恢复。
// 用成熟库 vConsole（腾讯开源）：console/network/元素/存储面板，专为移动端设计。
import { maybeEnableVConsole } from './lib/vconsole';
void maybeEnableVConsole();

// 用 SSR 内联数据（window.__INITIAL_DATA__）种入 SWR 缓存 → 首屏零 API 请求
function buildSwrFallback(): Record<string, unknown> {
  const d = readInitData<InitData>();
  if (!d) return {};
  const fb: Record<string, unknown> = {};

  // 用户（useMe 的 fetcher 解析 r.data → User|null）
  // 注意：只有 SSR 明确解析出登录用户才种 fallback；user 为 null 时【不种】，
  // 否则会用"未登录"缓存覆盖真实登录态（浏览器有 cookie 但 SWR 命中 null 不重新请求，
  // 导致登录后通知弹窗仍提示"需要登录"）。
  if (d.user && typeof d.user === 'object') fb['/me'] = d.user;
  // 标签（useTags 解析 r.data → Tag[]）
  if (Array.isArray(d.tags)) fb['/tags'] = d.tags;
  // 草稿（useDrafts 解析 r.data → drafts）
  fb['/me/drafts'] = { data: d.drafts || {} };
  // 角色卡（发帖/接戏选角色即时可用）
  if (Array.isArray(d.characters)) fb['/me/characters'] = { data: d.characters };
  // 未读数 + 通知列表（useUnread/useNotifications 共用同一 key）：
  // SSR 内联首页 20 条（notifications）→ 弹窗打开即显示，不闪"还没有通知/加载中"；
  // 未登录（user 为 null）时不种 → 弹窗提示登录；未内联时退回空占位（后台重验证填充）
  if (d.user) {
    fb['/me/notifications'] = {
      data: d.notifications || [],
      meta: { unread: d.unread || 0, page: 1, hasMore: !!d.notifHasMore },
    };
  }

  // 讨论列表：key 与 useDiscussions 完全一致（排序/标签/种子都取自内联数据）
  if (Array.isArray(d.discussions)) {
    const urlParams = new URLSearchParams(window.location.search);
    const sort = urlParams.get('sort') === 'latest' || urlParams.get('sort') === 'hot' ? (urlParams.get('sort') as 'latest' | 'hot') : 'recommend';
    const qs = new URLSearchParams({ sort, page: '1' });
    // 标签：优先 query ?tag=，其次路径 /tag/:id
    const pathTag = (window.location.pathname.match(/^\/tag\/(\d+)/) || [])[1];
    const tag = urlParams.get('tag') || pathTag;
    if (tag) qs.set('tag', tag);
    if (sort === 'recommend') qs.set('seed', String(d.seed ?? 1));
    fb['/discussions?' + qs.toString()] = {
      data: d.discussions,
      meta: { hasMore: !!d.hasMore },
    };
  }

  // 主题详情页（useTopic 解析 r.data → topicData；SSR 内联 page=1&order=new）
  if (d.topicData) fb[`/discussions/${d.topicId}?page=1&order=new`] = d.topicData;
  // 首帖页（SSR 内联 asc page1，含 1 楼）：种入 order=old fallback →
  // useTopicPagination 的 headData（恒拉 order=old page1 补首帖）首帧即命中，不闪"无首帖卡片"
  if (d.topicHead) fb[`/discussions/${d.topicId}?page=1&order=old`] = d.topicHead;
  // 我的滴滴（usePrivateList 解析 r.data → privateList）
  if (Array.isArray(d.privateList)) fb['/me/private'] = d.privateList;
  // 我的主题（useMyDiscussions 解析 r.data → myDiscussions）
  if (Array.isArray(d.myDiscussions)) fb['/me/discussions'] = d.myDiscussions;

  return fb;
}

const swrFallback = buildSwrFallback();

// Provider 顺序说明：@mantine/modals 的弹窗内容渲染在 ModalsProvider 之下、
// 与 children 平级（portal 但上下文继承），因此 SWRConfig / BrowserRouter /
// AuthProvider 必须放在 ModalsProvider 外层，弹窗内才能用 SWR、useNavigate、useAuth。
// 注意：不用 React.StrictMode —— 它在生产环境也会双渲染组件（React 18+），
// 首屏 React 执行时间翻倍，拖慢加载；应用代码无需 StrictMode 的额外检查
ReactDOM.createRoot(document.getElementById('root')!).render(
  <MantineProvider theme={theme} colorSchemeManager={colorSchemeManager} defaultColorScheme="auto">
    <Notifications position="top-center" />
    <SWRConfig
      value={{
        // 首屏零 API：SSR 内联数据（fallback）命中后不重新验证（revalidateIfStale 默认 true
        // 会导致挂载时重复请求 /tags、/discussions 等 —— 首屏白费 4 个请求）
        revalidateIfStale: false,
        revalidateOnFocus: false,
        dedupingInterval: 1500,
        fallback: swrFallback,
      }}
    >
      <BrowserRouter>
        <AuthProvider>
          <ModalsProvider>
            <App />
          </ModalsProvider>
        </AuthProvider>
      </BrowserRouter>
    </SWRConfig>
  </MantineProvider>
);
