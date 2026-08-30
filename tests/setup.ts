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

// Image mock：jsdom 不加载图片，onload 永不触发。
// uploadImageFile 的压缩步骤会等 onload/超时 —— mock 成同步 onload，
// 避免每个上传测试白白等 2s 超时（naturalWidth=0 时压缩逻辑直接跳过）。
class ImageMock {
  naturalWidth = 0;
  naturalHeight = 0;
  set src(_v: string) {
    // 模拟解码成功（naturalWidth=0 → compressImageDataUrl 视为无需压缩，走原图）
    if (this.onload) queueMicrotask(() => this.onload(new Event('load')));
  }
  onload: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
}
Object.defineProperty(globalThis, 'Image', { value: ImageMock, configurable: true });
