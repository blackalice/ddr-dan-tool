import React, { useContext } from 'react';
import { SettingsContext } from '../contexts/SettingsContext';

const ThemeSwitcher = () => {
  const { theme, setTheme } = useContext(SettingsContext);

  const handleThemeChange = (e) => {
    setTheme(e.target.value);
  };

  return (
    <div className="setting-card">
      <div className="setting-text">
        <h3>Theme</h3>
        <p>Select a theme for the application.</p>
      </div>
      <div className="setting-control">
        <select className="settings-select" value={theme} onChange={handleThemeChange}>
          <option value="dark">Dark</option>
          <option value="dark-pink">Dark (Pink)</option>
          <option value="light">Light (Beta)</option>
          <option value="cg">CG</option>
          <option value="mhe2026">MHE2026</option>
        </select>
      </div>
    </div>
  );
};

export default ThemeSwitcher;
