/* eslint react-refresh/only-export-components: off */
import React, { createContext, useState } from 'react';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => sessionStorage.getItem('authToken'));
  const [user, setUser] = useState(() => {
    const saved = sessionStorage.getItem('authUser');
    return saved ? JSON.parse(saved) : null;
  });

  const login = async (email, password) => {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      throw new Error('Login failed');
    }
    const data = await res.json();
    setToken(data.token);
    sessionStorage.setItem('authToken', data.token);
    const newUser = { email };
    setUser(newUser);
    sessionStorage.setItem('authUser', JSON.stringify(newUser));
    return data.token;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('authUser');
  };

  const value = {
    token,
    user,
    login,
    logout,
    isAuthenticated: !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

