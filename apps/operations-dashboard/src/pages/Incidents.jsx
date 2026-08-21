import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock, RefreshCw, CheckCircle2, Plus, X } from 'lucide-react';
import { api } from '../api.js';

function fmtUnix(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const SEV_BADGE = { sev1: 'badge-red', sev2: 'badge-orange', sev3: 'badge-blue' };
const SEV_LABEL = { sev1: 'SEV1 · Outage', sev2: 'SEV2 · Degraded', sev3: 'SEV3 · Minor' };
const STATUS_BADGE = { open: 'badge-red', monitoring: 'badge-orange', resolved: 'badge-green' };
// Mirrors the server's allowed transitions: open ↔ monitoring, either → resolved.
const NEXT_STATUS = { open: ['monitoring', 'resolved'], monitoring: ['open', 'resolved'], resolved: [] };
const STATUS_ACTION_LABEL = { monitoring: 'Monitor', resolved: 'Resolve', open: 'Reopen' };

export default function Incidents({ refreshTick = 0 }) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  // Background ticks re-fetch without the spinner so open modals and
  // half-filled forms are undisturbed.
  useEffect(() => { load(refreshTick > 0); }, [refreshTick]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load(background = false) {
    if (!background) setLoading(true);
    setError('');
    try {
      setIncidents(await api.getIncidents());
    } catch (e) {
      setError(e.message || 'Unable to load incidents');
    } finally {
      if (!background) setLoading(false);
    }
  }

  async function transition(inc, status) {
    setActionError('');
    try {
      const updated = await api.patchIncident(inc.id, { status });
      setIncidents(prev => prev.map(i => i.id === inc.id ? updated : i));
    } catch (e) {
      if (e.code === 'invalid_transition') {
        setActionError('That status change is no longer valid — refreshing the list.');
        load();
      } else {
        setActionError(e.message || 'Failed to update incident.');
      }
    }
  }

  const open = incidents.filter(i => i.status !== 'resolved').length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Incidents</h2>
          <p>{open > 0 ? `${open} active incident${open > 1 ? 's' : ''}` : 'No active incidents'} · SEV1/SEV2 downtime feeds the uptime figure on Health</p>
        </div>
        <div className="header-right">
          <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={14} /> Refresh</button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={15} /> Open incident</button>
        </div>
      </div>

      {open > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 16px', background: 'var(--error-bg)', border: '1px solid #f5c6c6', borderRadius: 'var(--r-md)', marginBottom: 20, color: 'var(--error)', fontSize: 13.5, fontWeight: 600 }}>
          <AlertTriangle size={16} /> {open} active incident{open > 1 ? 's require' : ' requires'} attention
        </div>
      )}

      {actionError && <div className="alert alert-error">{actionError}</div>}

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
                <tr><th>Incident</th><th>Service</th><th>Severity</th><th>Status</th><th>Opened</th><th>Resolved</th><th /></tr>
              </thead>
              <tbody>
                {incidents.map(inc => (
                  <tr key={inc.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{inc.title}</div>
                      {inc.detail && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{inc.detail}</div>}
                      {inc.owner && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>Owner: {inc.owner}</div>}
                    </td>
                    <td>{inc.service || '—'}</td>
                    <td><span className={`badge ${SEV_BADGE[inc.severity] || 'badge-grey'}`}>{inc.severity || '—'}</span></td>
                    <td><span className={`badge ${STATUS_BADGE[inc.status] || 'badge-grey'}`}>{inc.status}</span></td>
                    <td className="font-mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtUnix(inc.openedAt)}</td>
                    <td className="font-mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtUnix(inc.resolvedAt)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {(NEXT_STATUS[inc.status] || []).map(next => (
                        <button
                          key={next}
                          className={`btn btn-sm ${next === 'resolved' ? 'btn-primary' : 'btn-ghost'}`}
                          style={{ marginLeft: 6 }}
                          onClick={() => transition(inc, next)}
                        >
                          {STATUS_ACTION_LABEL[next]}
                        </button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateIncidentModal
          onClose={() => setShowCreate(false)}
          onCreated={inc => { setIncidents(prev => [inc, ...prev]); setShowCreate(false); }}
        />
      )}
    </div>
  );
}

function CreateIncidentModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ severity: 'sev3', title: '', service: '', detail: '', owner: '' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setSaving(true);
    try {
      const inc = await api.createIncident({
        severity: form.severity,
        title: form.title.trim(),
        ...(form.service.trim() ? { service: form.service.trim() } : {}),
        ...(form.detail.trim() ? { detail: form.detail.trim() } : {}),
        ...(form.owner.trim() ? { owner: form.owner.trim() } : {}),
      });
      onCreated(inc);
    } catch (e2) {
      setErr(e2.message || 'Failed to open incident.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3>Open incident</h3>
          <button className="btn-icon" aria-label="Close" onClick={onClose} disabled={saving}><X size={16} /></button>
        </div>
        <div className="modal-body">
          {err && <div className="alert alert-error">{err}</div>}
          <form id="incident-form" onSubmit={submit}>
            <div className="field">
              <label>Severity</label>
              <select value={form.severity} onChange={e => set('severity', e.target.value)}>
                {Object.entries(SEV_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Title</label>
              <input value={form.title} onChange={e => set('title', e.target.value)} required minLength={3} maxLength={200} placeholder="e.g. API latency spike on appointment booking" />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Service <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                <input value={form.service} onChange={e => set('service', e.target.value)} maxLength={100} placeholder="api-gateway" />
              </div>
              <div className="field">
                <label>Owner <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                <input value={form.owner} onChange={e => set('owner', e.target.value)} maxLength={200} placeholder="defaults to you" />
              </div>
            </div>
            <div className="field">
              <label>Detail <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
              <textarea value={form.detail} onChange={e => set('detail', e.target.value)} rows={3} maxLength={2000} placeholder="What is impacted, current symptoms, mitigation underway…" />
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button form="incident-form" type="submit" className="btn btn-primary" disabled={saving || form.title.trim().length < 3}>
            {saving ? 'Opening…' : 'Open incident'}
          </button>
        </div>
      </div>
    </div>
  );
}
