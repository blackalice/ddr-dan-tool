import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useUser } from './contexts/UserContext.jsx';
import './Auth.css';

const Login = () => {
  const { login } = useUser();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await login(username.trim(), password.trim());
    if (result.success) {
      setMessage('Login successful.');
      navigate('/settings');
    } else {
      setMessage(result.message || 'Login failed');
    }
  };

  return (
    <div className="app-container">
      <div className="auth-content">
        <h2>Login</h2>
        <form onSubmit={handleSubmit} className="auth-form">
          <input
            className="settings-input"
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
          <input
            className="settings-input"
            type="password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button className="settings-button" type="submit">Login</button>
        </form>
        {message && <p className="auth-message">{message}</p>}
        <p className="auth-link">Don't have an account? <Link to="/register">Register</Link></p>
      </div>
    </div>
  );
};

export default Login;
