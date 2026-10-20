import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api, setUnauthorizedHandler } from './api.js';
import { useToast } from './components/Toast.jsx';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    api.get('/api/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (userRef.current) toast.info('เซสชันหมดอายุเนื่องจากไม่มีการใช้งาน กรุณาเข้าสู่ระบบอีกครั้ง');
      userRef.current = null;
      setUser(null);
      if (!location.pathname.startsWith('/login')) {
        navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
      }
    });
  }, [navigate, location, toast]);

  const login = useCallback(async (username, password) => {
    const d = await api.post('/api/auth/login', { username, password });
    setUser(d.user);
    return d.user;
  }, []);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout').catch(() => {});
    setUser(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const value = useMemo(() => ({
    user,
    login,
    logout,
    can: (perm) => !!user?.permissions?.includes(perm),
  }), [user, login, logout]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
