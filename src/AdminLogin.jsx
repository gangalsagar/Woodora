import React, { useState } from 'react';
import { Lock, ArrowRight, AlertCircle, ArrowLeft } from 'lucide-react';
import { apiUrl } from './apiConfig';

export default function AdminLogin({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(apiUrl('/api/admin/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Authentication failed');
      }

      localStorage.setItem('woodora_admin_token', data.token);
      localStorage.setItem('woodora_admin_user', JSON.stringify(data.user));
      onLoginSuccess(data.user, data.token);
    } catch (err) {
      setError(err.message || 'Could not log in to the admin platform.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-screen">
      <div className="admin-login-card">
        <div className="admin-login-head">
          <span className="brand-mark">W.</span>
          <h2>Woodora Portal</h2>
          <p>BUSINESS MANAGEMENT PLATFORM</p>
        </div>

        {error && (
          <div className="admin-login-error">
            <AlertCircle size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
            {error}
          </div>
        )}

        <form className="admin-login-form" onSubmit={handleSubmit}>
          <div>
            <label>Admin Email</label>
            <input
              type="email"
              className="admin-login-input"
              required
              autoFocus
              placeholder="e.g. admin@woodora.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label>Password</label>
            <input
              type="password"
              className="admin-login-input"
              required
              placeholder="Enter secure password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="admin-login-btn" disabled={loading}>
            {loading ? 'Authenticating...' : 'Sign In to Dashboard'}
          </button>
        </form>

        <div className="admin-login-footer">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState({}, '', '/');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#a39d91' }}
          >
            <ArrowLeft size={12} /> Return to Woodora Storefront
          </a>
        </div>
      </div>
    </div>
  );
}
