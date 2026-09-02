// ===== 认证状态上下文：当前用户 + 登出/刷新 + 0 步自动注册 =====
// 0 步注册：打开网站（未登录）即自动生成随机用户名+密码注册并登录（register 返回 Set-Cookie），
// 用户无感进入；除非手动退出登录。失败静默（限流/网络异常保持游客态，requireLogin 兜底）。
// 副作用（已与用户确认接受）：每个访客产生一个一次性账号；退出后再次打开会注册新账号，
// 旧账号内容（发帖/皮）无法跨设备找回——如需找回请用户在账号安全中设置密码转正。
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { api } from '../../api/client';
import { useMe } from '../../api/hooks';
import type { User } from '../../types';

interface AuthContextValue {
  user: User | null | undefined; // undefined = 加载中
  loading: boolean;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refresh: async () => undefined,
  logout: async () => undefined,
});

// 自动注册的用户名：前缀 + 随机后缀。前缀用"游客/过客/观客"系列（拟人且独特，
// 真实用户自定义用户名几乎不会以"游客_"开头 → 数据清理可按前缀精确删除，不误伤真实账号）
const GUEST_PREFIXES = ['游客', '过客', '观客'];
function randomUsername(): string {
  const pre = GUEST_PREFIXES[Math.floor(Math.random() * GUEST_PREFIXES.length)];
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${pre}_${suffix}`;
}
// 随机密码：12 位大小写+数字（满足"至少 8 位"）
function randomPassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, isLoading, mutate } = useMe();
  const registeringRef = useRef(false);
  // 手动登出标志：登出后本次页面会话内不再自动注册游客（否则"刚登出又变游客"）。
  // 只存内存（模块级 ref）不持久化：刷新页面 = 全新访问 → 恢复 0 步自动注册（平台设计）。
  const loggedOutRef = useRef(false);

  // 0 步注册：useMe 确定未登录（非加载中）时自动建档；手动登出后不自动注册
  useEffect(() => {
    if (isLoading || user !== null) return;
    if (loggedOutRef.current) return; // 用户刚手动登出：保持登出态，不自动注册
    if (registeringRef.current) return;
    registeringRef.current = true;
    (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await api('/register', {
            method: 'POST',
            body: { username: randomUsername(), password: randomPassword(), autoGuest: true },
          });
          await mutate(); // register 已 Set-Cookie 登录态 → refresh 后 user 有值
          break;
        } catch {
          // 用户名冲突/限流/网络：换名重试；最终静默（保持游客态）
        }
      }
    })().finally(() => {
      registeringRef.current = false;
    });
  }, [isLoading, user, mutate]);

  const refresh = useCallback(() => mutate(), [mutate]);
  const logout = useCallback(async () => {
    await api('/logout', { method: 'POST' });
    loggedOutRef.current = true; // 手动登出：本次会话不再自动注册（刷新后重置）
    await mutate(); // user → null（不再触发自动注册，见上方 loggedOutRef 判断）
  }, [mutate]);

  const value = useMemo(
    () => ({ user, loading: isLoading, refresh, logout }),
    [user, isLoading, refresh, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
