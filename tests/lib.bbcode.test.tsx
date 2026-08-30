// bbcode 测试：解析 / 剥离 / 颜色白名单 / 禁用外链
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { hasBBCode, isSafeColor, parseBBCode, stripBBCode } from '../src/lib/bbcode';

function wrap(node: React.ReactNode) {
  return render(<MantineProvider>{node}</MantineProvider>);
}

describe('hasBBCode', () => {
  it('识别白名单标签', () => {
    expect(hasBBCode('[b]x[/b]')).toBe(true);
    expect(hasBBCode('[color=red]x[/color]')).toBe(true);
    expect(hasBBCode('普通文本')).toBe(false);
  });
});

describe('isSafeColor', () => {
  it('颜色名与 hex 通过，非法拒绝', () => {
    expect(isSafeColor('red')).toBe(true);
    expect(isSafeColor('#ff0000')).toBe(true);
    expect(isSafeColor('#f00')).toBe(true);
    expect(isSafeColor('expression')).toBe(false);
    expect(isSafeColor('url(javascript:1)')).toBe(false);
    expect(isSafeColor('red;background:url(x)')).toBe(false);
    expect(isSafeColor('')).toBe(false);
  });
});

describe('parseBBCode（安全渲染）', () => {
  it('粗体/斜体/下划线/删除线渲染', () => {
    wrap(parseBBCode('[b]粗[/b] [i]斜[/i] [u]下[/u] [s]删[/s]'));
    expect(screen.getByText('粗').tagName).toBe('B');
    expect(screen.getByText('斜').tagName).toBe('I');
    expect(screen.getByText('下').tagName).toBe('U');
    expect(screen.getByText('删').tagName).toBe('S');
  });

  it('颜色渲染为 span with color', () => {
    const { container } = render(parseBBCode('[color=red]红字[/color]'));
    const span = container.querySelector('span');
    expect(span).toBeTruthy();
    expect(span!.style.color).toBe('red');
  });

  it('非法颜色值 → 不设置颜色（防 CSS 注入）', () => {
    const { container } = render(parseBBCode('[color=red;background:url(x)]x[/color]'));
    const span = container.querySelector('span');
    expect(span!.style.color).toBe('');
  });

  it('嵌套标签', () => {
    wrap(parseBBCode('[b]外[i]内[/i][/b]'));
    const inner = screen.getByText('内');
    expect(inner.tagName).toBe('I');
    expect(inner.parentElement!.tagName).toBe('B');
  });

  it('禁用外链标签不解析（原文显示）', () => {
    wrap(parseBBCode('看 [url]https://evil.com[/url] 和 [img]x.png[/img]'));
    expect(screen.getByText(/\[url\]/)).toBeInTheDocument();
    expect(screen.getByText(/\[img\]/)).toBeInTheDocument();
    // 不生成任何 <a> 或 <img>
    expect(document.querySelector('a')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
  });

  it('未闭合标签按原文显示', () => {
    wrap(parseBBCode('[b]未闭合'));
    expect(screen.getByText(/\[b\]/)).toBeInTheDocument();
  });

  it('纯文本不转义破坏（React 自动转义）', () => {
    wrap(parseBBCode('<script>alert(1)</script>'));
    expect(screen.getByText(/<script>/)).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });
});

describe('stripBBCode', () => {
  it('剥离标签留内容', () => {
    expect(stripBBCode('[b]粗[/b] 和 [color=red]红[/color]')).toBe('粗 和 红');
  });
  it('无标签原样', () => {
    expect(stripBBCode('普通文本')).toBe('普通文本');
  });
  it('未知/外链标签也剥离', () => {
    expect(stripBBCode('[url]https://e.com[/url] 内容')).toBe('https://e.com 内容');
  });
});
