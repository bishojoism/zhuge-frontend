// ===== PWA 安装：beforeinstallprompt 管理（Android/桌面可安装时显示按钮）=====
// iOS Safari 不触发 beforeinstallprompt，只能"添加到主屏幕"，单独提供安装指引入口
import { useCallback, useEffect, useMemo, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  // 已安装（独立窗口 / iOS 主屏幕）或不在可安装环境 → 不显示按钮
  const [installed] = useState<boolean>(() => {
    try {
      return (
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as { standalone?: boolean }).standalone === true
      );
    } catch {
      return false;
    }
  });

  // iOS 设备（iPhone/iPad/iPod，含 iOS Safari 与 iOS Chrome/Firefox——内核均为 WebKit）
  const isIos = useMemo(
    () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream,
    []
  );

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* 忽略 */
    }
    setDeferred(null);
  }, [deferred]);

  return {
    // Android Chrome / 桌面 Chrome/Edge：可触发安装面板
    canInstall: !installed && !!deferred,
    // iOS：始终提供"添加到主屏幕"指引入口
    canInstallIos: !installed && isIos,
    promptInstall,
  };
}
