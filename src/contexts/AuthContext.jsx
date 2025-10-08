/* eslint react-refresh/only-export-components: off */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { MULTIPLIER_MODES } from '../utils/multipliers';
import { SONGLIST_OVERRIDE_OPTIONS } from '../utils/songlistOverrides';
import { useNavigate } from 'react-router-dom';
import { useScores } from './ScoresContext.jsx';
import { useGroups } from './GroupsContext.jsx';
import { SettingsContext } from './SettingsContext.jsx';
import { storage, expandStoragePayload } from '../utils/remoteStorage.js';

export const AuthContext = createContext();

function normalizeScoresPayload(raw) {
  if (!raw) return null;
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const singleSource = value.single && typeof value.single === 'object'
    ? value.single
    : (!value.double && typeof value === 'object' ? value : {});
  const doubleSource = value.double && typeof value.double === 'object' ? value.double : {};
  return {
    single: { ...singleSource },
    double: { ...doubleSource },
  };
}

function countScoreEntries(scores) {
  if (!scores || typeof scores !== 'object') return 0;
  const single = scores.single && typeof scores.single === 'object' ? scores.single : {};
  const double = scores.double && typeof scores.double === 'object' ? scores.double : {};
  return Object.keys(single).length + Object.keys(double).length;
}

function getLocalScoresRaw(email) {
  if (typeof window === 'undefined') return null;
  const candidates = [];
  if (email) {
    candidates.push(`user:${email}:ddrScores`);
  }
  candidates.push('user:unknown:ddrScores', 'anon:ddrScores', 'ddrScores');
  for (const key of candidates) {
    try {
      const value = window.localStorage.getItem(key);
      if (value) return value;
    } catch (_e) {
      void _e;
    }
  }
  return null;
}

function choosePreferredScores(data) {
  const serverRaw = data?.ddrScores ?? data?.scores ?? null;
  const serverNormalized = normalizeScoresPayload(serverRaw);
  const serverCount = countScoreEntries(serverNormalized);

  const localRaw = getLocalScoresRaw(data?.email);
  const localNormalized = normalizeScoresPayload(localRaw);
  const localCount = countScoreEntries(localNormalized);

  if (localNormalized && localCount > serverCount) {
    return {
      parsed: localNormalized,
      serialized: JSON.stringify(localNormalized),
      source: 'local',
    };
  }

  if (serverNormalized) {
    const serialized = typeof serverRaw === 'string'
      ? serverRaw
      : JSON.stringify(serverNormalized);
    return {
      parsed: serverNormalized,
      serialized,
      source: 'server',
    };
  }

  return { parsed: null, serialized: null, source: null };
}

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
      const expanded = expandStoragePayload(data);
      setUser(u => ({ email: expanded.email || data.email || u?.email || '' }));
      const { parsed: preferredScores, serialized: serializedScores, source: scoreSource } = choosePreferredScores(expanded);
      if (preferredScores) {
        setScores(preferredScores);
        if (scoreSource === 'local') {
          try {
            console.warn('[auth] Using local scores because they contain more entries than the server copy.');
          } catch (_e) {
            void _e;
          }
        }
      }
      // Settings (support both nested and flat payloads)
      if (expanded.settings) applySettings(expanded.settings);
      else {
        const flat = {
          targetBPM: expanded.targetBPM,
          multiplierMode: expanded.multiplierMode,
          theme: expanded.theme,
          playStyle: expanded.playStyle,
          showLists: expanded.showLists,
          showRankedRatings: expanded.showRankedRatings,
          songlistOverride: expanded.songlistOverride,
        };
        applySettings(flat);
      }
      // Prime remote storage sync state now that we’re authenticated
      try {
        // storage is already statically imported; just refresh
        const storagePayload = { ...expanded };
        if (serializedScores != null) {
          storagePayload.ddrScores = serializedScores;
        } else if (expanded.ddrScores && typeof expanded.ddrScores !== 'string') {
          storagePayload.ddrScores = JSON.stringify(expanded.ddrScores);
        } else if (expanded.scores && typeof expanded.scores !== 'string') {
          storagePayload.ddrScores = JSON.stringify(expanded.scores);
        }
        storage.hydrateFrom(storagePayload);
        // Hydrate groups from server into context
        try {
          const raw = storage.getItem('groups');
          const parsed = raw ? JSON.parse(raw) : [];
          setGroups(Array.isArray(parsed) ? parsed : []);
          setActiveGroup('All');
        } catch { /* noop */ }
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






