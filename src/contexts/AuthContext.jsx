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
    const bool = (v) => v === true || v === 'true';
    const num = (v, d) => (v !== undefined && v !== null ? Number(v) : d);
    if (data.targetBPM !== undefined) settings.setTargetBPM(num(data.targetBPM, 300));
    if (data.apiKey !== undefined) settings.setApiKey(data.apiKey);
    if (data.multiplierMode !== undefined) settings.setMultiplierMode(data.multiplierMode);
    if (data.theme !== undefined) settings.setTheme(data.theme);
    if (data.playStyle !== undefined) settings.setPlayStyle(data.playStyle);
    if (data.showLists !== undefined) settings.setShowLists(bool(data.showLists));
    if (data.showRankedRatings !== undefined) settings.setShowRankedRatings(bool(data.showRankedRatings));
    if (data.songlistOverride !== undefined) settings.setSonglistOverride(data.songlistOverride);
  };

  const refreshToken = async () => {
    const res = await fetch('/api/refresh', { method: 'POST', credentials: 'include' });
    return res.ok;
  };

  const fetchUserData = async () => {
    const res = await fetch('/api/user/data', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setUser({ email: data.email || user?.email || '' });
      // Scores
      if (data.scores) setScores(data.scores);
      else if (data.ddrScores) {
        try {
          setScores(typeof data.ddrScores === 'string' ? JSON.parse(data.ddrScores) : data.ddrScores);
        } catch (e) {
          console.warn('Failed to parse ddrScores from server', e);
        }
      }
      // Settings (support both nested and flat payloads)
      if (data.settings) applySettings(data.settings);
      else {
        const flat = {
          targetBPM: data.targetBPM,
          multiplierMode: data.multiplierMode,
          theme: data.theme,
          playStyle: data.playStyle,
          showLists: data.showLists,
          showRankedRatings: data.showRankedRatings,
          songlistOverride: data.songlistOverride,
        };
        applySettings(flat);
      }
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
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include'
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Login failed');
    }
    setUser({ email });
    await storage.refresh();
    await fetchUserData();
    navigate('/');
  };

  const signup = async (email, password) => {
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include'
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Signup failed');
    }
    await login(email, password);
  };

  const logout = async () => {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
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

