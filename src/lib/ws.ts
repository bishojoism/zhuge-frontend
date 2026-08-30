// ===== 通知 WebSocket：连接管理（指数退避重连 + 页面可见性处理） =====
import { useEffect, useRef } from 'react';

export type NotifyEventType = 'open' | 'message' | 'close';

interface Options {
  enabled: boolean;
  onEvent?: (type: NotifyEventType) => void;
}

/**
 * 建立 /api/ws 实时通知连接。
 * - 指数退避重连：1s 起、翻倍、上限 30s，加随机抖动；连上重置
 * - 页面隐藏时断开并暂停重连，恢复可见立即重连
 * - 服务端每 30s 心跳 {type:'ping'}，本钩子自动忽略
 */
export function useNotifySocket({ enabled, onEvent }: Options): void {
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let ws: WebSocket | null = null;
    let retryTimer: number | null = null;
    let retryDelay = 1000;

    const cleanup = () => {
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (ws) {
        try { ws.close(); } catch { /* 忽略 */ }
        ws = null;
      }
    };

    const connect = () => {
      if (disposed || document.hidden) return;
      try {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(proto + '//' + location.host + '/api/ws');
        ws.onopen = () => {
          retryDelay = 1000;
          cbRef.current?.('open');
        };
        ws.onmessage = (e) => {
          try {
            const m = JSON.parse(String(e.data));
            if (m && m.type === 'ping') return; // 心跳保活，忽略
          } catch { /* 非 JSON 按消息处理 */ }
          cbRef.current?.('message');
        };
        ws.onclose = () => {
          ws = null;
          cbRef.current?.('close');
          scheduleReconnect();
        };
        ws.onerror = () => {
          try { ws?.close(); } catch { /* 忽略 */ }
        };
      } catch {
        scheduleReconnect();
      }
    };

    const scheduleReconnect = () => {
      if (disposed || document.hidden) return;
      if (retryTimer !== null) return;
      const delay = retryDelay + Math.floor(Math.random() * 1000);
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        connect();
      }, delay);
      retryDelay = Math.min(retryDelay * 2, 30000);
    };

    const onVisibility = () => {
      if (document.hidden) {
        cleanup();
      } else {
        retryDelay = 1000;
        connect();
      }
    };

    connect();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true;
      cleanup();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled]);
}
