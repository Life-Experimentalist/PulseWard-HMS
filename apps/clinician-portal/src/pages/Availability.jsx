import React, { useEffect, useState } from 'react';
import { Clock, Plus, Trash2, CalendarOff, AlertTriangle, Inbox } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

function fmtRange(startsAt, endsAt) {
  const opts = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };
  return new Date(startsAt * 1000).toLocaleString('en-IN', opts) + ' → ' +
    new Date(endsAt * 1000).toLocaleString('en-IN', opts);
}
function fmtAppt(ts) {
  return new Date(ts * 1000).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const KIND_BADGE = { leave: 'badge-grey', holiday: 'badge-blue', training: 'badge-teal', emergency: 'badge-red' };
const QUEUE_BADGE = { open: 'badge-orange', resolved: 'badge-green' };

export default function Availability() {
  const { user } = useAuth();
  const [blocks, setBlocks] = useState([]);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  // Appointments displaced by the block just created, awaiting a decision each.
  const [affected, setAffected] = useState([]);

  async function load() {
    try {
      const [b, q] = await Promise.all([api.getAvailability(), api.getReassignments('open')]);
      setBlocks(b);
      setQueue(q.filter(item => item.clinicianId === user?.clinicianId));
    } catch (e) {
      setError(e.message || 'Failed to load availability.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [user]);

  function onCreated({ block, affectedAppointments }) {
    setBlocks(prev => [...prev, block].sort((a, b) => a.startsAt - b.startsAt));
    setAffected(affectedAppointments.map(a => ({ ...a, queued: false })));
    setShowCreate(false);
  }

  async function removeBlock(id) {
    setActionError('');
    try {
      await api.deleteBlock(id);
      setBlocks(prev => prev.filter(b => b.id !== id));
    } catch (e) { setActionError(e.message || 'Failed to remove block.'); }
  }

  async function queueAppt(appt) {
    setActionError('');
    try {
      const item = await api.queueReassignment({ appointmentId: appt.id, reason: 'Displaced by availability block' });
      setAffected(prev => prev.map(a => a.id === appt.id ? { ...a, queued: true } : a));
      setQueue(prev => [...prev, item]);
    } catch (e) {
      if (e.code === 'conflict') {
        setAffected(prev => prev.map(a => a.id === appt.id ? { ...a, queued: true } : a));
      } else {
        setActionError(e.message || 'Failed to queue appointment.');
      }
    }
  }

  if (loading) return <div className="loading"><Clock size={16} className="spin" /> Loading availability…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  const now = Math.floor(Date.now() / 1000);
  const upcoming = blocks.filter(b => b.endsAt >= now);
  const past = blocks.filter(b => b.endsAt < now);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Availability</h2>
          <p>Block out leave, holidays, training, or emergencies — booking is closed inside a block</p>
        </div>
        <div className="header-right">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={15} /> Block time</button>
        </div>
      </div>

      {actionError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{actionError}</div>}

      {affected.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderColor: 'var(--warn)' }}>
          <div className="card-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} style={{ color: 'var(--warn)' }} />
              {affected.length} appointment{affected.length > 1 ? 's' : ''} fall inside the new block
            </h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setAffected([])}>Dismiss</button>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {affected.map(a => (
              <div key={a.id} className="schedule-item">
                <div className="schedule-time">{fmtAppt(a.startsAt)}</div>
                <div className="schedule-patient">
                  <div className="s-name">{a.patientName || 'Patient'}</div>
                  <div className="s-meta">{a.type} · {a.durationMins || 30} min</div>
                </div>
                {a.queued ? (
                  <span className="badge badge-orange">Queued for front desk</span>
                ) : (
                  <button className="btn btn-secondary btn-sm" onClick={() => queueAppt(a)}>
                    <Inbox size={13} /> Queue for reassignment
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><h3>Upcoming blocks</h3></div>
        {upcoming.length === 0 ? (
          <div className="empty-state"><CalendarOff size={40} /><p>No upcoming blocks — your calendar is fully open</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>When</th><th>Kind</th><th>Reason</th><th /></tr></thead>
              <tbody>
                {upcoming.map(b => (
                  <tr key={b.id}>
                    <td>{fmtRange(b.startsAt, b.endsAt)}</td>
                    <td><span className={`badge ${KIND_BADGE[b.kind] || 'badge-grey'}`}>{b.kind}</span></td>
                    <td>{b.reason || <span className="text-muted">—</span>}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => removeBlock(b.id)} aria-label="Remove block">
                        <Trash2 size={13} /> Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><h3>Reassignment queue</h3><span className="text-muted" style={{ fontSize: 12.5 }}>Resolved by the front desk or an admin</span></div>
        {queue.length === 0 ? (
          <div className="empty-state"><Inbox size={40} /><p>No appointments waiting for reassignment</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Appointment</th><th>Patient</th><th>Reason</th><th>Status</th></tr></thead>
              <tbody>
                {queue.map(item => (
                  <tr key={item.id}>
                    <td>{fmtAppt(item.startsAt)}</td>
                    <td>{item.patientName}{item.mrn ? <span className="text-muted font-mono" style={{ fontSize: 12 }}> · {item.mrn}</span> : null}</td>
                    <td>{item.reason || <span className="text-muted">—</span>}</td>
                    <td><span className={`badge ${QUEUE_BADGE[item.status] || 'badge-grey'}`}>{item.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {past.length > 0 && (
        <div className="card">
          <div className="card-header"><h3>Past blocks</h3></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>When</th><th>Kind</th><th>Reason</th></tr></thead>
              <tbody>
                {past.map(b => (
                  <tr key={b.id}>
                    <td>{fmtRange(b.startsAt, b.endsAt)}</td>
                    <td><span className={`badge ${KIND_BADGE[b.kind] || 'badge-grey'}`}>{b.kind}</span></td>
                    <td>{b.reason || <span className="text-muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && <CreateBlockModal onClose={() => setShowCreate(false)} onCreated={onCreated} />}
    </div>
  );
}

function CreateBlockModal({ onClose, onCreated }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [kind, setKind] = useState('leave');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    const startsAt = Math.floor(new Date(start).getTime() / 1000);
    const endsAt = Math.floor(new Date(end).getTime() / 1000);
    if (!startsAt || !endsAt) { setError('Both start and end are required.'); return; }
    if (endsAt <= startsAt) { setError('End must be after start.'); return; }
    setSaving(true);
    try {
      const result = await api.createBlock({ startsAt, endsAt, kind, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      onCreated(result);
    } catch (e2) {
      setError(e2.message || 'Failed to create block.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3>Block time off</h3></div>
        <div className="modal-body">
          {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
          <form id="create-block-form" onSubmit={submit}>
            <div className="field-row">
              <div className="field">
                <label>From</label>
                <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} required />
              </div>
              <div className="field">
                <label>To</label>
                <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} required />
              </div>
            </div>
            <div className="field">
              <label>Kind</label>
              <select value={kind} onChange={e => setKind(e.target.value)}>
                <option value="leave">Leave</option>
                <option value="holiday">Holiday</option>
                <option value="training">Training</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
            <div className="field">
              <label>Reason <span className="text-muted">(optional)</span></label>
              <input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} placeholder="e.g. Annual leave" />
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="create-block-form" className="btn btn-primary" disabled={saving}>
            <CalendarOff size={14} /> Block time
          </button>
        </div>
      </div>
    </div>
  );
}
