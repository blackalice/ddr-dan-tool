import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from './contexts/AuthContext.jsx';
import './Settings.css';

const Register = () => {
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg);
      }
      await res.json();
      await login(email, password); // sets token and user
      navigate('/bpm');
    } catch (err) {
      setError(err.message || 'Registration failed');
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
                minLength={8}
              />
            </div>
          </div>
          <div className="setting-card">
            <div className="setting-text">
              <h3>Confirm Password</h3>
            </div>
            <div className="setting-control">
              <input
                type="password"
                className="settings-input"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                minLength={8}
              />
            </div>
          </div>
          {error && <div className="setting-text" style={{color:'red'}}>{error}</div>}
          <button type="submit" className="settings-button">Register</button>
        </form>
      </div>
    </div>
  );
};

export default Register;
