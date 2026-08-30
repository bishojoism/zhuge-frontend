// 测试 setup：jest-dom 匹配器 + 全局 polyfill
import '@testing-library/jest-dom';

// jsdom 没有 navigator.clipboard / isSecureContext —— 提供 stub
Object.defineProperty(globalThis.navigator, 'clipboard', {
  value: {
    writeText: vi.fn(async () => {}),
    readText: vi.fn(async () => ''),
  },
  configurable: true,
});
Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true });

// Mantine 需要 matchMedia（jsdom 缺失）
Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
  configurable: true,
});

// ResizeObserver（部分 Mantine 组件使用）
if (!('ResizeObserver' in window)) {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, 'ResizeObserver', { value: ResizeObserverMock, configurable: true });
}

// scrollTo（jsdom 未实现）
if (!window.scrollTo) {
  Object.defineProperty(window, 'scrollTo', { value: vi.fn(), configurable: true });
}
