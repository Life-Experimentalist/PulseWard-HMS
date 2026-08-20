import React, { useEffect, useState } from 'react';
import { Bell, Check, CheckCheck, Clock } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

function fmt(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function Notifications() {
  const { setNotifCount } = useAuth();
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getNotifications().then(data => {
      setNotifs(data);
      setNotifCount(data.filter(n => !n.readAt).length);
    }).catch(e => setError(e.message || 'Failed to load notifications.')).finally(() => setLoading(false));
  }, []);

  async function markRead(id) {
    await api.markNotifRead(id).catch(() => {});
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
    setNotifCount(prev => Math.max(0, prev - 1));
  }

  async function markAll() {
    await api.markAllNotifRead().catch(() => {});
    setNotifs(prev => prev.map(n => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    setNotifCount(0);
  }

  if (loading) return <div className="loading"><Clock size={16} className="spin" /> Loading…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  const unread = notifs.filter(n => !n.readAt).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Notifications</h2>
          <p>{unread > 0 ? `${unread} unread` : 'All caught up'}</p>
        </div>
        {unread > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={markAll}><CheckCheck size={14} /> Mark all read</button>
        )}
      </div>

      <div className="card">
        {notifs.length === 0 ? (
          <div className="empty-state"><Bell size={40} /><p>No notifications</p></div>
        ) : (
          <div>
            {notifs.map(n => (
              <div key={n.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 20px',
                borderBottom: '1px solid var(--border)', background: n.readAt ? 'transparent' : 'var(--teal-50)',
                transition: 'background .2s',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', background: n.readAt ? 'transparent' : 'var(--teal-500)',
                  marginTop: 6, flexShrink: 0,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: n.readAt ? 500 : 700, fontSize: 13.5, marginBottom: 3 }}>{n.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{n.body}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>{fmt(n.createdAt)}</div>
                </div>
                {!n.readAt && (
                  <button className="btn-icon btn-sm" onClick={() => markRead(n.id)} title="Mark as read">
                    <Check size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
