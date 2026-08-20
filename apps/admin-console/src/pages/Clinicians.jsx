import React, { useEffect, useState } from 'react';
import { Stethoscope, Plus, X, Clock } from 'lucide-react';
import { api } from '../api.js';

export default function Clinicians() {
  const [clinicians, setClinicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    api.getClinicians().then(setClinicians)
      .catch(e => setError(e.message || 'Failed to load clinicians.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><Clock size={16} className="spin" /> Loading…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <div className="page-header">
        <div><h2>Clinicians</h2><p>Manage clinical staff profiles</p></div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={15} /> Add clinician</button>
      </div>
      <div className="card">
        {clinicians.length === 0 ? (
          <div className="empty-state"><Stethoscope size={40}/><p>No clinicians found</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Specialisation</th><th>Department</th><th>Reg. No.</th><th>Contact</th></tr></thead>
              <tbody>
                {clinicians.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td>{c.specialisation || '—'}</td>
                    <td>{c.department || '—'}</td>
                    <td className="font-mono" style={{ fontSize: 12 }}>{c.registrationNumber || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.phone || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showModal && (
        <AddClinicianModal
          onClose={() => setShowModal(false)}
          onAdded={c => { setClinicians(prev => [...prev, c]); setShowModal(false); }}
        />
      )}
    </div>
  );
}

function AddClinicianModal({ onClose, onAdded }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', specialisation: '', department: '', registrationNumber: '', phone: '' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const result = await api.createClinician(form);
      onAdded(result.clinician || { ...form, id: result.clinicianId || Date.now().toString() });
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-header"><h3>Add Clinician</h3><button className="btn-icon" aria-label="Close" onClick={onClose}><X size={16}/></button></div>
        <div className="modal-body">
          {err && <div className="alert alert-error">{err}</div>}
          <form id="clin-form" onSubmit={submit}>
            <div className="field"><label>Full name</label><input value={form.name} onChange={e=>set('name',e.target.value)} required /></div>
            <div className="field-row">
              <div className="field"><label>Email (login)</label><input type="email" value={form.email} onChange={e=>set('email',e.target.value)} required /></div>
              <div className="field"><label>Password</label><input type="password" value={form.password} onChange={e=>set('password',e.target.value)} required minLength={8} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label>Specialisation</label><input value={form.specialisation} onChange={e=>set('specialisation',e.target.value)} /></div>
              <div className="field"><label>Department</label><input value={form.department} onChange={e=>set('department',e.target.value)} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label>Reg. number</label><input value={form.registrationNumber} onChange={e=>set('registrationNumber',e.target.value)} /></div>
              <div className="field"><label>Phone</label><input value={form.phone} onChange={e=>set('phone',e.target.value)} /></div>
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button form="clin-form" type="submit" className="btn btn-primary" disabled={loading}>{loading?'Creating…':'Add clinician'}</button>
        </div>
      </div>
    </div>
  );
}
