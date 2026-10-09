import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as api from '../api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!api.getToken());
  const [wishlist, setWishlist] = useState(new Set());

  // restore the session when the page loads
  useEffect(() => {
    if (!api.getToken()) return;
    api.getMe()
      .then((r) => setUser(r.user))
      .catch(() => api.setToken(null))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!user) { setWishlist(new Set()); return; }
    api.getWishlist().then((list) => setWishlist(new Set(list.map((c) => c.id)))).catch(() => {});
  }, [user]);

  const finish = (r) => { api.setToken(r.token); setUser(r.user); return r.user; };
  const login = async (email, password) => finish(await api.login({ email, password }));
  const register = async (fields) => finish(await api.register(fields));
  const logout = () => { api.setToken(null); setUser(null); };

  // Returns false when the visitor needs to log in first.
  const toggleWishlist = useCallback(async (id) => {
    if (!user) return false;
    const had = wishlist.has(id);
    const next = new Set(wishlist);
    if (had) next.delete(id); else next.add(id);
    setWishlist(next);
    try {
      if (had) await api.removeWishlist(id); else await api.addWishlist(id);
    } catch {
      setWishlist(wishlist); // put it back if the server said no
    }
    return true;
  }, [user, wishlist]);

  return (
    <AuthContext.Provider value={{ user, ready, wishlist, login, register, logout, toggleWishlist }}>
      {children}
    </AuthContext.Provider>
  );
}
