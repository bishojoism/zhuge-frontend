// bbcode 测试：解析 / 剥离 / 颜色白名单 / 禁用外链 / 摘要宽容模式
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { hasBBCode, isSafeColor, parseBBCode, parseBBCodeExcerpt, stripBBCode } from '../src/lib/bbcode';

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

  it('大字/小字渲染为 span 字号', () => {
    const { container } = render(parseBBCode('[big]大[/big] [small]小[/small]'));
    const spans = container.querySelectorAll('span');
    expect(spans.length).toBe(2);
    const styles = [...spans].map((s) => s.style.fontSize);
    expect(styles).toContain('1.25em');
    expect(styles).toContain('0.8em');
    expect(container.textContent).toBe('大 小');
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

  it('可复制文本块：渲染内容 + 复制按钮（内容纯文本可复制）', () => {
    const { container } = render(parseBBCode('[copy]秘密台词[/copy]'));
    expect(container.textContent).toContain('秘密台词');
    expect(screen.getByRole('button', { name: '复制' })).toBeInTheDocument();
  });

  it('骰子注入格式 [dice=1d20|17|17]：显示服务端结果，不可自行掷骰', () => {
    const { container } = render(parseBBCode('[dice=1d20|17|17]'));
    expect(container.textContent).toContain('🎲 1d20');
    expect(container.textContent).toContain('17');
    expect(container.textContent).toContain('[17]');
    // 无掷骰按钮（结果由服务端注入，防伪造）
    expect(screen.queryByRole('button', { name: /🎲/ })).toBeNull();
  });

  it('骰子 [dice]2d6+1[/dice]：未发帖时显示等待掷定', () => {
    wrap(parseBBCode('[dice]2d6+1[/dice]'));
    expect(screen.getByText(/🎲 2d6\+1/)).toBeInTheDocument();
    expect(screen.getByText(/发帖后掷定/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /🎲/ })).toBeNull();
  });

  it('非法骰子表达式 → 显示原表达式（不生成骰子）', () => {
    wrap(parseBBCode('[dice]999d9999[/dice]'));
    // 非法表达式渲染为 🎲 [表达式]（无法掷出）
    expect(screen.getByText(/🎲 \[999d9999\]/)).toBeInTheDocument();
  });

  it('大面数骰子（BigInt 范畴）注入结果正常显示', () => {
    const { container } = render(parseBBCode('[dice=d999999999999|123456789|123456789]'));
    expect(container.textContent).toContain('d999999999999');
    expect(container.textContent).toContain('123456789');
    expect(screen.queryByRole('button', { name: /🎲/ })).toBeNull();
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

describe('parseBBCodeExcerpt（列表摘要宽容渲染）', () => {
  it('完整标签渲染样式', () => {
    wrap(parseBBCodeExcerpt('[b]摘要加粗[/b] 和 [color=red]红[/color]'));
    expect(screen.getByText('摘要加粗').tagName).toBe('B');
    const span = screen.getByText('红');
    expect(span.style.color).toBe('red');
  });

  it('截断在标签中间 → 丢弃残缺标签，不显示原始标签文本', () => {
    wrap(parseBBCodeExcerpt('开场[color=red]红色文字还没写完'));
    // 不显示 [color=red] 原始标签
    expect(screen.queryByText(/\[color/)).toBeNull();
    // 内容仍可见
    expect(screen.getByText(/红色文字还没写完/)).toBeInTheDocument();
  });

  it('截断在 [b] 后 → 内容保留且无标签文本', () => {
    wrap(parseBBCodeExcerpt('标题 [b]加粗内容'));
    expect(screen.queryByText(/\[b\]/)).toBeNull();
    expect(screen.getByText(/加粗内容/)).toBeInTheDocument();
  });

  it('普通文本原样', () => {
    wrap(parseBBCodeExcerpt('普通摘要'));
    expect(screen.getByText('普通摘要')).toBeInTheDocument();
  });
});
