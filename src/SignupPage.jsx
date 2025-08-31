import React, { useState } from 'react';
import { useAuth } from './contexts/AuthContext.jsx';
import { Link } from 'react-router-dom';
import './Auth.css';
import TurnstileWidget from './components/TurnstileWidget.jsx';

const SignupPage = () => {
  const { signup } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
  const enableTurnstile = import.meta.env.MODE === 'production' && !!siteKey;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setError('Please enter a valid email address');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      await signup(email, password, enableTurnstile ? turnstileToken : undefined);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2 className="auth-title">Sign Up</h2>
        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="auth-input"
            autoComplete="email"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="auth-input"
            autoComplete="new-password"
            required
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm Password"
            className="auth-input"
            autoComplete="new-password"
            required
          />
          <button type="submit" className="settings-button auth-button" disabled={loading}>
            {loading ? 'Signing up...' : 'Sign Up'}
          </button>
          {enableTurnstile && (
            <div style={{ marginTop: '12px' }}>
              <TurnstileWidget siteKey={siteKey} onVerify={setTurnstileToken} />
            </div>
          )}
          {error && <p className="auth-error">{error}</p>}
        </form>
        <div className="auth-switch">
          <span>Already have an account? <Link to="/login">Log in</Link></span>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;

