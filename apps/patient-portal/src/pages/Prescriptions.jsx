import React, { useEffect, useState } from 'react';
import { Pill, Clock, Filter } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

function fmt(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Prescriptions() {
  const { user } = useAuth();
  const [rxs, setRxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);

  useEffect(() => {
    if (!user?.patientId) return;
    setLoading(true);
    setError('');
    api.getPrescriptions(user.patientId, activeOnly)
      .then(setRxs)
      .catch(e => setError(e.message || 'Failed to load prescriptions.'))
      .finally(() => setLoading(false));
  }, [user, activeOnly]);

  if (loading) return <div className="loading"><Clock size={16} className="spin" /> Loading prescriptions…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Prescriptions</h2>
          <p>Your medication history from all clinicians</p>
        </div>
        <div className="header-right">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} style={{ accentColor: 'var(--teal-700)', width: 16, height: 16 }} />
            Active only
          </label>
        </div>
      </div>

      <div className="card">
        {rxs.length === 0 ? (
          <div className="empty-state"><Pill size={40} /><p>No prescriptions found</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Medication</th><th>Dose</th><th>Frequency</th><th>Route</th><th>Prescribed</th><th>Valid Until</th><th>Status</th></tr>
              </thead>
              <tbody>
                {rxs.map(rx => {
                  const active = !rx.validUntil || new Date(rx.validUntil) > new Date();
                  return (
                    <tr key={rx.id}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{rx.drugName}</div>
                        {rx.instructions && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{rx.instructions}</div>}
                      </td>
                      <td><span className="font-mono">{rx.dose}</span></td>
                      <td>{rx.frequency}</td>
                      <td>{rx.route}</td>
                      <td>{fmt(rx.prescribedAt)}</td>
                      <td>{fmt(rx.validUntil)}</td>
                      <td>
                        <span className={`badge ${active ? 'badge-green' : 'badge-grey'}`}>{active ? 'Active' : 'Expired'}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
