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
    expect(screen.getByText(/开戏\/接戏后掷定/)).toBeInTheDocument();
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

// ============ 复杂 / 嵌套 / 错误 BBCode 全面测试 ============

describe('parseBBCode（复杂组合）', () => {
  it('多种标签混合（b+i+u+s+color+big+small）同时渲染', () => {
    const { container } = render(
      parseBBCode('[b]粗[/b] [i]斜[/i] [u]下[/u] [s]删[/s] [color=red]红[/color] [big]大[/big] [small]小[/small]')
    );
    expect(container.textContent).toBe('粗 斜 下 删 红 大 小');
    expect(container.querySelector('b')).toBeTruthy();
    expect(container.querySelector('i')).toBeTruthy();
    expect(container.querySelector('u')).toBeTruthy();
    expect(container.querySelector('s')).toBeTruthy();
    const colored = container.querySelector('span[style*="color"]');
    expect(colored?.textContent).toBe('红');
    const big = container.querySelector('span[style*="1.25em"]');
    expect(big?.textContent).toBe('大');
    const small = container.querySelector('span[style*="0.8em"]');
    expect(small?.textContent).toBe('小');
  });

  it('hex 颜色（#rgb 与 #rrggbb）与大小写颜色名', () => {
    const { container } = render(parseBBCode('[color=#f00]短hex[/color] [color=#12AbFf]长hex[/color] [color=RED]大写红[/color]'));
    const spans = container.querySelectorAll('span[style*="color"]');
    expect(spans.length).toBe(3);
    const colors = [...spans].map((s) => (s as HTMLElement).style.color.toLowerCase());
    // 浏览器把 hex 标准化为 rgb()；颜色名保持原样（小写）
    expect(colors).toContain('rgb(255, 0, 0)'); // #f00
    expect(colors).toContain('rgb(18, 171, 255)'); // #12AbFf → #12abff
    expect(colors).toContain('red');
  });

  it('copy 块内嵌套 BBCode：显示渲染格式，复制按钮拿纯文本', () => {
    const { container } = render(parseBBCode('[copy]密语 [b]加粗[/b] [color=blue]蓝[/color][/copy]'));
    expect(container.querySelector('b')?.textContent).toBe('加粗');
    expect(container.querySelector('span[style*="color"]')?.textContent).toBe('蓝');
    // 复制按钮存在（复制文本 = stripBBCode 后的纯文本，由 CopyBlock 内部处理）
    expect(screen.getByRole('button', { name: '复制' })).toBeInTheDocument();
  });

  it('骰子带修正与明细（注入格式 [dice=2d6+1|9|3,5+1]）', () => {
    const { container } = render(parseBBCode('[dice=2d6+1|9|3,5+1]'));
    expect(container.textContent).toContain('🎲 2d6+1');
    expect(container.textContent).toContain('9');
    expect(container.textContent).toContain('[3,5+1]');
  });

  it('大面数骰子注入（多骰 + 修正，BigInt 明细）', () => {
    const { container } = render(parseBBCode('[dice=2d1000000000000000000000+1|863919753535051875867|444034238932560002841,419885514602491873025+1]'));
    expect(container.textContent).toContain('🎲 2d1000000000000000000000+1');
    expect(container.textContent).toContain('863919753535051875867');
  });

  it('同一行多个骰子各自独立解析', () => {
    const { container } = render(parseBBCode('[dice=1d20|15|15] 与 [dice=1d6|4|4]'));
    expect(container.textContent).toContain('🎲 1d20');
    expect(container.textContent).toContain('🎲 1d6');
    expect(container.textContent).toContain('15');
    expect(container.textContent).toContain('4');
  });

  it('标签大小写不敏感（[B]…[/B] 渲染为粗体）', () => {
    wrap(parseBBCode('[B]大写粗体[/B]'));
    expect(screen.getByText('大写粗体').tagName).toBe('B');
  });

  it('纯文本与标签混排顺序保留', () => {
    const { container } = render(parseBBCode('前[b]中[/b]后'));
    expect(container.textContent).toBe('前中后');
    expect(container.querySelector('b')?.textContent).toBe('中');
  });
});

describe('parseBBCode（深层嵌套）', () => {
  it('四层嵌套 b>i>u>s', () => {
    wrap(parseBBCode('[b]外[i]中[u]里[s]最深[/s][/u][/i][/b]'));
    const deepest = screen.getByText('最深');
    expect(deepest.tagName).toBe('S');
    let el: HTMLElement | null = deepest.parentElement;
    expect(el?.tagName).toBe('U');
    el = el?.parentElement ?? null;
    expect(el?.tagName).toBe('I');
    el = el?.parentElement ?? null;
    expect(el?.tagName).toBe('B');
  });

  it('颜色嵌套在粗体内、big 套 small（字号逐层生效）', () => {
    const { container } = render(parseBBCode('[b][color=green][big]绿大[small]绿小[/small][/big][/color][/b]'));
    const small = container.querySelector('span[style*="0.8em"]');
    expect(small?.textContent).toBe('绿小');
    // small 在 big 之内（big 是 small 的祖先）
    const big = container.querySelector('span[style*="1.25em"]');
    expect(big?.contains(small as Node)).toBe(true);
    // 整体在 b 内
    expect(container.querySelector('b')?.textContent).toContain('绿大绿小');
  });

  it('copy 内嵌套 copy：BBob 栈式解析器正确嵌套，两个独立复制块', () => {
    const { container } = render(parseBBCode('[copy]外层[copy]内层[/copy]结束[/copy]'));
    expect(container.textContent).toContain('外层');
    expect(container.textContent).toContain('内层');
    expect(container.textContent).toContain('结束');
    // 外层与内层各有一个复制按钮
    expect(screen.getAllByRole('button', { name: /复制|已复制/ }).length).toBe(2);
  });

  it('30 层深嵌套：BBob 栈式解析器完整渲染全部层级', () => {
    const depth = 30;
    const input = '[b]'.repeat(depth) + '最内层' + '[/b]'.repeat(depth);
    const { container } = render(parseBBCode(input));
    // 内容完整渲染（不再原文残留）
    expect(container.textContent).toBe('最内层');
    // 渲染出全部 30 层 <b>（嵌套）
    expect(container.querySelectorAll('b').length).toBe(depth);
    // 最深层的 b 内容是"最内层"
    const allB = container.querySelectorAll('b');
    expect(allB[allB.length - 1]?.textContent).toBe('最内层');
    // 无注入
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('50 层混合嵌套（b/i/u/s/color/big/small）不崩溃且正确渲染', () => {
    const depth = 50;
    const tags = ['b', 'i', 'u', 's', 'big', 'small'] as const;
    let input = '';
    for (let i = 0; i < depth; i++) {
      const t = tags[i % tags.length];
      input += t === 'big' || t === 'small' ? `[${t}]` : `[${t}]`;
    }
    input += '深层内容';
    for (let i = depth - 1; i >= 0; i--) {
      const t = tags[i % tags.length];
      input += t === 'big' || t === 'small' ? `[/${t}]` : `[/${t}]`;
    }
    const { container } = render(parseBBCode(input));
    expect(container.textContent).toBe('深层内容');
  });

  it('未知标签夹在白名单标签之间：未知标签原文保留，白名单正常渲染', () => {
    const { container } = render(parseBBCode('[b]粗[quote]引[/quote]斜[/i]尾'));
    expect(container.textContent).toContain('粗');
    expect(container.textContent).toContain('[quote]');
    expect(container.textContent).toContain('引');
    expect(container.textContent).toContain('[/quote]');
  });

  it('骰子标签内不解析内部 BBCode（内容即表达式）', () => {
    const { container } = render(parseBBCode('[dice][b]1d20[/b][/dice]'));
    // 表达式为 [b]1d20[/b] → 非法 → 显示 🎲 [原文]
    expect(container.textContent).toMatch(/🎲/);
  });
});

describe('parseBBCode（错误/异常输入）', () => {
  it('未闭合标签原文显示（不吞内容）', () => {
    wrap(parseBBCode('[b]粗体未闭合[color=red]红未闭合'));
    expect(screen.getByText(/\[b\]/)).toBeInTheDocument();
    expect(screen.getByText(/\[color=red\]/)).toBeInTheDocument();
    expect(screen.getByText(/粗体未闭合/)).toBeInTheDocument();
    expect(screen.getByText(/红未闭合/)).toBeInTheDocument();
  });

  it('交叉嵌套 [b][i]x[/b][/i]：BBob 智能修复为合法嵌套，不崩溃', () => {
    const { container } = render(parseBBCode('[b][i]交错[/b]尾巴[/i]'));
    // BBob 栈式解析器自动修复交叉闭合：[b] 内含 [i]交错 + 尾巴，全部渲染
    expect(container.querySelector('b')?.textContent).toContain('交错');
    expect(container.querySelector('b')?.textContent).toContain('尾巴');
    expect(container.querySelector('i')?.textContent).toBe('交错');
  });

  it('多余闭合标签 [/b] 无开标签 → 原文显示（整段为一个文本节点）', () => {
    const { container } = render(parseBBCode('文本[/b]更多'));
    // 无开标签的 [/b] 不解析：整段文本保留
    expect(container.textContent).toBe('文本[/b]更多');
  });

  it('空标签 [b][/b] 渲染为空粗体，不崩溃', () => {
    const { container } = render(parseBBCode('前[b][/b]后'));
    expect(container.textContent).toBe('前后');
    expect(container.querySelector('b')).toBeTruthy();
  });

  it('半截开标签（无右括号）按原文显示', () => {
    wrap(parseBBCode('[b 无右括号'));
    expect(screen.getByText(/\[b 无右括号/)).toBeInTheDocument();
  });

  it('未闭合 copy / 未闭合 dice：完整模式显示开标签原文，不崩溃', () => {
    wrap(parseBBCode('[copy]没关'));
    expect(screen.getByText(/\[copy\]/)).toBeInTheDocument();
    wrap(parseBBCode('[dice]1d20'));
    // 成对未闭合（无 =值 也无 [/dice]）：按未闭合处理，显示开标签原文
    expect(screen.getByText(/\[dice\]/)).toBeInTheDocument();
  });

  it('非法骰子表达式：面数<2 / 次数>100 / 非法字符 / 空', () => {
    const cases = ['[dice]d1[/dice]', '[dice]d0[/dice]', '[dice]101d20[/dice]', '[dice]d20x[/dice]', '[dice][/dice]'];
    for (const c of cases) {
      const { container } = render(parseBBCode(c));
      // 非法表达式 → 🎲 [表达式]（不生成掷骰结果）
      expect(container.textContent).toMatch(/🎲/);
    }
  });

  it('非法颜色值拒绝设置（防 CSS 注入多形态）', () => {
    const bad = [
      '[color=red;}body{color:red]x[/color]',
      '[color=url(javascript:alert(1))]x[/color]',
      '[color=#12g]x[/color]', // 非法 hex
      '[color=]x[/color]', // 空值
      '[color=red blue]x[/color]', // 带空格
    ];
    for (const c of bad) {
      const { container } = render(parseBBCode(c));
      const styled = container.querySelectorAll('span[style*="color"]');
      // 非法颜色：span 无 color 样式（保持普通文本）
      expect(styled.length).toBe(0);
      expect(container.textContent).toContain('x');
    }
  });

  it('XSS 向量：脚本/事件/表达式/图片等全部按原文显示', () => {
    const vecs = [
      '<script>alert(1)</script>',
      '[img]javascript:alert(1)[/img]',
      '[url=javascript:alert(1)]点我[/url]',
      '[video]evil.mp4[/video]',
      '[audio]evil.mp3[/audio]',
      '[iframe]evil[/iframe]',
      '[embed]evil[/embed]',
      '[b onclick=alert(1)]x[/b]', // 给已知标签注入属性
    ];
    for (const v of vecs) {
      const { container } = render(parseBBCode(v));
      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('a')).toBeNull();
      expect(container.querySelector('iframe')).toBeNull();
      expect(container.querySelector('video')).toBeNull();
      expect(container.querySelector('audio')).toBeNull();
      expect(container.querySelector('embed')).toBeNull();
    }
  });

  it('含 [ 与 ] 的普通文本不误解析', () => {
    wrap(parseBBCode('数组 a[0] 与括号 [x] 都按原文'));
    expect(screen.getByText(/a\[0\]/)).toBeInTheDocument();
    expect(screen.getByText(/\[x\]/)).toBeInTheDocument();
  });

  it('未知标签原文显示（白名单外）', () => {
    wrap(parseBBCode('[quote]引用[/quote] [spoiler]剧透[/spoiler] [hr] [center]居中[/center]'));
    expect(screen.getByText(/\[quote\]/)).toBeInTheDocument();
    expect(screen.getByText(/\[spoiler\]/)).toBeInTheDocument();
    expect(screen.getByText(/\[hr\]/)).toBeInTheDocument();
    expect(screen.getByText(/\[center\]/)).toBeInTheDocument();
  });
});

describe('stripBBCode（复杂剥离）', () => {
  it('嵌套剥离只留最内层文本', () => {
    expect(stripBBCode('[b][i][u]深层[/u][/i][/b]')).toBe('深层');
  });
  it('copy 块剥离为纯文本（含内部格式）', () => {
    expect(stripBBCode('[copy]密语 [b]加粗[/b] [color=blue]蓝[/color][/copy]')).toBe('密语 加粗 蓝');
  });
  it('混合文本 + 标签 + 未知标签', () => {
    expect(stripBBCode('前[url]https://e.com[/url]中[quote]引[/quote]后')).toBe('前https://e.com中引后');
  });
  it('未闭合标签：BBob 容错剥壳取内容（未闭合标签也剥离）', () => {
    expect(stripBBCode('[b]粗[color=red]红')).toBe('粗红');
  });
  it('20 层嵌套剥离不卡死（guard 上限内完成）', () => {
    const input = '[b]'.repeat(20) + '底' + '[/b]'.repeat(20);
    expect(stripBBCode(input)).toBe('底');
  });
  it('骰子代码部分不进入纯文本（成对与注入格式都跳过）', () => {
    // stripBBCode 保留原始空白（不压缩），骰子移除后可能留下空格
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
    expect(norm(stripBBCode('我掷出了 [dice]1d20[/dice]'))).toBe('我掷出了');
    expect(norm(stripBBCode('结果 [dice=1d20|17|17] 大成功'))).toBe('结果 大成功');
    expect(norm(stripBBCode('[dice]101d20[/dice]非法'))).toBe('非法');
    expect(norm(stripBBCode('[dice=2d6+1|8|3,4+1]'))).toBe('');
  });
  it('copy 块内嵌骰子：复制内容不含骰子代码', () => {
    expect(stripBBCode('密语[copy]暗号是 [dice]1d6[/dice][/copy]收好')).toBe('密语暗号是 收好');
  });
});

describe('parseBBCodeExcerpt（摘要宽容模式）', () => {
  it('完整嵌套渲染样式', () => {
    wrap(parseBBCodeExcerpt('[b]外[i]内[/i][/b]'));
    const inner = screen.getByText('内');
    expect(inner.tagName).toBe('I');
    expect(inner.parentElement!.tagName).toBe('B');
  });

  it('多标签混合摘要正常', () => {
    const { container } = render(parseBBCodeExcerpt('[color=red]红[big]大[/big][/color] 尾巴'));
    expect(container.textContent).toContain('红大 尾巴');
    expect(container.querySelector('span[style*="color"]')).toBeTruthy();
  });

  it('截断在 copy 块中间 → 丢弃残缺标签保留内容', () => {
    wrap(parseBBCodeExcerpt('[copy]没写完的复制块'));
    expect(screen.queryByText(/\[copy\]/)).toBeNull();
    expect(screen.getByText(/没写完的复制块/)).toBeInTheDocument();
  });

  it('截断在骰子中间 → 不显示残缺 [dice] 标签', () => {
    wrap(parseBBCodeExcerpt('[dice]1d20还没写完'));
    expect(screen.queryByText(/\[dice\]/)).toBeNull();
  });
});
