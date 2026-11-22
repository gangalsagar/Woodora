import React, { useState } from 'react';
import { User, Lock, Mail, Phone, MapPin, ArrowRight, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import { apiUrl } from './apiConfig';

export default function CustomerAuthModal({ isOpen, onClose, onAuthSuccess, initialMode = 'login', returnToCheckout = false }) {
  const [mode, setMode] = useState(initialMode); // 'login' or 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'register') {
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters long.');
        }
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }

        const res = await fetch(apiUrl('/api/customer/auth/register'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            phone: phone || null,
            password,
            confirm_password: confirmPassword,
            city: city || null,
            address: address || null
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || 'Registration failed');
        }

        localStorage.setItem('woodora_customer_token', data.token);
        localStorage.setItem('woodora_customer_user', JSON.stringify(data.customer));
        onAuthSuccess(data.customer, data.token, returnToCheckout);
      } else {
        const res = await fetch(apiUrl('/api/customer/auth/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || 'Invalid email or password');
        }

        localStorage.setItem('woodora_customer_token', data.token);
        localStorage.setItem('woodora_customer_user', JSON.stringify(data.customer));
        onAuthSuccess(data.customer, data.token, returnToCheckout);
      }
    } catch (err) {
      setError(err.message || 'Authentication error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-custom-modal" onClick={onClose} style={{ zIndex: 9999 }}>
      <div 
        className="cart" 
        style={{ width: 'min(460px, 94%)', height: 'auto', maxHeight: '90vh', background: '#faf8f2', borderRadius: 4 }} 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cart-head" style={{ borderBottom: '1px solid #e7dfd1', padding: '18px 24px' }}>
          <div>
            <span style={{ fontSize: 10, letterSpacing: '0.12em', color: '#a66c43', textTransform: 'uppercase', fontWeight: 600 }}>
              {returnToCheckout ? 'Checkout Requirement' : 'Woodora Client Access'}
            </span>
            <h3 style={{ margin: '4px 0 0', fontFamily: 'Playfair Display', fontSize: 20 }}>
              {mode === 'login' ? 'Client Sign In' : 'Create Client Account'}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 18, color: '#777' }}>
            ✕
          </button>
        </div>

        {returnToCheckout && (
          <div style={{ background: '#f2eae0', padding: '10px 24px', fontSize: 12, color: '#544d42', borderBottom: '1px solid #e7dfd1' }}>
            Please sign in or register to confirm your order and track workshop fulfillment.
          </div>
        )}

        <div style={{ padding: '24px' }}>
          {error && (
            <div style={{ background: '#fdf2f2', border: '1px solid #f8d7da', color: '#9b2c2c', padding: '10px 14px', borderRadius: 2, fontSize: 12, marginBottom: 16 }}>
              <AlertCircle size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {mode === 'register' && (
              <>
                <div>
                  <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#666', marginBottom: 5 }}>
                    Full Name *
                  </label>
                  <input
                    required
                    className="admin-input"
                    placeholder="e.g. Priyanshu Sharma"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="field-row">
                  <div>
                    <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#666', marginBottom: 5 }}>
                      Phone (Optional)
                    </label>
                    <input
                      className="admin-input"
                      placeholder="+91 98..."
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#666', marginBottom: 5 }}>
                      City (Optional)
                    </label>
                    <input
                      className="admin-input"
                      placeholder="e.g. Mumbai, Bengaluru"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#666', marginBottom: 5 }}>
                    Default Delivery Address (Optional)
                  </label>
                  <input
                    className="admin-input"
                    placeholder="Street, Apartment, Locality"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
              </>
            )}

            <div>
              <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#666', marginBottom: 5 }}>
                Email Address *
              </label>
              <input
                required
                type="email"
                className="admin-input"
                placeholder="client@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className={mode === 'register' ? 'field-row' : ''}>
              <div>
                <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#666', marginBottom: 5 }}>
                  Password *
                </label>
                <input
                  required
                  type="password"
                  className="admin-input"
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {mode === 'register' && (
                <div>
                  <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#666', marginBottom: 5 }}>
                    Confirm Password *
                  </label>
                  <input
                    required
                    type="password"
                    className="admin-input"
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              )}
            </div>

            <button
              type="submit"
              className="dark-btn"
              disabled={loading}
              style={{ width: '100%', marginTop: 8, padding: '12px 16px', justifyContent: 'center' }}
            >
              {loading ? 'Authenticating...' : (mode === 'login' ? 'Sign In' : 'Create Account & Proceed')}
            </button>
          </form>

          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: '#777', borderTop: '1px solid #eee', paddingTop: 14 }}>
            {mode === 'login' ? (
              <span>
                New to Woodora?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('register'); setError(''); }}
                  style={{ background: 'none', border: 0, color: '#a66c43', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  Create an account
                </button>
              </span>
            ) : (
              <span>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(''); }}
                  style={{ background: 'none', border: 0, color: '#a66c43', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  Sign in
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
