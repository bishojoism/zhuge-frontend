// ===== iOS 安装指引：Safari「添加到主屏幕」步骤说明（iOS 无 beforeinstallprompt） =====
import { List, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconCheck, IconPlus, IconShare } from '@tabler/icons-react';
import { openModalOnce } from '../../lib/modals';

export function openIosInstallHint(): void {
  const isSafari =
    /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
  openModalOnce('ios-install-hint', (m) => {
    m.open({
      title: '安装《主格》到主屏幕',
      size: 400,
      children: (
        <Stack gap="md" py="xs">
          {isSafari ? (
            <>
              <Text size="sm" c="dimmed">
                安装后可像 App 一样使用：全屏、独立图标、更快打开。
              </Text>
              <List spacing="sm" size="sm">
                <List.Item
                  icon={
                    <ThemeIcon color="slate" size={20} radius="xl">
                      <IconShare size={12} />
                    </ThemeIcon>
                  }
                >
                  点击底部工具栏的「分享」按钮（方框带向上箭头）
                </List.Item>
                <List.Item
                  icon={
                    <ThemeIcon color="slate" size={20} radius="xl">
                      <IconPlus size={12} />
                    </ThemeIcon>
                  }
                >
                  在菜单中选择「添加到主屏幕」
                </List.Item>
                <List.Item
                  icon={
                    <ThemeIcon color="slate" size={20} radius="xl">
                      <IconCheck size={12} />
                    </ThemeIcon>
                  }
                >
                  点击右上角「添加」，《主格》图标即出现在主屏幕
                </List.Item>
              </List>
            </>
          ) : (
            <Text size="sm">
              iPhone 上只有 <Text component="span" fw={600}>Safari</Text>{' '}
              支持「添加到主屏幕」。请复制本页链接，用 Safari
              打开后：分享按钮 →「添加到主屏幕」→「添加」即可安装。
            </Text>
          )}
        </Stack>
      ),
    });
  });
}
