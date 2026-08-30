// iOS 地址栏收起测试：非 iOS 直通、iOS 状态切换
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isIosUrlBarCollapsing, collapseIosUrlBar } from '../src/lib/iosUrlBar';

describe('collapseIosUrlBar', () => {
  const realUA = navigator.userAgent;
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(navigator, 'userAgent', { value: realUA, configurable: true });
    // 清理可能残留的计时器
    vi.clearAllTimers();
  });

  it('非 iOS 设备 → 立即回调，不进入 collapsing', () => {
    const onDone = vi.fn();
    collapseIosUrlBar(onDone);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(isIosUrlBarCollapsing()).toBe(false);
  });

  it('iOS + 地址栏已收起（visualViewport.offsetTop <= 0）→ 立即回调', () => {
    Object.defineProperty(navigator, 'userAgent', { value: 'iPhone', configurable: true });
    Object.defineProperty(window, 'visualViewport', { value: { offsetTop: 0 }, configurable: true });
    const onDone = vi.fn();
    collapseIosUrlBar(onDone);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('iOS + 地址栏未收起 → 进入 collapsing，450ms 后恢复并回调', () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'userAgent', { value: 'iPhone', configurable: true });
    Object.defineProperty(window, 'visualViewport', { value: { offsetTop: 60 }, configurable: true });
    const onDone = vi.fn();
    collapseIosUrlBar(onDone);
    expect(isIosUrlBarCollapsing()).toBe(true);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(450);
    expect(isIosUrlBarCollapsing()).toBe(false);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
