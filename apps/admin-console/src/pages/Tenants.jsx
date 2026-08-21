import React, { useEffect, useState } from "react";
import { Building2, Clock } from "lucide-react";
import { api } from "../api.js";

function fmt(ts) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function Tenants() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .getTenants()
      .then(setTenants)
      .catch((e) => setErr(e.message || "Failed to load tenants."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Tenants</h2>
          <p>
            Hospitals on this deployment — each tenant's data is fully isolated. Onboard a new
            hospital by adding a row to the <span className="font-mono">tenants</span> table (see the
            Operations Runbook).
          </p>
        </div>
      </div>

      {err && <div className="alert alert-error">{err}</div>}

      <div className="card">
        {loading ? (
          <div className="loading">
            <Clock size={16} className="spin" /> Loading tenants…
          </div>
        ) : tenants.length === 0 ? (
          <div className="empty-state">
            <Building2 size={40} />
            <p>No tenants configured</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hospital</th>
                  <th>Slug</th>
                  <th>HFR ID</th>
                  <th>Accent</th>
                  <th>Onboarded</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td className="font-mono" style={{ fontSize: 12 }}>
                      {t.slug}
                    </td>
                    <td className="font-mono" style={{ fontSize: 12 }}>
                      {t.hfr_id || <span className="text-muted">—</span>}
                    </td>
                    <td>
                      {t.accent ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: 4,
                              background: t.accent,
                              border: "1px solid var(--border)",
                              display: "inline-block",
                            }}
                          />
                          <span className="font-mono" style={{ fontSize: 12 }}>
                            {t.accent}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>{fmt(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
