import React, { useEffect, useState } from 'react';
import { Users, Stethoscope, Calendar, Activity, Clock } from 'lucide-react';
import { api } from '../api.js';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.getStats(), api.getHealth()])
      .then(([s, h]) => { setStats(s); setHealth(h); })
      .catch(e => setError(e.message || 'Failed to load platform overview.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><Clock size={16} className="spin" /> Loading…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <div className="page-header">
        <div><h2>Platform Overview</h2><p>Live snapshot of PulseWard HMS</p></div>
      </div>

      <div className="stats-grid">
        {[
          { label: 'Total Users', value: stats?.users ?? '—', icon: Users, accent: true },
          { label: 'Clinicians', value: stats?.clinicians ?? '—', icon: Stethoscope },
          { label: 'Patients', value: stats?.patients ?? '—', icon: Users },
          { label: "Today's Appointments", value: stats?.appointmentsToday ?? '—', icon: Calendar },
          { label: 'Pending Labs', value: stats?.pendingLabs ?? '—', icon: Activity },
          { label: 'Active Tenants', value: stats?.tenants ?? 1, icon: Activity },
        ].map(({ label, value, icon: Icon, accent }) => (
          <div key={label} className={`stat-card ${accent ? 'accent' : ''}`}>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-header"><h3>Quick Actions</h3></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <a href="/users" className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}><Users size={15} /> Manage users</a>
            <a href="/clinicians" className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}><Stethoscope size={15} /> Manage clinicians</a>
            <a href="/audit" className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}><Activity size={15} /> View audit log</a>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>System Status</h3></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(health?.services || []).length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>Status unavailable.</p>
            ) : health.services.map(s => {
              const healthy = s.status === 'healthy';
              return (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: healthy ? 'var(--success)' : 'var(--error)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13.5 }}>{s.name}</span>
                  <span className={`badge ${healthy ? 'badge-green' : 'badge-red'}`} style={{ marginLeft: 'auto' }}>{s.status}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
