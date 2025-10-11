/* eslint react-refresh/only-export-components: off */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { MULTIPLIER_MODES } from '../utils/multipliers';
import { SONGLIST_OVERRIDE_OPTIONS } from '../utils/songlistOverrides';
import { useNavigate } from 'react-router-dom';
import { useScores } from './ScoresContext.jsx';
import { useGroups } from './GroupsContext.jsx';
import { SettingsContext } from './SettingsContext.jsx';
import { storage } from '../utils/remoteStorage.js';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const { setScores } = useScores();
  const { setGroups, setActiveGroup } = useGroups();
  const {
    setTargetBPM,
    setApiKey,
    setMultiplierMode,
    setTheme,
    setPlayStyle,
    setShowRankedRatings,
    setSonglistOverride,
  } = useContext(SettingsContext);

  const applySettings = (data = {}) => {
    const bool = (v) => v === true || v === 'true';
    const num = (v, d) => (v !== undefined && v !== null ? Number(v) : d);
    if (data.targetBPM !== undefined) setTargetBPM(num(data.targetBPM, 300));
    if (data.apiKey !== undefined) setApiKey(data.apiKey);
    if (data.multiplierMode !== undefined) setMultiplierMode(data.multiplierMode);
    if (data.theme !== undefined) setTheme(data.theme);
    if (data.playStyle !== undefined) setPlayStyle(data.playStyle);
    // showLists is always enabled now
    if (data.showRankedRatings !== undefined) setShowRankedRatings(bool(data.showRankedRatings));
    if (data.songlistOverride !== undefined) setSonglistOverride(data.songlistOverride);
  };

  const refreshToken = async () => {
    const res = await fetch('/api/refresh', { method: 'POST', credentials: 'include' });
    return res.ok;
  };

  const fetchUserData = useCallback(async () => {
    const res = await fetch('/api/user/data', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      const email = typeof data.email === 'string' ? data.email : '';
      setUser(u => ({ email: email || u?.email || '' }));

      // Decide which scores to trust BEFORE hydrating storage (avoid cache shadowing local)
      const parseMaybeJson = (val) => {
        if (!val) return null;
        try { return typeof val === 'string' ? JSON.parse(val) : val; } catch { return null; }
      };
      const countScores = (obj) => {
        if (!obj || typeof obj !== 'object') return 0;
        const hasModes = obj.single || obj.double;
        if (hasModes) {
          const sp = obj.single && typeof obj.single === 'object' ? Object.keys(obj.single).length : 0;
          const dp = obj.double && typeof obj.double === 'object' ? Object.keys(obj.double).length : 0;
          return sp + dp;
        }
        return Object.keys(obj).length;
      };

      const serverRaw = data.scores ?? data.ddrScores ?? null;
      const serverParsed = parseMaybeJson(serverRaw);

      // Read the locally persisted value directly from localStorage using the user namespace.
      // This avoids the in-memory cache (which hydrateFrom would overwrite with the server snapshot).
      let localParsed = null;
      try {
        if (typeof window !== 'undefined') {
          const ns = email ? `user:${email}` : 'user:unknown';
          const raw = window.localStorage.getItem(`${ns}:ddrScores`);
          localParsed = parseMaybeJson(raw);
        }
      } catch { /* noop */ }

      const serverCount = countScores(serverParsed);
      const localCount = countScores(localParsed);

      const chosen = (localCount > serverCount) ? localParsed : serverParsed;

      // Now hydrate storage namespace and cache from server payload
      try {
        storage.hydrateFrom(data);
      } catch { /* noop */ }

      if (chosen) {
        try { setScores(chosen); } catch { /* noop */ }
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

      // Hydrate groups from server into context
      try {
        const raw = storage.getItem('groups');
        const parsed = raw ? JSON.parse(raw) : [];
        setGroups(Array.isArray(parsed) ? parsed : []);
        setActiveGroup('All');
      } catch { /* noop */ }

      return true;
    }
    if (res.status === 401) {
      const refreshed = await refreshToken();
      if (refreshed) {
        return fetchUserData();
      }
      // Unauthenticated: keep user null and do not force navigation.
      // This avoids redirecting away from /signup when the user is trying to register.
      setUser(null);
    }
    return false;
  }, [navigate, setScores, setTargetBPM, setApiKey, setMultiplierMode, setTheme, setPlayStyle, setShowRankedRatings, setSonglistOverride]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  const login = async (email, password, turnstileToken) => {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, turnstileToken }),
      credentials: 'include'
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Login failed');
    }
    setUser({ email });
    await fetchUserData();
    navigate('/');
  };

  const signup = async (email, password, turnstileToken) => {
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, turnstileToken }),
      credentials: 'include'
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Signup failed');
    }
    await login(email, password);
  };

  const logout = async () => {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    // Reset auth and data
    setUser(null);
    setScores({ single: {}, double: {} });
    setGroups([]);
    setActiveGroup('All');
    // Reset settings to defaults in-memory
    setTargetBPM(300);
    setApiKey('');
    setMultiplierMode(MULTIPLIER_MODES.A_A3);
    setTheme('dark');
    setPlayStyle('single');
    setShowRankedRatings(false);
    setSonglistOverride(SONGLIST_OVERRIDE_OPTIONS[0].value);
    // Clear persisted storage (remote + local + session)
    try { if (typeof window !== 'undefined') window.sessionStorage.clear(); } catch { /* noop */ }
    storage.clear();
    // Reset storage namespace to anonymous after logout (handled lazily by storage on next init)
    navigate('/login');
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, refreshUser: fetchUserData }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);






