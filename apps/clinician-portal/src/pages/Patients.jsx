import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Search, ChevronRight } from 'lucide-react';
import { api } from '../api.js';

function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export default function Patients() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const search = useCallback(debounce((query) => {
    setLoading(true);
    setError('');
    api.getPatients(query).then(setPatients)
      .catch(e => setError(e.message || 'Failed to load patients.'))
      .finally(() => setLoading(false));
  }, 300), []);

  useEffect(() => { search(q); }, [q]);

  return (
    <div>
      <div className="page-header">
        <div><h2>Patients</h2><p>Search and manage patient records</p></div>
      </div>

      <div className="search-bar" style={{ marginBottom: 16 }}>
        <Search size={16} color="var(--text-muted)" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, MRN, or phone…" autoFocus />
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><span className="spin" style={{display:'inline-block',width:16,height:16,border:'2px solid var(--border)',borderTopColor:'var(--teal-500)',borderRadius:'50%'}} /> Loading…</div>
        ) : error ? (
          <div className="alert alert-error" style={{ margin: 16 }}>{error}</div>
        ) : patients.length === 0 ? (
          <div className="empty-state"><Users size={40} /><p>{q ? `No patients matching "${q}"` : 'No patients found'}</p></div>
        ) : patients.map(p => (
          <div key={p.id} className="patient-row" onClick={() => navigate(`/patients/${p.id}`)}>
            <div className="avatar">{p.name?.split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                MRN: <span className="font-mono">{p.mrn}</span>
                {p.dob && ` · ${new Date().getFullYear() - new Date(p.dob).getFullYear()} y`}
                {p.gender && ` · ${p.gender}`}
                {p.bloodGroup && ` · ${p.bloodGroup}`}
              </div>
              {p.conditions?.length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                  {p.conditions.slice(0,3).map(c => <span key={c} className="badge badge-orange" style={{fontSize:10,padding:'1px 6px'}}>{c}</span>)}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {p.phone && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.phone}</span>}
              <ChevronRight size={16} color="var(--text-muted)" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
