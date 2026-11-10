import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js';
import { setCurrency } from './format.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [ready, setReady] = useState(false);

  const setUser = useCallback((next) => {
    setCurrency(next?.currency);
    setUserState(next);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, [setUser]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) return setReady(true);
    api('/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, [logout, setUser]);

  const value = useMemo(
    () => ({
      user,
      ready,
      setUser,
      logout,
      async signIn(path, body) {
        const data = await api(path, { method: 'POST', body });
        setToken(data.token);
        setUser(data.user);
      },
    }),
    [user, ready, setUser, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
