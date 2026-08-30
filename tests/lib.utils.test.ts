// 工具函数测试：utils.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  timeAgo,
  genderMark,
  displayName,
  avatarUrlOf,
  initials,
  tagColorOf,
  tagTextColorOf,
  uploadImageFile,
  copyText,
} from '../src/lib/utils';

describe('timeAgo', () => {
  const NOW = Date.UTC(2026, 7, 30, 12, 0, 0);
  beforeEach(() => vi.setSystemTime(NOW));
  afterEach(() => vi.useRealTimers());
  beforeEach(() => vi.useFakeTimers());

  it('空值返回空串', () => {
    expect(timeAgo(null)).toBe('');
    expect(timeAgo(undefined)).toBe('');
  });

  it('1 分钟内 → 刚刚', () => {
    const ts = new Date(NOW - 30e3).toISOString().replace('T', ' ').replace('.000Z', '');
    expect(timeAgo(ts)).toBe('刚刚');
  });

  it('N 分钟前 / N 小时前 / N 天前', () => {
    const fmt = (msAgo: number) => new Date(NOW - msAgo).toISOString().replace('T', ' ').replace('.000Z', '');
    expect(timeAgo(fmt(5 * 60e3))).toBe('5 分钟前');
    expect(timeAgo(fmt(3 * 3600e3))).toBe('3 小时前');
    expect(timeAgo(fmt(2 * 86400e3))).toBe('2 天前');
  });

  it('超过 7 天 → 返回日期', () => {
    const ts = new Date(NOW - 10 * 86400e3).toISOString().replace('T', ' ').replace('.000Z', '');
    expect(timeAgo(ts)).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});

describe('genderMark', () => {
  it('男/女/其他 → 符号；保密/空 → 空串', () => {
    expect(genderMark('male')).toBe('♂');
    expect(genderMark('female')).toBe('♀');
    expect(genderMark('other')).toBe('⚧');
    expect(genderMark('secret')).toBe('');
    expect(genderMark(null)).toBe('');
    expect(genderMark('')).toBe('');
  });
});

describe('displayName / avatarUrlOf / initials', () => {
  it('优先 author，其次 username/name，空 → ?', () => {
    expect(displayName({ author: '角色A', username: 'u' })).toBe('角色A');
    expect(displayName({ username: 'u' })).toBe('u');
    expect(displayName({ name: 'n' })).toBe('n');
    expect(displayName(null)).toBe('?');
    expect(displayName({})).toBe('?');
  });

  it('avatarUrlOf 优先 avatar_url，其次 author_avatar', () => {
    expect(avatarUrlOf({ avatar_url: '/a.png', author_avatar: '/b.png' })).toBe('/a.png');
    expect(avatarUrlOf({ author_avatar: '/b.png' })).toBe('/b.png');
    expect(avatarUrlOf(null)).toBeNull();
  });

  it('initials 取首字符大写', () => {
    expect(initials('abc')).toBe('A');
    expect(initials('')).toBe('?');
    expect(initials('主格')).toBe('主');
  });
});

describe('标签颜色', () => {
  it('tagColorOf 命中返回颜色，未命中默认', () => {
    const tags = [{ name: '原神', color: '#123456' }];
    expect(tagColorOf(tags, '原神')).toBe('#123456');
    expect(tagColorOf(tags, '不存在')).toBe('#4D698E');
  });

  it('tagTextColorOf 按亮度选黑白（对比度 ≥4.5:1）', () => {
    expect(tagTextColorOf('#FFFFFF')).toBe('#000000'); // 亮底深字
    expect(tagTextColorOf('#000000')).toBe('#ffffff'); // 暗底白字
    expect(tagTextColorOf('#4D698E')).toBe('#ffffff'); // 中灰 → 白字
    expect(tagTextColorOf('bad')).toBe('#fff'); // 非法 → 白字
  });
});

describe('uploadImageFile', () => {
  it('>5MB 抛错', async () => {
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    await expect(uploadImageFile(big)).rejects.toThrow('5MB');
  });

  it('成功上传返回 url', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ url: '/img/u/1/x.png' }), { status: 201 })) as never;
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    // FileReader 在 jsdom 可用
    const url = await uploadImageFile(file);
    expect(url).toBe('/img/u/1/x.png');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/upload', expect.objectContaining({ method: 'POST' }));
  });

  it('上传失败抛后端错误', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: '图片格式不支持' }), { status: 400 })) as never;
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    await expect(uploadImageFile(file)).rejects.toThrow('图片格式不支持');
  });
});

describe('copyText', () => {
  it('clipboard 可用时写入', async () => {
    const write = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    const ok = await copyText('hi');
    expect(ok).toBe(true);
    expect(write).toHaveBeenCalledWith('hi');
  });
});
