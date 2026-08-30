// tagRequestModal 测试：表单渲染 / 空名校验 / 提交 / 错误提示
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { TagRequestContent } from '../src/features/home/tagRequestModal';

const apiMock = vi.hoisted(() => vi.fn());
const notifShow = vi.hoisted(() => vi.fn());
const closeAll = vi.hoisted(() => vi.fn());

vi.mock('../src/api/client', () => ({ api: apiMock }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: notifShow } }));
vi.mock('@mantine/modals', () => ({ modals: { closeAll } }));

function renderContent() {
  return render(
    <MantineProvider>
      <TagRequestContent />
    </MantineProvider>
  );
}

describe('TagRequestContent', () => {
  beforeEach(() => {
    apiMock.mockReset();
    notifShow.mockReset();
    closeAll.mockReset();
  });

  it('渲染表单：标签名/说明/提交/取消', () => {
    renderContent();
    expect(screen.getByLabelText('标签名')).toBeInTheDocument();
    expect(screen.getByLabelText('说明用途（可选）')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交申请' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
  });

  it('空名提交 → 提示至少 2 个字，不调用 api', async () => {
    const user = userEvent.setup();
    renderContent();
    await user.click(screen.getByRole('button', { name: '提交申请' }));
    expect(notifShow).toHaveBeenCalledWith(expect.objectContaining({ message: '标签名至少 2 个字', color: 'red' }));
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('有效提交 → 调用 POST /tag-requests（含 name/reason）+ 成功提示 + 关闭弹窗', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce({});
    renderContent();
    await user.type(screen.getByLabelText('标签名'), '哈利波特');
    await user.type(screen.getByLabelText('说明用途（可选）'), '想开 HP 专场');
    await user.click(screen.getByRole('button', { name: '提交申请' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1));
    expect(apiMock).toHaveBeenCalledWith('/tag-requests', {
      method: 'POST',
      body: { name: '哈利波特', reason: '想开 HP 专场' },
    });
    expect(notifShow).toHaveBeenCalledWith(expect.objectContaining({ message: '申请已提交，等待管理员审核', color: 'green' }));
    expect(closeAll).toHaveBeenCalled();
  });

  it('api 失败 → 错误提示，不关闭', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(new Error('标签「x」已存在'));
    renderContent();
    await user.type(screen.getByLabelText('标签名'), '重复标签');
    await user.click(screen.getByRole('button', { name: '提交申请' }));
    await waitFor(() => expect(notifShow).toHaveBeenCalled());
    expect(notifShow).toHaveBeenCalledWith(expect.objectContaining({ message: '标签「x」已存在', color: 'red' }));
    expect(closeAll).not.toHaveBeenCalled();
  });
});
