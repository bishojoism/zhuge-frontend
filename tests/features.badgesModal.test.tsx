// badgesModal 测试：徽章网格（已获得/未获得/获得时间）
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { BadgesContent } from '../src/features/badges/badgesModal';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../src/api/client', () => ({ api: apiMock }));

const BADGES = [
  { code: 'welcome', name: '初入主格', description: '注册加入主格', icon: '🌱', tier: 0, sort: 1 },
  { code: 'first_post', name: '首开新篇', description: '发布第一个公开主题', icon: '📜', tier: 0, sort: 2 },
  { code: 'didis_10', name: '私语大师', description: '累计滴滴 10 次', icon: '🔐', tier: 1, sort: 9 },
];

function renderContent() {
  return render(
    <MantineProvider>
      <BadgesContent userId={189} />
    </MantineProvider>
  );
}

describe('BadgesContent', () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue({
      data: { badges: BADGES, earned: [{ code: 'welcome', earned_at: '2026-08-30 09:00:00' }], inviteCount: 0 },
    });
  });

  it('渲染邀请卡 + 全部徽章', async () => {
    renderContent();
    await waitFor(() => expect(screen.getByText('初入主格')).toBeInTheDocument());
    expect(screen.getByText('首开新篇')).toBeInTheDocument();
    expect(screen.getByText('私语大师')).toBeInTheDocument();
    expect(screen.getByText(/邀请好友/)).toBeInTheDocument();
  });

  it('已获得徽章显示含义 + 获得时间', async () => {
    renderContent();
    await waitFor(() => expect(screen.getByText('初入主格')).toBeInTheDocument());
    expect(screen.getByText(/注册加入主格/)).toBeInTheDocument();
    expect(screen.getByText(/2026-08-30 获得/)).toBeInTheDocument();
  });

  it('未获得徽章只显示达成条件（无获得时间）', async () => {
    renderContent();
    await waitFor(() => expect(screen.getByText('首开新篇')).toBeInTheDocument());
    expect(screen.getByText('发布第一个公开主题')).toBeInTheDocument();
    expect(screen.queryByText(/首开新篇.*获得/)).toBeNull();
  });

  it('加载失败显示错误', async () => {
    apiMock.mockRejectedValueOnce(new Error('x'));
    renderContent();
    await waitFor(() => expect(screen.getByText('加载失败')).toBeInTheDocument());
  });
});
