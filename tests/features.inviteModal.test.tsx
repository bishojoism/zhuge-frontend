// inviteModal 测试：邀请链接/群宣文案/邀请明细/空态
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { InviteContent } from '../src/features/badges/inviteModal';

const apiMock = vi.hoisted(() => vi.fn());
const notifShow = vi.hoisted(() => vi.fn());
const closeAll = vi.hoisted(() => vi.fn());

vi.mock('../src/api/client', () => ({ api: apiMock }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: notifShow } }));
vi.mock('@mantine/modals', () => ({ modals: { closeAll } }));
// posterModal 动态 import：mock 成空
vi.mock('../src/features/badges/posterModal', () => ({ openInvitePosterModal: vi.fn() }));

function renderContent() {
  return render(
    <MantineProvider>
      <InviteContent userId={189} username="promodemo" />
    </MantineProvider>
  );
}

describe('InviteContent', () => {
  beforeEach(() => {
    apiMock.mockReset();
    notifShow.mockReset();
    closeAll.mockReset();
    // 默认返回：无邀请、无被邀请人
    apiMock.mockImplementation((path: string) => {
      if (path === '/me/badges') return Promise.resolve({ data: { badges: [], earned: [], inviteCount: 0 } });
      if (path === '/me/invites') return Promise.resolve({ data: [] });
      return Promise.resolve({});
    });
  });

  it('渲染邀请链接（含 userId）与邀请统计', async () => {
    renderContent();
    await waitFor(() => expect(screen.getByText(/我的邀请链接/)).toBeInTheDocument());
    expect(screen.getByText(/\/\?invite=189/)).toBeInTheDocument();
    expect(screen.getByText(/已邀请 0 位/)).toBeInTheDocument();
  });

  it('无被邀请人 → 显示空态提示', async () => {
    renderContent();
    await waitFor(() => expect(screen.getByText(/还没有好友通过你的链接注册/)).toBeInTheDocument());
  });

  it('有被邀请人 → 列表显示用户名与日期', async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === '/me/badges') return Promise.resolve({ data: { badges: [], earned: [], inviteCount: 2 } });
      if (path === '/me/invites') return Promise.resolve({ data: [{ id: 1, username: '新朋友', created_at: '2026-08-30 10:00:00' }] });
      return Promise.resolve({});
    });
    renderContent();
    await waitFor(() => expect(screen.getByText('新朋友')).toBeInTheDocument());
    expect(screen.getByText('2026-08-30')).toBeInTheDocument();
  });

  it('复制群宣文案 → 剪贴板写入（含邀请链接）', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderContent();
    await waitFor(() => expect(screen.getByRole('button', { name: /复制群宣文案/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /复制群宣文案/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain('主格');
    expect(text).toContain('?invite=189');
    expect(text).toContain('滴滴');
  });
});
