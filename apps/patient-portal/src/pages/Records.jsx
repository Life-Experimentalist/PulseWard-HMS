import React, { useEffect, useState } from 'react';
import { FileText, Clock, Heart, AlertTriangle, Stethoscope } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

function fmt(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Records() {
  const { user } = useAuth();
  const [patient, setPatient] = useState(null);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    if (!user?.patientId) return;
    Promise.all([
      api.getPatient(user.patientId),
      api.getNotes(user.patientId),
    ]).then(([p, n]) => {
      setPatient(p);
      setNotes(n);
    }).catch(e => setError(e.message || 'Failed to load records.')).finally(() => setLoading(false));
  }, [user]);

  if (loading) return <div className="loading"><Clock size={16} className="spin" /> Loading records…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!patient) return <div className="alert alert-info">No patient record found.</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Health Records</h2>
          <p>MRN: <span className="font-mono">{patient.mrn}</span></p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20, padding: '20px 24px' }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div className="avatar avatar-lg">{patient.name?.split(' ').map(p => p[0]).join('').slice(0,2)}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: 20, fontWeight: 700 }}>{patient.name}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
              {patient.dob && <>DOB: {fmt(patient.dob)} · </>}
              {patient.gender && <>{patient.gender} · </>}
              {patient.bloodGroup && <>Blood: <strong>{patient.bloodGroup}</strong> · </>}
              {patient.phone}
            </div>
            {(patient.conditions?.length > 0) && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {patient.conditions.map(c => <span key={c} className="badge badge-orange">{c}</span>)}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="tabs">
        {[['overview','Overview'],['notes','Clinical Notes'],['allergies','Allergies']].map(([v,l]) => (
          <button key={v} className={`tab-btn${tab===v?' active':''}`} onClick={() => setTab(v)}>{l}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header"><h3><Heart size={14} style={{marginRight:6,verticalAlign:'middle',color:'var(--teal-700)'}}/>Vitals</h3></div>
            <div className="card-body">
              {patient.vitals ? (
                <div className="vitals-row">
                  {patient.vitals.bp && <div className="vital-chip"><div className="v-label">Blood Pressure</div><div className="v-value">{patient.vitals.bp}</div><div className="v-unit">mmHg</div></div>}
                  {patient.vitals.hr && <div className="vital-chip"><div className="v-label">Heart Rate</div><div className="v-value">{patient.vitals.hr}</div><div className="v-unit">bpm</div></div>}
                  {patient.vitals.spo2 && <div className="vital-chip"><div className="v-label">SpO₂</div><div className="v-value">{patient.vitals.spo2}</div><div className="v-unit">%</div></div>}
                  {patient.vitals.temp && <div className="vital-chip"><div className="v-label">Temperature</div><div className="v-value">{patient.vitals.temp}</div><div className="v-unit">°C</div></div>}
                  {patient.vitals.weight && <div className="vital-chip"><div className="v-label">Weight</div><div className="v-value">{patient.vitals.weight}</div><div className="v-unit">kg</div></div>}
                </div>
              ) : <p className="text-muted" style={{fontSize:13.5}}>No vitals recorded</p>}
            </div>
          </div>
          <div className="card">
            <div className="card-header"><h3><Stethoscope size={14} style={{marginRight:6,verticalAlign:'middle',color:'var(--teal-700)'}}/>Medical History</h3></div>
            <div className="card-body">
              {patient.conditions?.length > 0 ? (
                <ul style={{listStyle:'none',display:'flex',flexDirection:'column',gap:8}}>
                  {patient.conditions.map(c => (
                    <li key={c} style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{width:6,height:6,borderRadius:'50%',background:'var(--teal-500)',flexShrink:0}} />
                      <span style={{fontSize:13.5}}>{c}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-muted" style={{fontSize:13.5}}>No conditions recorded</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'notes' && (
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {notes.length === 0 ? (
            <div className="card"><div className="empty-state"><FileText size={40}/><p>No clinical notes</p></div></div>
          ) : notes.map(n => (
            <div key={n.id} className="card">
              <div className="card-header">
                <div>
                  <div style={{fontFamily:'var(--font-head)',fontWeight:600,fontSize:14}}>{n.type?.replace(/_/g,' ')} Note</div>
                  <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>{fmt(n.createdAt)} {n.signedAt && '· Signed'}</div>
                </div>
                {n.signedAt && <span className="badge badge-green">Signed</span>}
              </div>
              <div className="card-body">
                {n.subjective && <div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--text-muted)',marginBottom:4}}>Subjective</div><p style={{fontSize:13.5}}>{n.subjective}</p></div>}
                {n.objective && <div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--text-muted)',marginBottom:4}}>Objective</div><p style={{fontSize:13.5}}>{n.objective}</p></div>}
                {n.assessment && <div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--text-muted)',marginBottom:4}}>Assessment</div><p style={{fontSize:13.5}}>{n.assessment}</p></div>}
                {n.plan && <div><div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--text-muted)',marginBottom:4}}>Plan</div><p style={{fontSize:13.5}}>{n.plan}</p></div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'allergies' && (
        <div className="card">
          <div className="card-header"><h3><AlertTriangle size={14} style={{marginRight:6,verticalAlign:'middle',color:'var(--warn)'}}/>Allergies & Intolerances</h3></div>
          <div className="card-body">
            {patient.allergies?.length > 0 ? (
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {patient.allergies.map((a,i) => (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'var(--warn-bg)',borderRadius:'var(--r-sm)',border:'1px solid #ffe082'}}>
                    <AlertTriangle size={14} color="var(--warn)" />
                    <span style={{fontWeight:600,fontSize:13.5,color:'var(--warn)'}}>{typeof a === 'string' ? a : a.substance}</span>
                    {a.reaction && <span style={{fontSize:12,color:'var(--text-secondary)'}}>· {a.reaction}</span>}
                    {a.severity && <span className="badge badge-orange" style={{marginLeft:'auto'}}>{a.severity}</span>}
                  </div>
                ))}
              </div>
            ) : <p className="text-muted" style={{fontSize:13.5}}>No known allergies documented</p>}
          </div>
        </div>
      )}
    </div>
  );
}
