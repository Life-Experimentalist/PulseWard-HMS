import React, { useEffect, useState } from 'react';
import { ScrollText, RefreshCw, Clock } from 'lucide-react';
import { api } from '../api.js';

function fmt(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const ACTION_BADGE = {
  'create': 'badge-green', 'update': 'badge-blue', 'delete': 'badge-red',
  'login': 'badge-teal', 'logout': 'badge-grey', 'sign': 'badge-orange', 'access': 'badge-grey',
};

export default function AuditLog() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(50);

  useEffect(() => { load(); }, [limit]);

  async function load() {
    setLoading(true);
    setError('');
    api.getAuditLog(limit).then(setEvents)
      .catch(e => setError(e.message || 'Failed to load audit log.'))
      .finally(() => setLoading(false));
  }

  return (
    <div>
      <div className="page-header">
        <div><h2>Audit Log</h2><p>Append-only record of all platform events</p></div>
        <div className="header-right">
          <select value={limit} onChange={e => setLimit(+e.target.value)} style={{ padding: '7px 10px', border: '1.5px solid var(--border)', borderRadius: 'var(--r-sm)', fontFamily: 'var(--font-body)', fontSize: 13, background: 'var(--surface)' }}>
            <option value={50}>Last 50</option>
            <option value={100}>Last 100</option>
            <option value={200}>Last 200</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={14} /> Refresh</button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><Clock size={16} className="spin" /> Loading…</div>
        ) : error ? (
          <div className="alert alert-error" style={{ margin: 16 }}>{error}</div>
        ) : events.length === 0 ? (
          <div className="empty-state"><ScrollText size={40}/><p>No audit events</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Resource</th><th>Resource ID</th><th>IP</th></tr>
              </thead>
              <tbody>
                {events.map(e => (
                  <tr key={e.id}>
                    <td><span className="font-mono" style={{ fontSize: 12 }}>{fmt(e.createdAt)}</span></td>
                    <td style={{ fontSize: 12 }}>{e.actorId || '—'}</td>
                    <td><span className={`badge ${ACTION_BADGE[e.action] || 'badge-grey'}`}>{e.action}</span></td>
                    <td style={{ fontWeight: 600 }}>{e.resource}</td>
                    <td className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.resourceId || '—'}</td>
                    <td className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.ipAddress || '—'}</td>
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
