import React, { useState } from 'react';
import { useAuth } from './contexts/AuthContext.jsx';
import { Link } from 'react-router-dom';
import './Auth.css';

const SignupPage = () => {
  const { signup } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await signup(email, password);
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

