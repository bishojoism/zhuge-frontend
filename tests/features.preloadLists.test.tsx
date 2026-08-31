// preloadAllPrimaryLists 测试：预加载所有主标签 × 三种排序，填充 SWR 缓存
import { describe, it, expect, vi, afterEach } from 'vitest';
import useSWR from 'swr';
import { renderHook, act, waitFor } from '@testing-library/react';
import { preloadAllPrimaryLists } from '../src/api/hooks';
import type { Tag } from '../src/types';

describe('preloadAllPrimaryLists（主标签 × 三种排序预加载）', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('为每个主标签 × recommend/latest/hot 发起预取请求（跳过次标签）', async () => {
    const tags: Tag[] = [
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

    act(() => {
      preloadAllPrimaryLists(tags);
    });
    // 等待所有定时器（1.5s 起 + 每批 300ms × 9 个 key）
    await new Promise((r) => setTimeout(r, 1500 + 9 * 300 + 500));

    // 3 个主标签 × 3 排序 = 9 个请求；次标签 99 不请求
    expect(calls.length).toBe(9);
    // 每个主标签三种排序都在
    for (const tid of [1, 2, 3]) {
      expect(calls.some((c) => c.includes(`sort=recommend`))).toBe(true);
      expect(calls.some((c) => c.includes(`sort=latest`) && c.includes(`tag=${tid}`))).toBe(true);
      expect(calls.some((c) => c.includes(`sort=hot`) && c.includes(`tag=${tid}`))).toBe(true);
    }
    // recommend 带 seed
    const recCalls = calls.filter((c) => c.includes('sort=recommend'));
    expect(recCalls.length).toBe(3);
    for (const c of recCalls) {
      expect(c).toMatch(/seed=\d+/);
    }
    // 次标签未请求
    expect(calls.some((c) => c.includes('tag=99'))).toBe(false);
  });

  it('空标签列表 → 不发起请求', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as never;
    act(() => {
      preloadAllPrimaryLists([]);
    });
    await new Promise((r) => setTimeout(r, 200));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
