// apiTokensModal 测试：创建（名称可留空）/ 明文默认隐藏 / 撤销
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { ApiTokensContent } from '../src/features/api/apiTokensModal';

const apiMock = vi.hoisted(() => vi.fn());
const notifShow = vi.hoisted(() => vi.fn());
vi.mock('../src/api/client', () => ({ api: apiMock }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: notifShow } }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

function renderContent() {
  return render(
    <MantineProvider>
      <ApiTokensContent />
    </MantineProvider>
  );
}

describe('ApiTokensContent', () => {
  beforeEach(() => {
    apiMock.mockReset();
    notifShow.mockReset();
    apiMock.mockImplementation((path: string, opts?: { method?: string }) => {
      if (!opts?.method) return Promise.resolve({ data: [] }); // 列表
      return Promise.resolve({ data: { id: 1, token: 'tok1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' } });
    });
  });

  it('渲染创建输入框（可留空占位）与令牌列表区', async () => {
    renderContent();
    await waitFor(() => expect(screen.getByText(/个人访问令牌/)).toBeInTheDocument());
    expect(screen.getByPlaceholderText('令牌名称（可留空）')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '生成' })).toBeInTheDocument();
  });

  it('空名称生成 → 调用后端（name 为空串）+ 新令牌区块默认掩码', async () => {
    const user = userEvent.setup();
    renderContent();
    await waitFor(() => expect(screen.getByRole('button', { name: '生成' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '生成' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/me/api-tokens', expect.objectContaining({ method: 'POST' })));
    // 新令牌区块出现且默认掩码（无 64 位 hex 明文）
    await waitFor(() => expect(screen.getByText(/新令牌已生成/)).toBeInTheDocument());
    expect(screen.getByText('••••••••••••••••••••••••••••••••••••••••••••••••••••••••')).toBeInTheDocument();
    expect(screen.queryByText(/tok1234567890abcdef/)).toBeNull();
  });

  it('点"显示"→ 明文可见；点"隐藏"→ 恢复掩码', async () => {
    const user = userEvent.setup();
    renderContent();
    await waitFor(() => expect(screen.getByRole('button', { name: '生成' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '生成' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /显示/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /显示/ }));
    expect(screen.getByText(/tok1234567890abcdef/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /隐藏/ }));
    expect(screen.getByText('••••••••••••••••••••••••••••••••••••••••••••••••••••••••')).toBeInTheDocument();
  });

  it('撤销令牌 → DELETE 调用', async () => {
    const user = userEvent.setup();
    // 列表含一个令牌
    apiMock.mockImplementation((path: string, opts?: { method?: string }) => {
      if (!opts?.method) return Promise.resolve({ data: [{ id: 7, name: '机器人', created_at: '2026-08-30 00:00:00', last_used_at: null }] });
      return Promise.resolve({ data: { id: 1, token: 'x' } });
    });
    renderContent();
    await waitFor(() => expect(screen.getByText('机器人')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/me/api-tokens/7', expect.objectContaining({ method: 'DELETE' })));
  });
});
