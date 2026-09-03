// ===== 系统通知（Web Push）管理：权限请求、订阅/退订、状态恢复 =====
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

// VAPID 公钥（applicationServerKey，公开信息，硬编码便于订阅）
const APPLICATION_SERVER_KEY =
  'BNLXXTxjMZVRvL9tw95Qi2SyhHuWJRLgTXF7i_Zy8Si67zzinetxrx-VbmsbpWf4-KOzUZsyiZZLfk4a_fclowM';

export type PushState = 'unsupported' | 'denied' | 'default' | 'subscribed';

function urlBase64ToUint8Array(s: string): ArrayBuffer {
  const padding = '='.repeat((4 - (s.length % 4)) % 4);
  const base64 = (s + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer as ArrayBuffer;
}

function bytesToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 超时包装：pushManager.subscribe 在推送服务不可达（如 FCM 被墙）时会长时间挂起，
// 加超时避免"一直加载中"
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('push timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

const SUBSCRIBE_TIMEOUT_MS = 8000;
// 权限请求超时：iOS 在非手势上下文调用 requestPermission 可能永不返回，
// 若不加超时，busy 会永久卡住、后续点击全部被挡
const REQUEST_PERM_TIMEOUT_MS = 3000;

export function usePushNotify() {
  const [state, setState] = useState<PushState>('default');
  // 订阅/退订进行中（Switch 显示加载）
  const [busy, setBusy] = useState(false);
  const [supported] = useState<boolean>(
    () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  );
  // iOS 设备（iPhone/iPad/iPod，含 PWA）：requestPermission 必须用户手势内调用，
  // 非手势调用会被静默返回 denied（自动开启在 iOS 上无意义，且会误标"已拒绝"）
  const isIos = useMemo(
    () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream,
    []
  );
  // iOS 普通 Safari 标签页不支持 Web Push，只有安装到主屏幕的 PWA 支持（16.4+）
  const [iosNeedsPwa] = useState<boolean>(() => {
    const standalone =
      (navigator as unknown as { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
    return isIos && !standalone;
  });

  const refresh = useCallback(async () => {
    if (!supported) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      // 只有真实存在订阅才算已开启；权限 granted 但订阅失败（如推送服务不可达）→ 未开启
      setState(sub ? 'subscribed' : 'default');
    } catch {
      setState('default');
    }
  }, [supported]);

  // 挂载时恢复状态（已订阅/权限被拒等）
  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  // 开启：请求权限 → 订阅 → 上报后端；返回 { ok, reason }，reason 为失败原因（供提示）
  const enable = useCallback(async (): Promise<{ ok: boolean; reason?: string }> => {
    if (!supported || iosNeedsPwa) return { ok: false, reason: 'unsupported' };
    setBusy(true);
    try {
      let perm: NotificationPermission;
      try {
        perm = await withTimeout(Notification.requestPermission(), REQUEST_PERM_TIMEOUT_MS);
      } catch {
        // 权限请求挂起/超时（如 iOS 非手势上下文）→ 按失败处理，避免 busy 永久卡住
        setState('default');
        return { ok: false, reason: 'permission-timeout' };
      }
      if (perm !== 'granted') {
        setState('denied');
        return { ok: false, reason: 'denied' };
      }
      try {
        const reg = await withTimeout(navigator.serviceWorker.ready, 5000);
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await withTimeout(
            reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(APPLICATION_SERVER_KEY),
            }),
            SUBSCRIBE_TIMEOUT_MS
          );
        }
        const p256dh = sub.getKey('p256dh');
        const auth = sub.getKey('auth');
        if (!p256dh || !auth) return { ok: false, reason: 'missing-keys' };
        await api('/push/subscribe', {
          method: 'POST',
          body: {
            endpoint: sub.endpoint,
            keys: { p256dh: bytesToBase64Url(p256dh), auth: bytesToBase64Url(auth) },
          },
        });
        setState('subscribed');
        return { ok: true };
      } catch (e) {
        // 订阅失败：把浏览器给出的错误名带回，便于区分网络/权限/其他问题
        const err = e as { name?: string; message?: string } | null | undefined;
        const name = err && typeof err.name === 'string' ? err.name : '';
        const msg = err && typeof err.message === 'string' ? err.message : '';
        const reason = name || msg ? (name ? name + (msg ? ': ' + msg : '') : msg) : 'unknown-error';
        return { ok: false, reason };
      }
    } finally {
      setBusy(false);
    }
  }, [supported, iosNeedsPwa]);

  // 关闭：退订 + 通知后端删除
  const disable = useCallback(async () => {
    if (!supported) return;
    setBusy(true);
    try {
      const reg = await withTimeout(navigator.serviceWorker.ready, 5000);
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe().catch(() => {});
        await api('/push/unsubscribe', { method: 'POST', body: { endpoint } }).catch(() => {});
      }
    } catch {
      /* 忽略 */
    } finally {
      setBusy(false);
    }
    setState('default');
  }, [supported]);

  return { state, supported, iosNeedsPwa, isIos, busy, enable, disable, refresh };
}
