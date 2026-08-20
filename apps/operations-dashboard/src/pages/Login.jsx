import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const data = await api.login(form.email, form.password);
      if (!['admin', 'ops'].includes(data.user.role)) {
        await api.logout();
        throw new Error('Operations access is limited to admin and ops accounts.');
      }
      login(data.user);
      navigate('/');
    } catch (e) {
      setErr(e.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-mark-lg"><ShieldCheck size={22} /></div>
          <div className="brand">PulseWard<span>Operations Dashboard</span></div>
        </div>
        <h2>Operations sign in</h2>
        <p className="sub">Live platform health and incident monitoring.</p>
        {err && <div className="alert alert-error">{err}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="ops-email">Email</label>
            <input id="ops-email" type="email" autoComplete="username" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="admin@pulseward.com" required />
          </div>
          <div className="field">
            <label htmlFor="ops-password">Password</label>
            <input id="ops-password" type="password" autoComplete="current-password" value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="••••••••" required />
          </div>
          <button type="submit" className="btn btn-primary btn-full" style={{ marginTop: 4 }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="auth-demo">
          <strong>Demo:</strong> admin@pulseward.com / Admin@123
        </div>
      </div>
    </div>
  );
}
