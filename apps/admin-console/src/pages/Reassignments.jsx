import React, { useEffect, useState } from "react";
import { Inbox, Clock, X, UserCheck, CalendarClock, Ban } from "lucide-react";
import { api } from "../api.js";

function fmtUnix(ts) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ACTION_LABEL = {
  reassign: "Reassigned",
  reschedule: "Rescheduled",
  cancel: "Cancelled",
};

export default function Reassignments() {
  const [tab, setTab] = useState("open");
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [resolving, setResolving] = useState(null);

  useEffect(() => {
    setLoading(true);
    setErr("");
    api
      .getReassignments(tab)
      .then(setQueue)
      .catch((e) => setErr(e.message || "Failed to load queue."))
      .finally(() => setLoading(false));
  }, [tab]);

  function onResolved(item) {
    // Resolved items leave the open view; refreshing the resolved tab picks them up.
    setQueue((prev) => prev.filter((q) => q.id !== item.id));
    setResolving(null);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Reassignment Queue</h2>
          <p>Appointments displaced by clinician availability blocks, awaiting a decision</p>
        </div>
      </div>

      <div className="tabs">
        {[
          ["open", "Open"],
          ["resolved", "Resolved"],
        ].map(([v, l]) => (
          <button key={v} className={`tab-btn${tab === v ? " active" : ""}`} onClick={() => setTab(v)}>
            {l}
          </button>
        ))}
      </div>

      {err && <div className="alert alert-error">{err}</div>}

      <div className="card">
        {loading ? (
          <div className="loading">
            <Clock size={16} className="spin" /> Loading queue…
          </div>
        ) : queue.length === 0 ? (
          <div className="empty-state">
            <Inbox size={40} />
            <p>{tab === "open" ? "No appointments waiting — the queue is clear" : "Nothing resolved yet"}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Appointment</th>
                  <th>Patient</th>
                  <th>Clinician</th>
                  <th>Reason</th>
                  {tab === "open" ? <th /> : <th>Resolution</th>}
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={item.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtUnix(item.startsAt)}</td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{item.patientName}</span>
                      {item.mrn && (
                        <span className="font-mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {" "}
                          · {item.mrn}
                        </span>
                      )}
                    </td>
                    <td>
                      {item.clinicianName}
                      {item.department && (
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}> · {item.department}</span>
                      )}
                    </td>
                    <td>{item.reason || <span className="text-muted">—</span>}</td>
                    {tab === "open" ? (
                      <td style={{ textAlign: "right" }}>
                        <button className="btn btn-primary btn-sm" onClick={() => setResolving(item)}>
                          Resolve
                        </button>
                      </td>
                    ) : (
                      <td>
                        <span className="badge badge-green">
                          {ACTION_LABEL[item.resolution?.action] || "Resolved"}
                        </span>
                        {item.resolution?.by && (
                          <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 6 }}>
                            by {item.resolution.by}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {resolving && (
        <ResolveModal item={resolving} onClose={() => setResolving(null)} onResolved={onResolved} />
      )}
    </div>
  );
}

function ResolveModal({ item, onClose, onResolved }) {
  const [action, setAction] = useState("reassign");
  const [clinicians, setClinicians] = useState([]);
  const [clinicianId, setClinicianId] = useState("");
  const [newTime, setNewTime] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .getClinicians()
      .then((list) => setClinicians(list.filter((c) => c.id !== item.clinicianId)))
      .catch((e) => setErr(e.message || "Failed to load clinicians."));
  }, [item]);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    const body = { action };
    if (action === "reassign") {
      if (!clinicianId) {
        setErr("Choose a clinician to reassign to.");
        return;
      }
      body.clinicianId = clinicianId;
    } else if (action === "reschedule") {
      const startsAt = Math.floor(new Date(newTime).getTime() / 1000);
      if (!startsAt || Number.isNaN(startsAt)) {
        setErr("Choose the new date and time.");
        return;
      }
      body.startsAt = startsAt;
    }
    setLoading(true);
    try {
      const resolved = await api.resolveReassignment(item.id, body);
      onResolved(resolved);
    } catch (e2) {
      if (e2.code === "slot_taken") setErr("That slot is already booked — pick another time or clinician.");
      else if (e2.code === "clinician_unavailable")
        setErr("The clinician is unavailable then (availability block) — pick another option.");
      else if (e2.code === "conflict") setErr("This item was already resolved by someone else.");
      else setErr(e2.message || "Failed to resolve.");
      setLoading(false);
    }
  }

  const options = [
    { key: "reassign", label: "Reassign", sub: "Hand to another clinician at the same time", icon: UserCheck },
    { key: "reschedule", label: "Reschedule", sub: "Keep the clinician, move the time", icon: CalendarClock },
    { key: "cancel", label: "Cancel", sub: "Cancel and ask the patient to rebook", icon: Ban },
  ];

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !loading && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3>Resolve reassignment</h3>
          <button className="btn-icon" aria-label="Close" onClick={onClose} disabled={loading}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          {err && <div className="alert alert-error">{err}</div>}
          <p style={{ fontSize: 13.5, marginBottom: 14, lineHeight: 1.5 }}>
            <strong>{item.patientName}</strong> with <strong>{item.clinicianName}</strong> on{" "}
            {fmtUnix(item.startsAt)} ({item.durationMin || 30} min)
          </p>
          <form id="resolve-form" onSubmit={submit}>
            <div className="field">
              <label>Decision</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {options.map(({ key, label, sub, icon: Icon }) => (
                  <label
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      border: `1.5px solid ${action === key ? "var(--teal-500)" : "var(--border)"}`,
                      borderRadius: "var(--r-sm)",
                      cursor: "pointer",
                      background: action === key ? "var(--teal-50)" : "transparent",
                    }}
                  >
                    <input
                      type="radio"
                      name="action"
                      value={key}
                      checked={action === key}
                      onChange={() => setAction(key)}
                    />
                    <Icon size={15} />
                    <span>
                      <span style={{ fontWeight: 600, fontSize: 13.5 }}>{label}</span>
                      <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)" }}>{sub}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {action === "reassign" && (
              <div className="field">
                <label>Reassign to</label>
                <select value={clinicianId} onChange={(e) => setClinicianId(e.target.value)} required>
                  <option value="">Select a clinician…</option>
                  {clinicians.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.department ? ` — ${c.department}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {action === "reschedule" && (
              <div className="field">
                <label>New date & time</label>
                <input type="datetime-local" value={newTime} onChange={(e) => setNewTime(e.target.value)} required />
              </div>
            )}
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            form="resolve-form"
            type="submit"
            className={`btn ${action === "cancel" ? "btn-danger" : "btn-primary"}`}
            disabled={loading}
          >
            {loading ? "Resolving…" : action === "cancel" ? "Cancel appointment" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
