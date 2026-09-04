# 主格 前端（Vite + React + Mantine + SWR）

《主格》文字角色扮演（语C）平台的新版前端，基于 Vite + React 18 + TypeScript + Mantine 7 + SWR 重构，模块化组织，使用成熟库而非自造轮子。

## 技术栈

| 领域 | 选型 |
|---|---|
| 构建 | Vite 5 + TypeScript |
| UI | Mantine 7（@mantine/core / modals / notifications / form）+ @tabler/icons-react |
| 数据 | SWR（缓存/重验证/失效） |
| 路由 | react-router-dom 6 |
| 认证 | 密码登录/注册（PBKDF2 服务端） |

## 本地运行

```bash
npm install
npm run dev        # http://localhost:5173
```

本地开发时 `/api`（含 WebSocket `/api/ws`）由 Vite 代理到线上 Worker
（`https://master.xn--cnqs3e5vdw9icjz2q1eaa.xyz`），无需 CORS、cookie 正常。
如需换目标：`ZHUGE_API_TARGET=https://其它域名 npm run dev`。

## 构建

```bash
npm run build      # 产物在 dist/（纯静态 SPA，可交给 Worker Assets 托管）
npm run preview    # 本地预览构建产物
```

## 目录结构

```
src/
├── main.tsx               # 入口：MantineProvider + ModalsProvider + SWRConfig + Router
├── App.tsx                # 路由（/ 、/d/:id 、/private 、/admin）
├── theme.ts               # Mantine 主题（莫兰迪色板）
├── styles.css             # 全局样式（旧版设计语言全量移植）
├── api/
│   ├── client.ts          # fetch 封装（cookie、错误归一、SSR 初始数据读取）
│   └── hooks.ts           # SWR hooks（按领域组织）
├── lib/
│   ├── utils.ts           # timeAgo / 性别标记 / 图片上传等
│   ├── ws.ts              # 通知 WebSocket（指数退避重连 + 可见性处理）
│   └── drafts.ts          # 云草稿保存/清除
├── features/              # 功能模块（每模块自包含）
│   ├── auth/              # 认证弹窗（密码登录/注册、requireLogin）
│   ├── home/              # 首页（推荐 feed + 列表 + 标签条 + 发帖 + 草稿）
│   ├── topic/             # 主题详情（回复/滴滴/举报/管理/分享）
│   ├── notifications/     # 通知弹窗
│   ├── private/           # 我的滴滴（私密列表）
│   ├── security/          # 账号安全（改/设密码、游客转正）
│   ├── admin/             # 管理后台
│   ├── share/             # 生成精美海报（12 模板 canvas）
│   ├── profile/           # 头像上传 / 性别设置
└── components/
    └── Layout.tsx         # 导航 + 用户菜单 + 通知铃铛 + WS 接线
```

## 说明

- 服务端 API 契约不变（Cloudflare Worker），前端纯静态 SPA；
  未来可给 Worker 的 `index.html` 注入 `window.__INITIAL_DATA__` 恢复 SSR（占位注释已在 index.html）。
- 生产构建会注册 Service Worker（缓存版本 `zhuge-web-v1`）；本地 dev 不注册，避免缓存干扰。


## 开源许可

GNU General Public License v3.0（GPL-3.0），详见 [LICENSE](LICENSE)。

© 2025 bishojoism。《主格》文字角色扮演平台前端源码。本仓库仅含前端；平台后端与线上服务（API / 数据库 / 管理 / Worker）不在此仓库内。
