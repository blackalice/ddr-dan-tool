import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useUser } from './contexts/UserContext.jsx';
import './Auth.css';

const Register = () => {
  const { register } = useUser();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await register(username, password);
    if (result.success) {
      setMessage('Registration successful.');
      navigate('/settings');
    } else {
      setMessage(result.message || 'Registration failed');
    }
  };

  return (
    <div className="app-container">
      <div className="auth-content">
        <h2>Register</h2>
        <form onSubmit={handleSubmit} className="auth-form">
          <input
            className="settings-input"
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="settings-input"
            type="password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="settings-button" type="submit">Register</button>
        </form>
        {message && <p className="auth-message">{message}</p>}
        <p className="auth-link">Already have an account? <Link to="/login">Login</Link></p>
      </div>
    </div>
  );
};

export default Register;
