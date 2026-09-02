import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Center, Loader } from '@mantine/core';
import Layout from './components/Layout';

// 路由级代码分割：除首页外的页面独立 chunk，按需加载。
// 首页静态导入：默认路由必达，随入口依赖并行预加载，刷新不再二次请求该 chunk
import HomePage from './features/home/HomePage';
const TopicPage = lazy(() => import('./features/topic/TopicPage'));
const EmbedPage = lazy(() => import('./features/embed/EmbedPage'));
const PrivatePage = lazy(() => import('./features/private/PrivatePage'));
const MyTopicsPage = lazy(() => import('./features/my/MyTopicsPage'));
const AdminPage = lazy(() => import('./features/admin/AdminPage'));
const ApiDocsPage = lazy(() => import('./features/api/ApiDocsPage'));
const McpDocsPage = lazy(() => import('./features/api/McpDocsPage'));

// 路由懒加载兜底：chunk 在 400ms 内加载完成就直接渲染页面，不闪转圈；
// 超过 400ms（慢网络）才淡入显示加载指示，避免"一闪而逝"的进度条
function PageFallback() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), 400);
    return () => window.clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <div className="page-fallback-fade">
      <Center py="xl">
        <Loader size="md" />
      </Center>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* 嵌入版（iframe 极简页）：无 Layout（无导航栏），单独路由 */}
        <Route path="/embed/d/:id" element={<EmbedPage />} />
        {/* 其余页面包在 Layout（导航栏/通知/WS）里 */}
        <Route
          path="*"
          element={
            <Layout>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/tag/:tagId" element={<HomePage />} />
                <Route path="/d/:id" element={<TopicPage />} />
                <Route path="/private" element={<PrivatePage />} />
                <Route path="/my" element={<MyTopicsPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/docs/api" element={<ApiDocsPage />} />
                <Route path="/docs/mcp" element={<McpDocsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          }
        />
      </Routes>
    </Suspense>
  );
}
