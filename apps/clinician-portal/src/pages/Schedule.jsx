import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, CheckCircle, PlayCircle, XCircle, UserCheck, ChevronRight } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

function fmtTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const TRANSITIONS = {
  'scheduled':   [{ to: 'checked-in', label: 'Check in', icon: UserCheck, cls: 'btn-secondary' }],
  'checked-in':  [{ to: 'in-progress', label: 'Start', icon: PlayCircle, cls: 'btn-primary' }],
  'in-progress': [{ to: 'completed', label: 'Complete', icon: CheckCircle, cls: 'btn-success' }, { to: 'no-show', label: 'No-show', icon: XCircle, cls: 'btn-ghost' }],
};
const STATUS_BADGE = { 'scheduled': 'badge-teal', 'checked-in': 'badge-blue', 'in-progress': 'badge-orange', 'completed': 'badge-green', 'cancelled': 'badge-red', 'no-show': 'badge-grey' };

export default function Schedule() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [appts, setAppts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    api.getAppointments({ clinicianId: user?.clinicianId, date: today })
      .then(setAppts)
      .catch(e => setError(e.message || 'Failed to load schedule.'))
      .finally(() => setLoading(false));
  }, [user]);

  async function transition(id, status) {
    setActionError('');
    try {
      const updated = await api.patchAppointment(id, { status });
      setAppts(prev => prev.map(a => a.id === id ? { ...a, status: updated.status } : a));
    } catch (e) { setActionError(e.message || 'Failed to update appointment.'); }
  }

  const stats = {
    total: appts.length,
    completed: appts.filter(a => a.status === 'completed').length,
    inProgress: appts.filter(a => a.status === 'in-progress').length,
    waiting: appts.filter(a => a.status === 'checked-in').length,
  };

  if (loading) return <div className="loading"><Clock size={16} className="spin" /> Loading schedule…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Today's Schedule</h2>
          <p>{fmtDate(new Date())}</p>
        </div>
      </div>

      {actionError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{actionError}</div>}

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">Total Today</div><div className="stat-value">{stats.total}</div></div>
        <div className="stat-card"><div className="stat-label">Completed</div><div className="stat-value" style={{color:'var(--success)'}}>{stats.completed}</div></div>
        <div className="stat-card"><div className="stat-label">In Progress</div><div className="stat-value" style={{color:'var(--warn)'}}>{stats.inProgress}</div></div>
        <div className="stat-card"><div className="stat-label">Waiting</div><div className="stat-value" style={{color:'var(--info)'}}>{stats.waiting}</div></div>
      </div>

      <div className="card">
        {appts.length === 0 ? (
          <div className="empty-state"><Clock size={40} /><p>No appointments scheduled for today</p></div>
        ) : appts.map(a => (
          <div key={a.id} className="schedule-item">
            <div className="schedule-time">{fmtTime(a.scheduledAt)}</div>
            <div className="schedule-patient">
              <div className="s-name">{a.patientName || 'Patient'}</div>
              <div className="s-meta">{a.type} · {a.durationMins || 30} min{a.notes ? ` · ${a.notes}` : ''}</div>
            </div>
            <span className={`badge ${STATUS_BADGE[a.status] || 'badge-grey'}`}>{a.status}</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {(TRANSITIONS[a.status] || []).map(({ to, label, icon: Icon, cls }) => (
                <button key={to} className={`btn ${cls} btn-sm`} onClick={() => transition(a.id, to)}>
                  <Icon size={13} /> {label}
                </button>
              ))}
              {a.patientId && (
                <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/patients/${a.patientId}`)}>
                  View <ChevronRight size={13} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
