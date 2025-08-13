/* eslint react-refresh/only-export-components: off */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScores } from './ScoresContext.jsx';
import { SettingsContext } from './SettingsContext.jsx';
import { storage } from '../utils/remoteStorage.js';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const { setScores } = useScores();
  const settings = useContext(SettingsContext);

  const applySettings = (data = {}) => {
    if (!settings) return;
    if (data.targetBPM !== undefined) settings.setTargetBPM(data.targetBPM);
    if (data.apiKey !== undefined) settings.setApiKey(data.apiKey);
    if (data.multiplierMode !== undefined) settings.setMultiplierMode(data.multiplierMode);
    if (data.theme !== undefined) settings.setTheme(data.theme);
    if (data.playStyle !== undefined) settings.setPlayStyle(data.playStyle);
    if (data.showLists !== undefined) settings.setShowLists(data.showLists);
    if (data.showRankedRatings !== undefined) settings.setShowRankedRatings(data.showRankedRatings);
    if (data.songlistOverride !== undefined) settings.setSonglistOverride(data.songlistOverride);
  };

  const refreshToken = async () => {
    const res = await fetch('/refresh', { method: 'POST' });
    return res.ok;
  };

  const fetchUserData = async () => {
    const res = await fetch('/user/data');
    if (res.ok) {
      const data = await res.json();
      setUser({ email: data.email || user?.email || '' });
      if (data.scores) setScores(data.scores);
      if (data.settings) applySettings(data.settings);
      return true;
    }
    if (res.status === 401) {
      const refreshed = await refreshToken();
      if (refreshed) {
        return fetchUserData();
      }
      setUser(null);
      navigate('/login');
    }
    return false;
  };

  useEffect(() => {
    fetchUserData();
  }, []);

  const login = async (email, password) => {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      throw new Error('Login failed');
    }
    setUser({ email });
    await fetchUserData();
    navigate('/');
  };

  const signup = async (email, password) => {
    const res = await fetch('/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      throw new Error('Signup failed');
    }
    await login(email, password);
  };

  const logout = async () => {
    await fetch('/logout', { method: 'POST' });
    setUser(null);
    setScores({ single: {}, double: {} });
    storage.clear();
    navigate('/login');
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, refreshUser: fetchUserData }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

