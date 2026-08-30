// ===== 认证状态上下文：当前用户 + 登出/刷新 =====
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, isLoading, mutate } = useMe();

  const refresh = useCallback(() => mutate(), [mutate]);
  const logout = useCallback(async () => {
    await api('/logout', { method: 'POST' });
    await mutate(); // user → null
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
