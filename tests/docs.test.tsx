// 文档页测试：开放 API 文档 / MCP 文档（静态渲染内容完整）
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import ApiDocsPage from '../src/features/api/ApiDocsPage';
import McpDocsPage from '../src/features/api/McpDocsPage';

function wrap(el: React.ReactNode) {
  return render(<MantineProvider>{el}</MantineProvider>);
}

describe('ApiDocsPage', () => {
  it('渲染标题 + 认证方式 + 关键端点', () => {
    wrap(<ApiDocsPage />);
    expect(screen.getByText(/《主格》开放 API 文档/)).toBeInTheDocument();
    expect(screen.getAllByText(/Bearer/).length).toBeGreaterThan(0);
    // 关键端点
    expect(screen.getAllByText(/\/api\/discussions/).length).toBeGreaterThan(0);
    expect(screen.getByText(/\/api\/zhuge\/didi/)).toBeInTheDocument();
    expect(screen.getAllByText(/\/api\/me\/api-tokens/).length).toBeGreaterThan(0);
    // 限流与错误码
    expect(screen.getAllByText(/限流/).length).toBeGreaterThan(0);
    expect(screen.getByText(/401/)).toBeInTheDocument();
  });
});

describe('McpDocsPage', () => {
  it('渲染 MCP 端点 + 工具清单 + 配置示例', () => {
    wrap(<McpDocsPage />);
    expect(screen.getByText(/《主格》MCP 文档/)).toBeInTheDocument();
    // jsdom hostname=localhost → 端点显示本地；断言以 /mcp 结尾的端点文本
    expect(screen.getAllByText(/\/mcp/).length).toBeGreaterThan(0);
    expect(screen.getByText('create_discussion')).toBeInTheDocument();
    expect(screen.getByText('didi')).toBeInTheDocument();
    expect(screen.getByText(/claude_desktop_config/)).toBeInTheDocument();
  });
});
