/* eslint react-refresh/only-export-components: off */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { SettingsContext } from './SettingsContext.jsx';
import { GroupsContext } from './GroupsContext.jsx';

export const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('authToken'));
  const [user, setUser] = useState(null);

  const settings = useContext(SettingsContext);
  const groupsCtx = useContext(GroupsContext);

  const loadUser = async (t) => {
    try {
      const res = await fetch('/api/user', {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      setUser(data.user);
      if (data.settings) {
        for (const [k, v] of Object.entries(data.settings)) {
          if (settings[`set${k.charAt(0).toUpperCase() + k.slice(1)}`]) {
            settings[`set${k.charAt(0).toUpperCase() + k.slice(1)}`](v);
          }
        }
      }
      if (data.lists) {
        groupsCtx.setGroups(data.lists);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (token) {
      loadUser(token);
    }
  }, [token, loadUser]);

  useEffect(() => {
    if (!token) return;
    const payload = {
      settings: {
        targetBPM: settings.targetBPM,
        multiplierMode: settings.multiplierMode,
        theme: settings.theme,
        playStyle: settings.playStyle,
        showLists: settings.showLists,
        showRankedRatings: settings.showRankedRatings,
        songlistOverride: settings.songlistOverride,
      },
    };
    fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }, [token, settings.targetBPM, settings.multiplierMode, settings.theme, settings.playStyle, settings.showLists, settings.showRankedRatings, settings.songlistOverride]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/lists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ lists: groupsCtx.groups }),
    }).catch(() => {});
  }, [token, groupsCtx.groups]);

  const login = async (username, password) => {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      const data = await res.json();
      setToken(data.token);
      localStorage.setItem('authToken', data.token);
      await loadUser(data.token);
      return true;
    }
    return false;
  };

  const register = async (username, email, password) => {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
    if (res.ok) {
      const data = await res.json();
      setToken(data.token);
      localStorage.setItem('authToken', data.token);
      await loadUser(data.token);
      return true;
    }
    return false;
  };

  const logout = async () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('authToken');
  };

  return (
    <UserContext.Provider value={{ user, token, login, logout, register }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
