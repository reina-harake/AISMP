import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, tokenStore } from './api';
import { useI18n } from './i18n';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const { setLang } = useI18n();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!tokenStore.get());

  const applyUser = useCallback((u) => {
    setUser(u);
    if (u?.language) setLang(u.language);
  }, [setLang]);

  useEffect(() => {
    if (!tokenStore.get()) return;
    api.get('/auth/me')
      .then((r) => applyUser(r.user))
      .catch(() => tokenStore.set(null))
      .finally(() => setLoading(false));
  }, [applyUser]);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('aismp:logout', onLogout);
    return () => window.removeEventListener('aismp:logout', onLogout);
  }, []);

  const login = async (email, password) => {
    const r = await api.post('/auth/login', { email, password });
    tokenStore.set(r.token);
    applyUser(r.user);
    return r.user;
  };

  // data: FormData (registration includes the national ID file)
  const register = async (data) => {
    const r = await api.upload('/auth/register', data);
    tokenStore.set(r.token);
    applyUser(r.user);
    return r.user;
  };

  const logout = () => {
    tokenStore.set(null);
    setUser(null);
  };

  const refresh = async () => applyUser((await api.get('/auth/me')).user);

  const updateProfile = async (data) => {
    const r = await api.patch('/auth/me', data);
    applyUser(r.user);
    return r.user;
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, logout, refresh, updateProfile }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);

/** Home page path for each role. */
export const homeFor = (user) =>
  !user ? '/' : user.role === 'admin' ? '/admin' : user.role === 'employee' ? '/queue' : '/home';
