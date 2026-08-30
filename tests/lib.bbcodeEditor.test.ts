// ===== BBCodeEditor：insertBBCode 纯函数测试 =====
import { describe, expect, it } from 'vitest';
import { insertBBCode } from '../src/components/BBCodeEditor';

describe('insertBBCode', () => {
  it('无选区：插入成对标签，光标置于中间', () => {
    const r = insertBBCode('hello', 2, 2, '[b]', '[/b]');
    expect(r.text).toBe('he[b][/b]llo');
    expect(r.start).toBe(5);
    expect(r.end).toBe(5);
  });

  it('有选区：包裹选中文本', () => {
    const r = insertBBCode('hello world', 6, 11, '[b]', '[/b]');
    expect(r.text).toBe('hello [b]world[/b]');
    expect(r.start).toBe(9);
    expect(r.end).toBe(14);
  });

  it('选区倒序（end < start）也能正确包裹', () => {
    const r = insertBBCode('hello world', 11, 6, '[i]', '[/i]');
    expect(r.text).toBe('hello [i]world[/i]');
  });

  it('颜色标签：包裹选中文本', () => {
    const r = insertBBCode('red text', 0, 8, '[color=red]', '[/color]');
    expect(r.text).toBe('[color=red]red text[/color]');
    expect(r.start).toBe(11);
    expect(r.end).toBe(19);
  });

  it('大字/小字标签：包裹选中文本', () => {
    const big = insertBBCode('大字内容', 0, 4, '[big]', '[/big]');
    expect(big.text).toBe('[big]大字内容[/big]');
    const small = insertBBCode('小字内容', 0, 4, '[small]', '[/small]');
    expect(small.text).toBe('[small]小字内容[/small]');
  });

  it('文本开头/结尾边界', () => {
    expect(insertBBCode('abc', 0, 0, '[u]', '[/u]').text).toBe('[u][/u]abc');
    expect(insertBBCode('abc', 3, 3, '[u]', '[/u]').text).toBe('abc[u][/u]');
  });

  it('多字节中文选区按码点处理', () => {
    const r = insertBBCode('你好世界', 2, 4, '[b]', '[/b]');
    expect(r.text).toBe('你好[b]世界[/b]');
  });
});
