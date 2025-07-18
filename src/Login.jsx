import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from './contexts/AuthContext.jsx';
import { SettingsContext } from './contexts/SettingsContext.jsx';
import './Settings.css';

const Login = () => {
  const { login } = useContext(AuthContext);
  const settingsCtx = useContext(SettingsContext);
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const applySettings = (data) => {
    if (data.targetBPM !== undefined) settingsCtx.setTargetBPM(data.targetBPM);
    if (data.multiplierMode) settingsCtx.setMultiplierMode(data.multiplierMode);
    if (data.theme) settingsCtx.setTheme(data.theme);
    if (data.playStyle) settingsCtx.setPlayStyle(data.playStyle);
    if (data.showLists !== undefined) settingsCtx.setShowLists(data.showLists);
    if (data.songlistOverride) settingsCtx.setSonglistOverride(data.songlistOverride);
    if (data.apiKey) settingsCtx.setApiKey(data.apiKey);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const token = await login(email, password);
      const res = await fetch('/api/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        applySettings(data);
      }
      navigate('/bpm');
    } catch {
      setError('Invalid credentials');
    }
  };

  return (
    <div className="app-container">
      <div className="settings-content">
        <form onSubmit={handleSubmit} className="settings-inner-container">
          <div className="setting-card">
            <div className="setting-text">
              <h3>Email</h3>
            </div>
            <div className="setting-control">
              <input
                type="email"
                className="settings-input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="setting-card">
            <div className="setting-text">
              <h3>Password</h3>
            </div>
            <div className="setting-control">
              <input
                type="password"
                className="settings-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
          </div>
          {error && <div className="setting-text" style={{color:'red'}}>{error}</div>}
          <button type="submit" className="settings-button">Login</button>
        </form>
      </div>
    </div>
  );
};

export default Login;

