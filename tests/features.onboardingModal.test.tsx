// onboardingModal 测试：新手三步完成状态
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { OnboardingContent } from '../src/features/onboarding/onboardingModal';

// mock swr：按 key 返回数据
const swrMock = vi.hoisted(() => vi.fn());
vi.mock('swr', () => ({ default: swrMock }));
vi.mock('../src/api/hooks', () => ({ fetcher: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

function mockSwr(chars: unknown[], topics: unknown[], priv: unknown[]) {
  swrMock.mockImplementation((key: string) => {
    if (String(key).includes('characters')) return { data: { data: chars }, isLoading: false };
    if (String(key).includes('/me/discussions')) return { data: { data: topics }, isLoading: false };
    if (String(key).includes('/me/private')) return { data: { data: priv }, isLoading: false };
    return { data: null, isLoading: false };
  });
}

function renderContent() {
  return render(
    <MantineProvider>
      <OnboardingContent />
    </MantineProvider>
  );
}

describe('OnboardingContent', () => {
  beforeEach(() => swrMock.mockReset());

  it('全部未完成 → 显示 0/3 与三个"去完成"按钮', async () => {
    mockSwr([], [], []);
    renderContent();
    await waitFor(() => expect(screen.getByText(/0\/3/)).toBeInTheDocument());
    expect(screen.getByText('创建角色卡')).toBeInTheDocument();
    expect(screen.getByText('开一场戏')).toBeInTheDocument();
    expect(screen.getByText('滴滴私密对戏')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /去/ }).length).toBe(3);
  });

  it('已建角色卡 → 第一步显示"已完成"', async () => {
    mockSwr([{ id: 1, name: '角色' }], [], []);
    renderContent();
    await waitFor(() => expect(screen.getByText('创建角色卡')).toBeInTheDocument());
    expect(screen.getByText('已完成')).toBeInTheDocument();
    expect(screen.getByText(/1\/3/)).toBeInTheDocument();
  });

  it('全部完成 → 显示 3/3 且不再提示徽章', async () => {
    mockSwr([{ id: 1 }], [{ id: 2 }], [{ id: 3 }]);
    renderContent();
    await waitFor(() => expect(screen.getByText(/3\/3/)).toBeInTheDocument());
    expect(screen.getAllByText('已完成').length).toBe(3);
    expect(screen.queryByText(/首开新篇/)).toBeNull();
  });
});
