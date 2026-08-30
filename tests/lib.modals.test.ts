// 弹窗互斥逻辑测试：openModalOnce（防抖 / 关闭动画时序 / 键盘唤醒）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// mock @mantine/modals 与 modalFocus（测试互斥时序，不依赖真实实现）
// vi.hoisted：mock 工厂被提升到文件顶部，需先用 hoisted 初始化
const { openFn, closeAll, wake } = vi.hoisted(() => ({
  openFn: vi.fn(),
  closeAll: vi.fn(),
  wake: vi.fn(),
}));

vi.mock('@mantine/modals', () => ({
  modals: { open: openFn, closeAll: closeAll },
}));
vi.mock('../src/lib/modalFocus', () => ({
  wakeIosKeyboard: wake,
}));

describe('openModalOnce 互斥', () => {
  // openModalOnce 有模块级状态（lastOpen/pendingTimer），每次测试重置模块 + 时钟
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    openFn.mockClear();
    closeAll.mockClear();
    wake.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  const load = async () => (await import('../src/lib/modals')).openModalOnce;

  it('调用后：立即 closeAll，260ms 后再 open', async () => {
    const openModalOnce = await load();
    openModalOnce('m1', openFn);
    expect(closeAll).toHaveBeenCalledTimes(1);
    expect(openFn).not.toHaveBeenCalled(); // 延迟中
    vi.advanceTimersByTime(260);
    expect(openFn).toHaveBeenCalledTimes(1);
  });

  it('同 id 400ms 内重复调用被忽略', async () => {
    const openModalOnce = await load();
    openModalOnce('m1', openFn);
    openModalOnce('m1', openFn); // 立即重复 → 忽略
    vi.advanceTimersByTime(260);
    expect(openFn).toHaveBeenCalledTimes(1);
  });

  it('400ms 后可再次打开同 id', async () => {
    const openModalOnce = await load();
    openModalOnce('m1', openFn);
    vi.advanceTimersByTime(260);
    vi.advanceTimersByTime(200); // 总计 460ms > 400ms
    openModalOnce('m1', openFn);
    vi.advanceTimersByTime(260);
    expect(openFn).toHaveBeenCalledTimes(2);
  });

  it('快速切换不同 id：只保留最新意图（前一个延迟打开被取消）', async () => {
    const openModalOnce = await load();
    openModalOnce('a', openFn);
    vi.advanceTimersByTime(100);
    openModalOnce('b', openFn); // 取消 a 的延迟
    vi.advanceTimersByTime(260);
    expect(openFn).toHaveBeenCalledTimes(1); // 只开 b
    // 延迟期间再 closeAll 一次（等待窗口内清理）
    expect(closeAll).toHaveBeenCalledTimes(3); // a 一次 + b 一次 + 延迟后再一次
  });

  it('wakeKeyboard=true 时手势内同步唤醒键盘', async () => {
    const openModalOnce = await load();
    openModalOnce('m2', openFn, true);
    expect(wake).toHaveBeenCalledTimes(1);
    openModalOnce('m3', openFn, false);
    expect(wake).toHaveBeenCalledTimes(1); // 不新增
  });
});
