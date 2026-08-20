import React, { useEffect, useState } from 'react';
import { FlaskConical, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

function fmt(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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
const awaitingResults = status => status === 'ordered' || status === 'in-lab';

export default function Labs() {
  const { user } = useAuth();
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!user?.patientId) return;
    api.getLabs(user.patientId).then(setLabs).catch(console.error).finally(() => setLoading(false));
  }, [user]);

  if (loading) return <div className="loading"><Clock size={16} className="spin" /> Loading labs…</div>;

  const resultFlag = v => {
    if (!v?.flag) return null;
    if (v.flag === 'H') return <span style={{ color: 'var(--error)', fontWeight: 700, fontSize: 12 }}>▲H</span>;
    if (v.flag === 'L') return <span style={{ color: 'var(--info)', fontWeight: 700, fontSize: 12 }}>▼L</span>;
    return null;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Lab Results</h2>
          <p>Your diagnostic test history</p>
        </div>
      </div>

      {labs.length === 0 ? (
        <div className="card"><div className="empty-state"><FlaskConical size={40} /><p>No lab results yet</p></div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {labs.map(lab => (
            <div key={lab.id} className="card">
              <div
                className="card-header"
                style={{ cursor: 'pointer' }}
                onClick={() => setExpanded(expanded === lab.id ? null : lab.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <FlaskConical size={16} color="var(--teal-700)" />
                  <div>
                    <div style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 15 }}>{lab.testName}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      Ordered {fmt(lab.orderedAt)}{lab.reportedAt ? ` · Reported ${fmt(lab.reportedAt)}` : ''}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {labBadge(lab.status)}
                  {expanded === lab.id ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
                </div>
              </div>

              {expanded === lab.id && (
                <div className="card-body">
                  {lab.results && lab.results.length > 0 ? (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '8px 16px', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)' }}>Test</div>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', textAlign: 'right' }}>Result</div>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', textAlign: 'right' }}>Unit</div>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', textAlign: 'right' }}>Reference</div>
                      </div>
                      {lab.results.map((r, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '6px 16px', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                          <div style={{ fontWeight: 500, fontSize: 13.5 }}>{r.name}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, textAlign: 'right', display: 'flex', alignItems: 'center', gap: 4 }}>
                            {r.value} {resultFlag(r)}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>{r.unit || '—'}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>{r.referenceRange || '—'}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>
                      {awaitingResults(lab.status) ? 'Results are pending.' : 'No structured results available.'}
                      {lab.note && <p style={{ marginTop: 8 }}>{lab.note}</p>}
                    </div>
                  )}
                  {lab.impressions && <p style={{ marginTop: 12, padding: '10px 14px', background: 'var(--teal-50)', borderRadius: 'var(--r-sm)', fontSize: 13.5, borderLeft: '3px solid var(--teal-500)' }}><strong>Impressions:</strong> {lab.impressions}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
