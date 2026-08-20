import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, FlaskConical, Pill, MessageSquare, Clock, ChevronRight, AlertCircle } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

function fmt(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

// Lab order lifecycle from the API: ordered → in-lab → resulted → reviewed (or cancelled).
const LAB_BADGE = {
  ordered: ['badge-grey', 'Ordered'],
  'in-lab': ['badge-blue', 'In Lab'],
  resulted: ['badge-orange', 'Resulted'],
  reviewed: ['badge-green', 'Reviewed'],
  cancelled: ['badge-red', 'Cancelled'],
};
function labBadge(status) {
  const [cls, label] = LAB_BADGE[status] || ['badge-grey', status || 'Unknown'];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default function Dashboard() {
  const { user, setNotifCount } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState({ appts: [], labs: [], rxs: [], notifs: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [appts, labs, notifs] = await Promise.all([
          api.getAppointments({ upcoming: true }),
          user?.patientId ? api.getLabs(user.patientId) : Promise.resolve([]),
          api.getNotifications(),
        ]);
        const rxs = user?.patientId ? await api.getPrescriptions(user.patientId, true) : [];
        const unread = notifs.filter(n => !n.readAt).length;
        setNotifCount(unread);
        setData({ appts, labs, rxs, notifs });
      } catch (e) {
        setError(e.message || 'Failed to load your dashboard.');
      } finally { setLoading(false); }
    }
    load();
  }, [user]);

  if (loading) return <div className="loading"><Clock size={18} className="spin" /> Loading your care space…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  const upcomingAppts = data.appts.slice(0, 3);
  const recentLabs = data.labs.slice(0, 3);
  const activeRx = data.rxs.slice(0, 4);
  const unreadNotifs = data.notifs.filter(n => !n.readAt).slice(0, 3);

  const statusBadge = s => {
    if (s === 'scheduled') return <span className="badge badge-teal">Scheduled</span>;
    if (s === 'checked-in') return <span className="badge badge-blue">Checked In</span>;
    if (s === 'in-progress') return <span className="badge badge-orange">In Progress</span>;
    if (s === 'completed') return <span className="badge badge-green">Completed</span>;
    return <span className="badge badge-grey">{s}</span>;
  };

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, var(--teal-900), var(--teal-700))', borderRadius: 'var(--r-lg)', padding: '24px 28px', marginBottom: 24, color: '#fff' }}>
        <p style={{ opacity: .7, fontSize: 13, marginBottom: 4 }}>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},</p>
        <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 24, fontWeight: 700, marginBottom: 12 }}>{user?.name || 'Patient'}</h2>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ opacity: .65, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Upcoming appointments</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 500 }}>{upcomingAppts.length}</div>
          </div>
          <div>
            <div style={{ opacity: .65, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Active prescriptions</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 500 }}>{activeRx.length}</div>
          </div>
          <div>
            <div style={{ opacity: .65, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Unread notifications</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 500 }}>{unreadNotifs.length}</div>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        {/* Upcoming Appointments */}
        <div className="card">
          <div className="card-header">
            <h3><Calendar size={15} style={{ marginRight: 6, verticalAlign: 'middle', color: 'var(--teal-700)' }} />Upcoming Appointments</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/appointments')}>View all <ChevronRight size={14} /></button>
          </div>
          <div className="card-body" style={{ padding: '0 20px' }}>
            {upcomingAppts.length === 0 ? (
              <div className="empty-state" style={{ padding: '30px 0' }}><p>No upcoming appointments</p></div>
            ) : upcomingAppts.map(a => (
              <div key={a.id} className="appt-item">
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{fmt(a.scheduledAt)}</div>
                  <div className="appt-time">{fmtTime(a.scheduledAt)}</div>
                </div>
                <div className="appt-info">
                  <div className="appt-title">{a.type || 'Consultation'}</div>
                  <div className="appt-sub">{a.clinicianName || 'Dr. —'} · {a.department || '—'}</div>
                </div>
                {statusBadge(a.status)}
              </div>
            ))}
          </div>
        </div>

        {/* Recent Labs */}
        <div className="card">
          <div className="card-header">
            <h3><FlaskConical size={15} style={{ marginRight: 6, verticalAlign: 'middle', color: 'var(--teal-700)' }} />Recent Lab Results</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/labs')}>View all <ChevronRight size={14} /></button>
          </div>
          <div className="card-body" style={{ padding: '0 20px' }}>
            {recentLabs.length === 0 ? (
              <div className="empty-state" style={{ padding: '30px 0' }}><p>No lab results yet</p></div>
            ) : recentLabs.map(l => (
              <div key={l.id} className="lab-result-row">
                <div className="lab-name">
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{l.testName}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{fmt(l.reportedAt || l.orderedAt)}</div>
                </div>
                {labBadge(l.status)}
              </div>
            ))}
          </div>
        </div>

        {/* Active Prescriptions */}
        <div className="card">
          <div className="card-header">
            <h3><Pill size={15} style={{ marginRight: 6, verticalAlign: 'middle', color: 'var(--teal-700)' }} />Active Prescriptions</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/prescriptions')}>View all <ChevronRight size={14} /></button>
          </div>
          <div className="card-body" style={{ padding: '0 20px' }}>
            {activeRx.length === 0 ? (
              <div className="empty-state" style={{ padding: '30px 0' }}><p>No active prescriptions</p></div>
            ) : activeRx.map(rx => (
              <div key={rx.id} className="appt-item">
                <div className="appt-info">
                  <div className="appt-title">{rx.drugName}</div>
                  <div className="appt-sub">{rx.dose} · {rx.frequency} · {rx.route}</div>
                </div>
                <span className="badge badge-green">Active</span>
              </div>
            ))}
          </div>
        </div>

        {/* Notifications */}
        <div className="card">
          <div className="card-header">
            <h3><AlertCircle size={15} style={{ marginRight: 6, verticalAlign: 'middle', color: 'var(--teal-700)' }} />Notifications</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/notifications')}>View all <ChevronRight size={14} /></button>
          </div>
          <div className="card-body" style={{ padding: '0 20px' }}>
            {unreadNotifs.length === 0 ? (
              <div className="empty-state" style={{ padding: '30px 0' }}><p>All caught up!</p></div>
            ) : unreadNotifs.map(n => (
              <div key={n.id} className="appt-item">
                <div className="appt-info">
                  <div className="appt-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {!n.readAt && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--teal-500)', display: 'inline-block' }} />}
                    {n.title}
                  </div>
                  <div className="appt-sub">{n.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <button className="btn btn-primary" onClick={() => navigate('/appointments')}>
        <Calendar size={15} /> Book New Appointment
      </button>
    </div>
  );
}
