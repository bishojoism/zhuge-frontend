// ===== Mantine 主题：莫兰迪低饱和色板（与旧版一致） =====
import { createTheme, type ButtonProps, type MantineTheme } from '@mantine/core';

// 基于 #7c8ea3 生成的 10 阶色（Mantine 要求 10 个色阶）
const slate: [string, string, string, string, string, string, string, string, string, string] = [
  '#f2f5f8',
  '#e3e9ee',
  '#d3dce4',
  '#c3ced9',
  '#b0becd',
  '#9dacbd',
  '#8b9cb0',
  '#7c8ea3',
  '#64788f',
  '#55687d',
];

// 基于 #c98a6b 生成的 10 阶色（强调色）
const clay: [string, string, string, string, string, string, string, string, string, string] = [
  '#faf2ee',
  '#f4e2d8',
  '#eed2c3',
  '#e7c0ac',
  '#ddab92',
  '#d49a7e',
  '#cd8c6f',
  '#c98a6b',
  '#b47353',
  '#a06448',
];

export const theme = createTheme({
  primaryColor: 'slate',
  colors: {
    slate,
    clay,
  },
  fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
  defaultRadius: 'md',
  headings: {
    fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  components: {
    Button: {
      defaultProps: {
        radius: 'md',
      },
      // 无障碍：按钮文字/背景对比度 ≥4.5:1（颜色用 CSS 变量，随深/浅色模式自动切换）
      styles: (_t: MantineTheme, props: ButtonProps) => {
        if (props.variant === 'subtle') {
          return { root: { color: props.color === 'clay' ? 'var(--accent-deep)' : 'var(--primary-deep)' } };
        }
        // 未指定 variant 时 Mantine 默认 filled（props.variant 为 undefined），同样要加深背景
        if (props.variant === 'filled' || props.variant === undefined) {
          return { root: { backgroundColor: props.color === 'clay' ? 'var(--accent-dark)' : 'var(--primary-dark)' } };
        }
        return {};
      },
    },
    CloseButton: {
      // 无障碍：关闭按钮只有 X 图标，需可读名称（弹窗/通知关闭按钮共用）
      defaultProps: { 'aria-label': '关闭' },
    },
    // 内容类输入框默认关闭浏览器自动填充（防止搜索/标题/内容等被自动填充污染；
    // 登录/注册/密码框显式设置的 username/current-password/new-password 会覆盖此默认）
    TextInput: {
      defaultProps: { autoComplete: 'off' },
    },
    Textarea: {
      defaultProps: { autoComplete: 'off' },
    },
    // 皮身份选择（发帖/接戏/滴滴）底层是 input，同样关掉浏览器自动填充
    Select: {
      defaultProps: { autoComplete: 'off' },
    },
  },
});
