import React, { useEffect, useState } from 'react';
import { Clock, Server, Database, Users, CalendarDays } from 'lucide-react';
import { api } from '../api.js';

// Map the gateway's health vocabulary ('healthy' | 'degraded' | 'down') to the
// visual state used by the service tiles.
const TILE_CLASS = { healthy: 'up', degraded: 'degraded', down: 'down' };
const DOT_COLOR = {
  healthy: 'var(--success)',
  degraded: 'var(--warn)',
  down: 'var(--error)',
};
const SERVICE_ICON = { 'api-gateway': Server };

function iconFor(name) {
  if (name.startsWith('database')) return Database;
  return SERVICE_ICON[name] || Server;
}

function fmtUptime(seconds) {
  if (seconds == null) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${seconds % 60}s`;
}

export default function Health() {
  const [services, setServices] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { services, metrics } = await api.getHealth();
        if (!alive) return;
        setServices(services);
        setMetrics(metrics);
      } catch (e) {
        if (alive) setError(e.message || 'Unable to load platform health');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const healthy = services.filter(s => s.status === 'healthy').length;
  const degraded = services.filter(s => s.status === 'degraded').length;
  const down = services.filter(s => s.status === 'down').length;

  const overallStatus = loading ? 'Checking…'
    : down > 0 ? 'Partial Outage'
    : degraded > 0 ? 'Degraded Performance'
    : 'All Systems Operational';
  const overallColor = down > 0 ? 'var(--error)' : degraded > 0 ? 'var(--warn)' : 'var(--success)';

  if (error) {
    return (
      <div className="card">
        <div className="empty-state">
          <Server size={40} style={{ opacity: .2 }} />
          <p style={{ marginTop: 12, fontSize: 15, fontWeight: 600 }}>Platform health unavailable</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{
        background: `linear-gradient(135deg, ${down > 0 ? '#3b0a0a' : degraded > 0 ? '#3b1f00' : '#0a2e1a'}, var(--teal-900))`,
        borderRadius: 'var(--r-lg)', padding: '20px 24px', marginBottom: 24, color: '#fff',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: overallColor, flexShrink: 0, boxShadow: `0 0 12px ${overallColor}` }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-head)', fontSize: 18, fontWeight: 700 }}>{overallStatus}</div>
          <div style={{ fontSize: 12, opacity: .7, marginTop: 2 }}>
            {healthy} healthy · {degraded} degraded · {down} down
          </div>
        </div>
        {metrics.uptimeSeconds != null && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 500 }}>{fmtUptime(metrics.uptimeSeconds)}</div>
            <div style={{ fontSize: 11, opacity: .6 }}>process uptime</div>
          </div>
        )}
      </div>

      <div className="stats-grid">
        <div className="stat-card green">
          <div className="stat-label">Services Healthy</div>
          <div className="stat-value">{healthy}<span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/{services.length}</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><Users size={11} style={{ verticalAlign: -1 }} /> Users</div>
          <div className="stat-value">{metrics.users ?? '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><CalendarDays size={11} style={{ verticalAlign: -1 }} /> Appointments</div>
          <div className="stat-value">{metrics.appointments ?? '—'}</div>
        </div>
        <div className={`stat-card ${degraded > 0 ? 'orange' : ''}`}>
          <div className="stat-label">Degraded</div>
          <div className="stat-value">{degraded}</div>
        </div>
      </div>

      {loading ? (
        <div className="card"><div className="loading"><Clock size={16} className="spin" /> Loading platform health…</div></div>
      ) : (
        <div className="service-grid">
          {services.map(s => {
            const Icon = iconFor(s.name);
            const tile = TILE_CLASS[s.status] || '';
            return (
              <div key={s.name} className={`service-tile ${tile}`}>
                <div className="s-name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon size={15} style={{ color: 'var(--teal-700)' }} /> {s.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: DOT_COLOR[s.status] || 'var(--text-muted)' }} />
                  <span className="s-status" style={{ color: DOT_COLOR[s.status] || 'var(--text-muted)' }}>{s.status}</span>
                </div>
                <div className="s-metrics">
                  {s.latency != null && `${s.latency}ms`}
                  {s.uptime != null && ` · ${s.uptime}% uptime`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
