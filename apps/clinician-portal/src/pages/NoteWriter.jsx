import React, { useState, useEffect } from 'react';
import { Search, PenLine, CheckCircle, Save } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

export default function NoteWriter() {
  const { user } = useAuth();
  const [patients, setPatients] = useState([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ subjective: '', objective: '', assessment: '', plan: '', type: 'SOAP' });
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      if (q.length >= 2) api.getPatients(q).then(setPatients).catch(() => {});
      else setPatients([]);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function saveNote(sign = false) {
    if (!selected) { setErr('Select a patient first'); return; }
    setErr(''); setLoading(true);
    try {
      const note = await api.createNote({ patientId: selected.id, clinicianId: user?.clinicianId, ...form });
      if (sign) await api.signNote(note.id);
      setSaved({ ...note, signedAt: sign ? new Date().toISOString() : null });
      setForm({ subjective: '', objective: '', assessment: '', plan: '', type: 'SOAP' });
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <div className="page-header">
        <div><h2>Write Note</h2><p>Compose and sign clinical notes</p></div>
      </div>

      {saved && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          <CheckCircle size={15} /> Note saved{saved.signedAt ? ' and signed' : ''} successfully.
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setSaved(null)}>Write another</button>
        </div>
      )}

      {err && <div className="alert alert-error">{err}</div>}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* Patient selector */}
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><h3>Patient</h3></div>
            <div className="card-body">
              {selected ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="avatar">{selected.name?.split(' ').map(p=>p[0]).join('').slice(0,2)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{selected.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>MRN: {selected.mrn}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>Change</button>
                </div>
              ) : (
                <div>
                  <div className="search-bar" style={{ marginBottom: 8 }}>
                    <Search size={14} color="var(--text-muted)" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search patients…" autoFocus />
                  </div>
                  {patients.length > 0 && (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
                      {patients.slice(0, 5).map(p => (
                        <div key={p.id} onClick={() => { setSelected(p); setQ(''); setPatients([]); }}
                          style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--paper)'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}
                        >
                          <div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{p.name?.split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.mrn}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3>Note type</h3></div>
            <div className="card-body">
              {['SOAP', 'Progress', 'Discharge', 'Referral', 'Procedure'].map(t => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 13.5 }}>
                  <input type="radio" name="type" value={t} checked={form.type === t} onChange={() => set('type', t)} style={{ accentColor: 'var(--teal-700)' }} />
                  {t}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* SOAP editor */}
        <div className="card">
          <div className="card-header"><h3><PenLine size={14} style={{marginRight:6,verticalAlign:'middle',color:'var(--teal-700)'}}/>SOAP Note</h3></div>
          <div className="card-body">
            {[['subjective','S — Subjective','Chief complaint, patient history, symptoms…'],
              ['objective','O — Objective','Vitals, physical exam findings, test results…'],
              ['assessment','A — Assessment','Diagnosis, differential, clinical reasoning…'],
              ['plan','P — Plan','Medications, referrals, follow-up, patient instructions…']
            ].map(([k,l,ph]) => (
              <div key={k} className="soap-field">
                <label>{l}</label>
                <textarea value={form[k]} onChange={e=>set(k,e.target.value)} rows={4} placeholder={ph} />
              </div>
            ))}
          </div>
          <div className="card-footer">
            <button className="btn btn-ghost" onClick={() => saveNote(false)} disabled={loading}><Save size={14}/> Save draft</button>
            <button className="btn btn-primary" onClick={() => saveNote(true)} disabled={loading}><CheckCircle size={14}/> Save & sign</button>
          </div>
        </div>
      </div>
    </div>
  );
}
