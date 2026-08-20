import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock, RefreshCw, CheckCircle2 } from 'lucide-react';
import { api } from '../api.js';

function fmt(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const SEV_BADGE = { critical: 'badge-red', high: 'badge-orange', medium: 'badge-blue', low: 'badge-grey' };
const STATUS_BADGE = { open: 'badge-red', investigating: 'badge-orange', resolved: 'badge-green', closed: 'badge-grey' };

export default function Incidents() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setIncidents(await api.getIncidents());
    } catch (e) {
      setError(e.message || 'Unable to load incidents');
    } finally {
      setLoading(false);
    }
  }

  const open = incidents.filter(i => i.status === 'open' || i.status === 'investigating').length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Incidents</h2>
          <p>{open > 0 ? `${open} active incident${open > 1 ? 's' : ''}` : 'No active incidents'}</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={14} /> Refresh</button>
      </div>

      {open > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 16px', background: 'var(--error-bg)', border: '1px solid #f5c6c6', borderRadius: 'var(--r-md)', marginBottom: 20, color: 'var(--error)', fontSize: 13.5, fontWeight: 600 }}>
          <AlertTriangle size={16} /> {open} active incident{open > 1 ? 's' : ''} require attention
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="loading"><Clock size={16} className="spin" /> Loading…</div>
        ) : error ? (
          <div className="empty-state">
            <AlertTriangle size={40} style={{ opacity: .2 }} />
            <p style={{ marginTop: 12, fontSize: 15, fontWeight: 600 }}>Could not load incidents</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{error}</p>
          </div>
        ) : incidents.length === 0 ? (
          <div className="empty-state">
            <CheckCircle2 size={40} style={{ opacity: .25, color: 'var(--success)' }} />
            <p style={{ marginTop: 12, fontSize: 15, fontWeight: 600 }}>No incidents recorded</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>All systems are running smoothly.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Incident</th><th>Service</th><th>Severity</th><th>Status</th><th>Started</th><th>Resolved</th></tr>
              </thead>
              <tbody>
                {incidents.map(inc => (
                  <tr key={inc.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{inc.title}</div>
                      {inc.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{inc.description}</div>}
                    </td>
                    <td>{inc.service || '—'}</td>
                    <td><span className={`badge ${SEV_BADGE[inc.severity] || 'badge-grey'}`}>{inc.severity || '—'}</span></td>
                    <td><span className={`badge ${STATUS_BADGE[inc.status] || 'badge-grey'}`}>{inc.status}</span></td>
                    <td className="font-mono" style={{ fontSize: 12 }}>{fmt(inc.startedAt)}</td>
                    <td className="font-mono" style={{ fontSize: 12 }}>{fmt(inc.resolvedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
