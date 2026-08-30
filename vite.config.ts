import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 本地开发：所有 /api（含 WebSocket）代理到线上 Worker，同源访问无 CORS 问题
const API_TARGET = process.env.ZHUGE_API_TARGET || 'https://master.xn--cnqs3e5vdw9icjz2q1eaa.xyz';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 监听 0.0.0.0：同一 WiFi 下 iOS/Android 真机可通过 http://<电脑局域网IP>:5173 访问调试
    port: 5173,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        ws: true, // /api/ws WebSocket 升级
        configure: (proxy) => {
          // 本地开发标记：后端据此生成 rp.id=localhost 并放宽 origin，
          // 浏览器才能弹通行密钥（线上请求不会有此头，行为不变）
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('x-zhuge-local', '1');
          });
        },
      },
      // 图片（头像/帖子配图）：R2 存储，路径形如 /img/...，代理到线上 Worker
      '/img': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // vendor 分包：按库分组，便于长缓存，主包只留应用代码
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'mantine-core': ['@mantine/core', '@mantine/hooks'],
          'mantine-extras': ['@mantine/modals', '@mantine/notifications', '@mantine/form'],
          swr: ['swr'],
          webauthn: ['@simplewebauthn/browser'],
          icons: ['@tabler/icons-react'],
        },
      },
    },
  },
});