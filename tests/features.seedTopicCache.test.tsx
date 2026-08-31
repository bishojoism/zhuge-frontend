// seedTopicCacheFromList 测试：列表数据 → 乐观详情缓存种入（详情页首帧直接渲染用）
import { describe, it, expect } from 'vitest';
import useSWR from 'swr';
import { renderHook, act, waitFor } from '@testing-library/react';
import { seedTopicCacheFromList } from '../src/features/home/composer';
import type { Discussion, DiscussionDetail } from '../src/types';

describe('seedTopicCacheFromList（列表 → 详情乐观缓存）', () => {
  it('种入乐观详情：discussion 完整 + 首帖用摘要填充 + 负 id 标记', async () => {
    const d: Discussion = {
      id: 123,
      title: '测试主题',
      comment_count: 5,
      created_at: '2026-08-30 12:00:00',
      user_id: 30,
      first_post_id: null,
      last_posted_at: '2026-08-30 13:00:00',
      last_posted_user_id: 30,
      slug: null,
      is_private: 0,
      is_sticky: 0,
      is_locked: 0,
      didi_count: 2,
      hot_score: 5,
      author: '胖胖胖',
      author_avatar: '/img/u/30/a.png',
      author_gender: 'male',
      excerpt: '这是摘要内容…',
      image_url: '/img/u/30/b.png',
      tags: '讨论区',
      author_badges: '🌱:0',
    };

    // 先种入乐观数据
    act(() => {
      seedTopicCacheFromList(d);
    });

    // 用 useSWR 读同 key：应命中乐观缓存（无网络请求，data 立即为乐观值）
    const { result } = renderHook(() => useSWR<DiscussionDetail>('/discussions/123', () => {
      throw new Error('不应发起网络请求（乐观缓存命中）');
    }, { revalidateIfStale: false, revalidateOnFocus: false, dedupingInterval: 0 }));

    await waitFor(() => {
      expect(result.current.data).toBeTruthy();
    });

    const optimistic = result.current.data!;
    expect(optimistic.discussion.id).toBe(123);
    expect(optimistic.discussion.title).toBe('测试主题');
    expect(optimistic.discussion.author).toBe('胖胖胖');
    expect(optimistic.discussion.comment_count).toBe(5);
    // 首帖：负 id + 摘要填充内容
    expect(optimistic.posts.length).toBe(1);
    expect(optimistic.posts[0].id).toBeLessThan(0);
    expect(optimistic.posts[0].content).toBe('这是摘要内容…');
    expect(optimistic.posts[0].author).toBe('胖胖胖');
    expect(optimistic.posts[0].image_url).toBe('/img/u/30/b.png');
  });

  it('字段缺失时用默认值兜底（我的主题/私密列表等瘦条目）', async () => {
    const slim = { id: 456, title: '瘦条目', comment_count: 3 } as Partial<Discussion> & { id: number; title: string };

    act(() => {
      seedTopicCacheFromList(slim);
    });

    const { result } = renderHook(() => useSWR<DiscussionDetail>('/discussions/456', () => {
      throw new Error('不应发起网络请求');
    }, { revalidateIfStale: false, revalidateOnFocus: false, dedupingInterval: 0 }));

    await waitFor(() => {
      expect(result.current.data).toBeTruthy();
    });

    const optimistic = result.current.data!;
    expect(optimistic.discussion.id).toBe(456);
    expect(optimistic.discussion.comment_count).toBe(3);
    // 缺 excerpt → 首帖 content 用标题
    expect(optimistic.posts[0].content).toBe('瘦条目');
    // 缺 created_at → 用当前时间
    expect(optimistic.discussion.created_at).toBeTruthy();
  });
});
