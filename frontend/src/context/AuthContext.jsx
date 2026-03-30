import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('gd_token'));
  const [user, setUser] = useState(() => {
    const u = localStorage.getItem('gd_user');
    return u ? JSON.parse(u) : null;
  });

  const login = (tokenValue, userData) => {
    localStorage.setItem('gd_token', tokenValue);
    localStorage.setItem('gd_user', JSON.stringify(userData));
    setToken(tokenValue);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('gd_token');
    localStorage.removeItem('gd_user');
    setToken(null);
    setUser(null);
  };

  // Mettre à jour les infos utilisateur (avatar, display_name, etc.) sans reconnexion
  const updateUser = (updates) => {
    const updated = { ...user, ...updates };
    localStorage.setItem('gd_user', JSON.stringify(updated));
    setUser(updated);
  };

  return (
    <AuthContext.Provider value={{ token, user, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
