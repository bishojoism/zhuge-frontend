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
  punycodeToUnicode,
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

  it('边界：59 秒→刚刚，60 秒→1 分钟前，59 分钟→59 分钟前，23 小时→23 小时前，6 天→6 天前', () => {
    const fmt = (msAgo: number) => new Date(NOW - msAgo).toISOString().replace('T', ' ').replace('.000Z', '');
    expect(timeAgo(fmt(59e3))).toBe('刚刚');
    expect(timeAgo(fmt(60e3))).toBe('1 分钟前');
    expect(timeAgo(fmt(59 * 60e3))).toBe('59 分钟前');
    expect(timeAgo(fmt(23 * 3600e3))).toBe('23 小时前');
    expect(timeAgo(fmt(6 * 86400e3))).toBe('6 天前');
  });

  it('未来时间（时钟偏差）→ 显示"刚刚"（diff 为负按刚刚处理）', () => {
    const fmt = (msAhead: number) => new Date(NOW + msAhead).toISOString().replace('T', ' ').replace('.000Z', '');
    expect(timeAgo(fmt(30e3))).toBe('刚刚');
  });

  it('无效日期字符串 → 截取前 10 位', () => {
    expect(timeAgo('not-a-date')).toBe('not-a-date'.slice(0, 10));
    expect(timeAgo('2026-13-99 99:99:99')).toBe('2026-13-99');
  });

  it('带毫秒的时间戳（完整 ISO 带时区）', () => {
    const ts = new Date(NOW - 5 * 60e3).toISOString(); // 2026-08-30T11:55:00.000Z（带 T 和 Z）
    expect(timeAgo(ts)).toBe('5 分钟前');
  });

  it('"YYYY-MM-DD HH:mm:ss"（无毫秒无时区）视为 UTC', () => {
    const ts = new Date(NOW - 5 * 60e3).toISOString().replace('T', ' ').replace('.000Z', '');
    expect(timeAgo(ts)).toBe('5 分钟前');
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

describe('punycodeToUnicode', () => {
  it('站内中文域名 xn-- → 中文', () => {
    expect(punycodeToUnicode('xn--cnqs3e5vdw9icjz2q1eaa.xyz')).toBe('清冷仙子哦齁齁齁.xyz');
  });

  it('带子域（master.）也转回中文', () => {
    expect(punycodeToUnicode('master.xn--cnqs3e5vdw9icjz2q1eaa.xyz')).toBe('master.清冷仙子哦齁齁齁.xyz');
  });

  it('普通域名原样返回', () => {
    expect(punycodeToUnicode('example.com')).toBe('example.com');
    expect(punycodeToUnicode('localhost')).toBe('localhost');
  });

  it('带端口保留', () => {
    expect(punycodeToUnicode('xn--cnqs3e5vdw9icjz2q1eaa.xyz:3000')).toBe('清冷仙子哦齁齁齁.xyz:3000');
  });

  it('已知 punycode 样例：bücher → xn--bcher-kva', () => {
    expect(punycodeToUnicode('xn--bcher-kva.de')).toBe('bücher.de');
  });

  it('多标签混合（一个 xn-- 一个普通）', () => {
    expect(punycodeToUnicode('www.xn--bcher-kva.example.com')).toBe('www.bücher.example.com');
  });

  it('非法 punycode 标签解码失败 → 原样返回（不抛错）', () => {
    // 无效的 punycode 载荷（含非法字符组合）
    expect(punycodeToUnicode('xn--!!!!!')).toBe('xn--!!!!!');
    expect(punycodeToUnicode('xn--')).toBe('xn--');
  });

  it('空字符串 / 仅端口 / 尾部点', () => {
    expect(punycodeToUnicode('')).toBe('');
    expect(punycodeToUnicode(':8080')).toBe(':8080');
    expect(punycodeToUnicode('xn--bcher-kva.de.')).toBe('bücher.de.');
  });

  it('带 IPv4 地址原样返回（非域名）', () => {
    expect(punycodeToUnicode('127.0.0.1')).toBe('127.0.0.1');
    expect(punycodeToUnicode('192.168.1.1:8080')).toBe('192.168.1.1:8080');
  });

  it('RFC 3492 官方样例全部正确解码（与库实现一致）', () => {
    // punycode 包标准测试向量
    expect(punycodeToUnicode('xn--0zwm56d')).toBe('测试');
    expect(punycodeToUnicode('xn--ihqwcrb4cv8a8dqg056pqjye')).toBe('他们为什么不说中文');
    expect(punycodeToUnicode('xn--mgbh0fb')).toBe('مثال');
    expect(punycodeToUnicode('xn--r8jz45g')).toBe('例え');
  });

  it('大小写混合的 xn-- 前缀也识别', () => {
    expect(punycodeToUnicode('XN--BCHER-KVA.de')).toBe('bücher.de');
  });
});
