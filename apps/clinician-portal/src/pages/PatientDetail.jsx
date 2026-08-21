import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, PenLine, FlaskConical, Pill, MessageSquare, Stethoscope, X, CheckCircle, Activity, AlertTriangle, FilePlus2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

function fmt(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtUnix(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const RX_BADGE = { active: 'badge-teal', dispensed: 'badge-blue', completed: 'badge-green', discontinued: 'badge-red' };
// Mirrors the API's prescription state machine; discontinuing demands a reason.
const RX_ACTIONS = {
  active: [{ to: 'dispensed', label: 'Dispense' }, { to: 'completed', label: 'Complete' }],
  dispensed: [{ to: 'completed', label: 'Complete' }],
};

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

export default function PatientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [patient, setPatient] = useState(null);
  const [notes, setNotes] = useState([]);
  const [labs, setLabs] = useState([]);
  const [rxs, setRxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState(null);

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    Promise.all([
      api.getPatient(id),
      api.getNotes(id),
      api.getLabs(id),
      api.getPrescriptions(id),
    ]).then(([p, n, l, r]) => {
      setPatient(p); setNotes(n); setLabs(l); setRxs(r);
    }).catch(e => setLoadError(e.message || 'Failed to load patient record.'))
      .finally(() => setLoading(false));
  }, [id]);

  async function signNote(noteId) {
    setActionError('');
    try {
      await api.signNote(noteId);
      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, signedAt: new Date().toISOString() } : n));
    } catch (e) { setActionError(e.message || 'Failed to sign note.'); }
  }

  async function transitionRx(rx, status, reason) {
    setActionError('');
    try {
      const updated = await api.patchPrescription(rx.id, { status, ...(reason ? { reason } : {}) });
      setRxs(prev => prev.map(r => r.id === rx.id ? updated : r));
      return true;
    } catch (e) {
      setActionError(e.message || 'Failed to update prescription.');
      return false;
    }
  }

  function onVitalsSaved(series) {
    const last = series[series.length - 1] || {};
    const { at, by, ...vals } = last;
    setPatient(prev => ({
      ...prev,
      vitalsSeries: series,
      vitals: Object.keys(vals).length ? vals : prev.vitals,
    }));
    setModal(null);
  }

  if (loading) return <div className="loading"><span className="spin" style={{display:'inline-block',width:16,height:16,border:'2px solid var(--border)',borderTopColor:'var(--teal-500)',borderRadius:'50%'}} /> Loading…</div>;
  if (loadError) return <div className="alert alert-error">{loadError}</div>;
  if (!patient) return <div className="alert alert-error">Patient not found</div>;

  return (
    <div>
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }} onClick={() => navigate('/patients')}>
        <ArrowLeft size={14} /> Back to patients
      </button>

      {actionError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{actionError}</div>}

      <div className="card" style={{ marginBottom: 20, padding: '20px 24px' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div className="avatar avatar-lg">{patient.name?.split(' ').map(p=>p[0]).join('').slice(0,2)}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: 'var(--font-head)', fontSize: 20, fontWeight: 700 }}>{patient.name}</div>
              <span className="badge badge-grey font-mono">{patient.mrn}</span>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
              {patient.dob && `${new Date().getFullYear() - new Date(patient.dob).getFullYear()} y · `}
              {patient.gender && `${patient.gender} · `}
              {patient.bloodGroup && <strong>{patient.bloodGroup} · </strong>}
              {patient.phone}
            </div>
            {patient.conditions?.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {patient.conditions.map(c => <span key={c} className="badge badge-orange">{c}</span>)}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={() => setModal('note')}><PenLine size={13} /> Write note</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setModal('lab')}><FlaskConical size={13} /> Order lab</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setModal('rx')}><Pill size={13} /> Prescribe</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setModal('vitals')}><Activity size={13} /> Record vitals</button>
          </div>
        </div>
        {patient.allergies?.length > 0 && (
          <div className="alert alert-error" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <AlertTriangle size={15} />
            <strong>Allergies:</strong>
            {patient.allergies.map((a, i) => {
              const label = typeof a === 'string' ? a : a.substance;
              const sev = typeof a === 'object' ? a.severity : null;
              return <span key={i}>{label}{sev ? ` (${sev})` : ''}{i < patient.allergies.length - 1 ? ',' : ''}</span>;
            })}
          </div>
        )}
      </div>

      <div className="tabs">
        {[['overview','Overview'],['notes','Notes'],['labs','Labs'],['rx','Prescriptions']].map(([v,l]) => (
          <button key={v} className={`tab-btn${tab===v?' active':''}`} onClick={() => setTab(v)}>{l}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <h3>Vitals</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setModal('vitals')}><Activity size={12} /> Record</button>
            </div>
            <div className="card-body">
              {patient.vitals ? (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {Object.entries(patient.vitals).map(([k, v]) => (
                    <div key={k} style={{ background: 'var(--teal-50)', border: '1px solid var(--teal-100)', borderRadius: 'var(--r-md)', padding: '10px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--teal-700)', marginBottom: 4 }}>{k.toUpperCase()}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 500, color: 'var(--teal-900)' }}>{v}</div>
                    </div>
                  ))}
                </div>
              ) : <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>No vitals recorded</p>}
              {patient.vitalsSeries?.length > 1 && (
                <div className="table-wrap" style={{ marginTop: 14 }}>
                  <table>
                    <thead><tr><th>When</th><th>BP</th><th>HR</th><th>Temp</th><th>SpO₂</th><th>RR</th><th>Weight</th></tr></thead>
                    <tbody>
                      {[...patient.vitalsSeries].reverse().slice(0, 8).map((v, i) => (
                        <tr key={i}>
                          <td style={{ whiteSpace: 'nowrap' }}>{fmtUnix(v.at)}</td>
                          <td className="font-mono">{v.bp || '—'}</td>
                          <td className="font-mono">{v.hr ?? '—'}</td>
                          <td className="font-mono">{v.temp ?? '—'}</td>
                          <td className="font-mono">{v.spo2 ?? '—'}</td>
                          <td className="font-mono">{v.rr ?? '—'}</td>
                          <td className="font-mono">{v.weight ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          <div className="card">
            <div className="card-header"><h3>Allergies</h3></div>
            <div className="card-body">
              {patient.allergies?.length > 0 ? (
                patient.allergies.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>{typeof a === 'string' ? a : a.substance}</span>
                    {a.severity && <span className="badge badge-red" style={{ marginLeft: 'auto' }}>{a.severity}</span>}
                  </div>
                ))
              ) : <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>No known allergies</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'notes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {notes.length === 0 ? <div className="card"><div className="empty-state"><PenLine size={40}/><p>No notes</p></div></div>
          : notes.map(n => (
            <div key={n.id} className="card">
              <div className="card-header">
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {n.addendumOf ? n.title : `${n.type?.replace(/_/g,' ')} Note`} · {fmt(n.createdAt)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{n.clinicianName || '—'}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {n.addendumOf ? <span className="badge badge-blue"><FilePlus2 size={11} /> Addendum</span>
                    : n.signedAt ? (
                      <>
                        <span className="badge badge-green"><CheckCircle size={11} /> Signed</span>
                        <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'addendum', noteId: n.id })}><FilePlus2 size={12} /> Addendum</button>
                      </>
                    ) : <button className="btn btn-success btn-sm" onClick={() => signNote(n.id)}><CheckCircle size={12} /> Sign</button>}
                </div>
              </div>
              <div className="card-body">
                {[['Subjective', n.subjective], ['Objective', n.objective], ['Assessment', n.assessment], ['Plan', n.plan], ['Addendum', n.text]].filter(([,v])=>v).map(([k,v]) => (
                  <div key={k} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', marginBottom: 4 }}>{k}</div>
                    <p style={{ fontSize: 13.5 }}>{v}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'labs' && (
        <div className="card">
          {labs.length === 0 ? <div className="empty-state"><FlaskConical size={40}/><p>No labs ordered</p></div>
          : <div className="table-wrap"><table>
            <thead><tr><th>Test</th><th>Ordered</th><th>Reported</th><th>Status</th></tr></thead>
            <tbody>{labs.map(l => (
              <tr key={l.id}>
                <td style={{ fontWeight: 600 }}>{l.testName}</td>
                <td>{fmt(l.orderedAt)}</td>
                <td>{fmt(l.reportedAt)}</td>
                <td>{labBadge(l.status)}</td>
              </tr>
            ))}</tbody>
          </table></div>}
        </div>
      )}

      {tab === 'rx' && (
        <div className="card">
          {rxs.length === 0 ? <div className="empty-state"><Pill size={40}/><p>No prescriptions</p></div>
          : <div className="table-wrap"><table>
            <thead><tr><th>Drug</th><th>Dose</th><th>Frequency</th><th>Route</th><th>From</th><th>Status</th><th /></tr></thead>
            <tbody>{rxs.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>
                  {r.drugName}
                  {r.overrideReason && (
                    <div style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--warn)', marginTop: 2 }}>
                      <AlertTriangle size={11} style={{ verticalAlign: -1 }} /> Safety override: {r.overrideReason}
                    </div>
                  )}
                  {r.status === 'discontinued' && r.discontinuedReason && (
                    <div style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>
                      Stopped: {r.discontinuedReason}
                    </div>
                  )}
                </td>
                <td className="font-mono">{r.dose}</td>
                <td>{r.frequency}</td>
                <td>{r.route}</td>
                <td>{fmt(r.prescribedAt)}</td>
                <td><span className={`badge ${RX_BADGE[r.status] || 'badge-grey'}`}>{r.status}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {(RX_ACTIONS[r.status] || []).map(({ to, label }) => (
                      <button key={to} className="btn btn-secondary btn-sm" onClick={() => transitionRx(r, to)}>{label}</button>
                    ))}
                    {(r.status === 'active' || r.status === 'dispensed') && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'discontinue', rx: r })}>Discontinue</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table></div>}
        </div>
      )}

      {modal === 'note' && <NoteModal patientId={id} clinicianId={user?.clinicianId} onClose={() => setModal(null)} onSaved={n => { setNotes(prev => [n, ...prev]); setModal(null); setTab('notes'); }} />}
      {modal === 'lab' && <LabModal patientId={id} clinicianId={user?.clinicianId} onClose={() => setModal(null)} onSaved={l => { setLabs(prev => [l, ...prev]); setModal(null); setTab('labs'); }} />}
      {modal === 'rx' && <RxModal patientId={id} clinicianId={user?.clinicianId} onClose={() => setModal(null)} onSaved={r => { setRxs(prev => [r, ...prev]); setModal(null); setTab('rx'); }} />}
      {modal === 'vitals' && <VitalsModal patientId={id} onClose={() => setModal(null)} onSaved={onVitalsSaved} />}
      {modal?.type === 'addendum' && <AddendumModal noteId={modal.noteId} onClose={() => setModal(null)} onSaved={n => { setNotes(prev => [n, ...prev]); setModal(null); }} />}
      {modal?.type === 'discontinue' && (
        <DiscontinueModal
          rx={modal.rx}
          onClose={() => setModal(null)}
          onConfirm={async reason => { if (await transitionRx(modal.rx, 'discontinued', reason)) setModal(null); }}
        />
      )}
    </div>
  );
}

function VitalsModal({ patientId, onClose, onSaved }) {
  const [form, setForm] = useState({ bp: '', hr: '', temp: '', weight: '', spo2: '', rr: '' });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    if (loading) return;
    const payload = {};
    if (form.bp.trim()) payload.bp = form.bp.trim();
    for (const k of ['hr', 'temp', 'weight', 'spo2', 'rr']) {
      if (form[k] !== '' && !Number.isNaN(Number(form[k]))) payload[k] = Number(form[k]);
    }
    if (Object.keys(payload).length === 0) { setErr('Enter at least one vital sign.'); return; }
    setErr(''); setLoading(true);
    try {
      const series = await api.recordVitals(patientId, payload);
      onSaved(series);
    } catch (e2) { setErr(e2.message || 'Failed to record vitals.'); setLoading(false); }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header"><h3>Record Vitals</h3><button className="btn-icon" aria-label="Close" onClick={onClose}><X size={16}/></button></div>
        <div className="modal-body">
          {err && <div className="alert alert-error">{err}</div>}
          <form id="vitals-form" onSubmit={submit}>
            <div className="field-row">
              <div className="field"><label>Blood pressure</label><input value={form.bp} onChange={e=>set('bp',e.target.value)} placeholder="e.g. 120/80" maxLength={20} /></div>
              <div className="field"><label>Heart rate (bpm)</label><input type="number" value={form.hr} onChange={e=>set('hr',e.target.value)} min={0} max={300} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label>Temperature (°C)</label><input type="number" step="0.1" value={form.temp} onChange={e=>set('temp',e.target.value)} min={25} max={45} /></div>
              <div className="field"><label>SpO₂ (%)</label><input type="number" value={form.spo2} onChange={e=>set('spo2',e.target.value)} min={0} max={100} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label>Respiratory rate</label><input type="number" value={form.rr} onChange={e=>set('rr',e.target.value)} min={0} max={100} /></div>
              <div className="field"><label>Weight (kg)</label><input type="number" step="0.1" value={form.weight} onChange={e=>set('weight',e.target.value)} min={0} max={500} /></div>
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button form="vitals-form" type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving…' : 'Save vitals'}</button>
        </div>
      </div>
    </div>
  );
}

function AddendumModal({ noteId, onClose, onSaved }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (loading || !text.trim()) return;
    setErr(''); setLoading(true);
    try {
      const note = await api.addAddendum(noteId, text.trim());
      onSaved(note);
    } catch (e2) { setErr(e2.message || 'Failed to add addendum.'); setLoading(false); }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header"><h3>Add Addendum</h3><button className="btn-icon" aria-label="Close" onClick={onClose}><X size={16}/></button></div>
        <div className="modal-body">
          {err && <div className="alert alert-error">{err}</div>}
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10 }}>
            The signed note stays unchanged — the addendum is recorded alongside it, chained to the signed content.
          </p>
          <form id="addendum-form" onSubmit={submit}>
            <div className="field">
              <label>Addendum</label>
              <textarea value={text} onChange={e => setText(e.target.value)} rows={4} required placeholder="e.g. Patient called: symptoms resolved after 48h…" />
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button form="addendum-form" type="submit" className="btn btn-primary" disabled={loading || !text.trim()}>{loading ? 'Saving…' : 'Add addendum'}</button>
        </div>
      </div>
    </div>
  );
}

function DiscontinueModal({ rx, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (loading || !reason.trim()) return;
    setLoading(true);
    await onConfirm(reason.trim());
    setLoading(false);
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header"><h3>Discontinue {rx.drugName}</h3><button className="btn-icon" aria-label="Close" onClick={onClose}><X size={16}/></button></div>
        <div className="modal-body">
          <form id="discontinue-form" onSubmit={submit}>
            <div className="field">
              <label>Reason for discontinuing</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} required placeholder="e.g. Adverse reaction — patient developed rash" />
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button form="discontinue-form" type="submit" className="btn btn-danger" disabled={loading || !reason.trim()}>{loading ? 'Saving…' : 'Discontinue'}</button>
        </div>
      </div>
    </div>
  );
}

function NoteModal({ patientId, clinicianId, onClose, onSaved }) {
  const [form, setForm] = useState({ subjective: '', objective: '', assessment: '', plan: '', type: 'SOAP' });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const note = await api.createNote({ patientId, clinicianId, ...form });
      onSaved(note);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget&&onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header"><h3>Write Clinical Note</h3><button className="btn-icon" aria-label="Close" onClick={onClose}><X size={16}/></button></div>
        <div className="modal-body">
          {err && <div className="alert alert-error">{err}</div>}
          <form id="note-form" onSubmit={submit}>
            {[['subjective','S — Subjective'],['objective','O — Objective'],['assessment','A — Assessment'],['plan','P — Plan']].map(([k,l]) => (
              <div key={k} className="soap-field">
                <label>{l}</label>
                <textarea value={form[k]} onChange={e=>set(k,e.target.value)} rows={3} placeholder={`${l}…`} />
              </div>
            ))}
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button form="note-form" type="submit" className="btn btn-primary" disabled={loading}>{loading?'Saving…':'Save note'}</button>
        </div>
      </div>
    </div>
  );
}

function LabModal({ patientId, clinicianId, onClose, onSaved }) {
  const [testName, setTestName] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (loading) return;
    setErr(''); setLoading(true);
    try {
      const lab = await api.createLab({ patientId, clinicianId, testName });
      onSaved(lab);
    } catch (e) { setErr(e.message || 'Failed to order lab.'); setLoading(false); }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-header"><h3>Order Lab Test</h3><button className="btn-icon" aria-label="Close" onClick={onClose}><X size={16}/></button></div>
        <div className="modal-body">
          {err && <div className="alert alert-error">{err}</div>}
          <form id="lab-form" onSubmit={submit}>
            <div className="field"><label>Test name</label>
              <select value={testName} onChange={e=>setTestName(e.target.value)} required>
                <option value="">— Select test —</option>
                {['Complete Blood Count','Lipid Profile','HbA1c','Blood Glucose Fasting','Thyroid Function Test (TSH)','Liver Function Test','Kidney Function Test','Urine Routine','ECG','Chest X-Ray','COVID-19 RT-PCR'].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button form="lab-form" type="submit" className="btn btn-primary" disabled={loading}>{loading?'Ordering…':'Order lab'}</button>
        </div>
      </div>
    </div>
  );
}

function RxModal({ patientId, clinicianId, onClose, onSaved }) {
  const [form, setForm] = useState({ drugName: '', dose: '', frequency: '', route: 'Oral', instructions: '', durationDays: 30 });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  // Populated when the API's drug-safety gate blocks (422): the clinician must
  // either change the drug or document a reason to override.
  const [warnings, setWarnings] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  async function submit(e) {
    e.preventDefault();
    if (loading) return;
    if (warnings && !overrideReason.trim()) {
      setErr('Document an override reason, or change the drug.');
      return;
    }
    setErr(''); setLoading(true);
    try {
      const rx = await api.createPrescription({
        patientId, clinicianId, ...form,
        ...(warnings && overrideReason.trim() ? { overrideReason: overrideReason.trim() } : {}),
      });
      onSaved(rx);
    } catch (e) {
      if (e.code === 'drug_allergy' || e.code === 'drug_interaction') {
        setWarnings(e.data?.warnings || []);
      } else {
        setErr(e.message || 'Failed to save prescription.');
      }
      setLoading(false);
    }
  }

  // Changing the drug invalidates previous warnings — re-run the safety check.
  function onDrugChange(v) {
    set('drugName', v);
    if (warnings) { setWarnings(null); setOverrideReason(''); }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-header"><h3>Write Prescription</h3><button className="btn-icon" aria-label="Close" onClick={onClose}><X size={16}/></button></div>
        <div className="modal-body">
          {err && <div className="alert alert-error">{err}</div>}
          {warnings && (
            <div className="alert alert-error" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <AlertTriangle size={14} /> Safety check blocked this prescription
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {warnings.map((w, i) => (
                  <li key={i}>
                    {w.type === 'allergy'
                      ? `Documented allergy to ${w.substance}${w.severity ? ` (${w.severity})` : ''}${w.reaction ? ` — ${w.reaction}` : ''}`
                      : `Interacts with ${w.with}${w.risk ? `: ${w.risk}` : ''}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <form id="rx-form" onSubmit={submit}>
            <div className="field"><label>Drug name</label><input value={form.drugName} onChange={e=>onDrugChange(e.target.value)} placeholder="e.g. Metformin 500mg" required /></div>
            <div className="field-row">
              <div className="field"><label>Dose</label><input value={form.dose} onChange={e=>set('dose',e.target.value)} placeholder="e.g. 500mg" required /></div>
              <div className="field"><label>Frequency</label>
                <select value={form.frequency} onChange={e=>set('frequency',e.target.value)} required>
                  <option value="">—</option>
                  {['Once daily','Twice daily','Three times daily','Four times daily','Every 8 hours','Every 6 hours','As needed','At bedtime','With meals'].map(f=><option key={f}>{f}</option>)}
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field"><label>Route</label>
                <select value={form.route} onChange={e=>set('route',e.target.value)}>
                  {['Oral','IV','IM','SC','Topical','Inhaled','Sublingual'].map(r=><option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="field"><label>Duration (days)</label><input type="number" value={form.durationDays} onChange={e=>set('durationDays',+e.target.value)} min={1} /></div>
            </div>
            <div className="field"><label>Instructions</label><textarea value={form.instructions} onChange={e=>set('instructions',e.target.value)} rows={2} placeholder="Take with food, avoid alcohol…" /></div>
            {warnings && (
              <div className="field">
                <label style={{ color: 'var(--error)' }}>Override reason (recorded in the audit trail)</label>
                <textarea value={overrideReason} onChange={e => setOverrideReason(e.target.value)} rows={2}
                  placeholder="e.g. Desensitization protocol under supervision" required />
              </div>
            )}
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button form="rx-form" type="submit" className={`btn ${warnings ? 'btn-danger' : 'btn-primary'}`} disabled={loading || (warnings && !overrideReason.trim())}>
            {loading ? 'Prescribing…' : warnings ? 'Override & prescribe' : 'Prescribe'}
          </button>
        </div>
      </div>
    </div>
  );
}
