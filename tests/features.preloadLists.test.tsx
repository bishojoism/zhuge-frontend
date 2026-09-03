// preloadAllPrimaryLists 测试：预加载"首页全部 × 三种排序 + 所有主标签 × 三种排序"，填充 SWR 缓存
// 当前实现语义（见 src/api/hooks.ts）：
//  - 首页默认"全部"（无 tag）的 recommend/latest/hot 也要预加载 → 无论标签列表如何都会发 3 个请求
//  - 主标签（position 非空且未隐藏）各 × 3 排序；recommend 带当前分钟 seed
//  - 次标签不预加载
//  - 模块级分钟去重/已加载 key 去重 → 测试用 vi.resetModules 隔离，避免跨用例状态干扰
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Tag } from '../src/types';

describe('preloadAllPrimaryLists（主标签 × 三种排序 + 首页全部预加载）', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('预取"全部 × 3 排序" + 每个主标签 × 3 排序；次标签不请求', async () => {
    const { preloadAllPrimaryLists } = await import('../src/api/hooks');    const tags: Tag[] = [
      { id: 1, name: '公告栏', position: 0, is_hidden: 0, color: '#111', slug: null, description: null, is_restricted: 1, discussion_count: 0, icon: null },
      { id: 2, name: '讨论区', position: 1, is_hidden: 0, color: '#222', slug: null, description: null, is_restricted: 0, discussion_count: 0, icon: null },
      { id: 3, name: 'OC', position: 2, is_hidden: 0, color: '#333', slug: null, description: null, is_restricted: 0, discussion_count: 0, icon: null },
      { id: 99, name: '次标签', position: null, is_hidden: 0, color: '#444', slug: null, description: null, is_restricted: 0, discussion_count: 0, icon: null },
    ];

    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      calls.push(u.replace('/api', ''));
      return new Response(JSON.stringify({ data: [{ id: 1 }], meta: { hasMore: false } }), { status: 200 });
    }) as never;

    preloadAllPrimaryLists(tags);
    // 首批发 1.5s 后开始，每批间隔 300ms：3(全部) + 9(主标签) = 12 个 key
    await new Promise((r) => setTimeout(r, 1500 + 12 * 300 + 800));

    // 12 = 全部 × 3 排序 + 3 个主标签 × 3 排序；次标签 99 不请求
    expect(calls.length).toBe(12);
    // 首页"全部"（无 tag 参数）：三种排序都在
    for (const sort of ['recommend', 'latest', 'hot']) {
      expect(calls.some((c) => c.includes(`sort=${sort}`) && !c.includes('tag='))).toBe(true);
    }
    // 每个主标签三种排序都在
    for (const tid of [1, 2, 3]) {
      expect(calls.some((c) => c.includes(`sort=recommend`) && c.includes(`tag=${tid}`))).toBe(true);
      expect(calls.some((c) => c.includes(`sort=latest`) && c.includes(`tag=${tid}`))).toBe(true);
      expect(calls.some((c) => c.includes(`sort=hot`) && c.includes(`tag=${tid}`))).toBe(true);
    }
    // recommend 共 4 个（全部 + 3 主标签），都带 seed
    const recCalls = calls.filter((c) => c.includes('sort=recommend'));
    expect(recCalls.length).toBe(4);
    for (const c of recCalls) {
      expect(c).toMatch(/seed=\d+/);
    }
    // 次标签未请求
    expect(calls.some((c) => c.includes('tag=99'))).toBe(false);
  }, 20000);

  it('空标签列表 → 仍预取首页"全部"的 3 种排序（不依赖标签数据）', async () => {
    const { preloadAllPrimaryLists } = await import('../src/api/hooks');
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      calls.push(u.replace('/api', ''));
      return new Response(JSON.stringify({ data: [], meta: { hasMore: false } }), { status: 200 });
    }) as never;

    preloadAllPrimaryLists([]);
    await new Promise((r) => setTimeout(r, 1500 + 3 * 300 + 500));

    expect(calls.length).toBe(3);
    for (const sort of ['recommend', 'latest', 'hot']) {
      expect(calls.some((c) => c.includes(`sort=${sort}`) && !c.includes('tag='))).toBe(true);
    }
  }, 20000);
});
