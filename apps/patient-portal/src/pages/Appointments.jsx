import React, { useState, useEffect } from "react";
import { Calendar, Plus, X, Clock, User, Stethoscope, AlertTriangle } from "lucide-react";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";

function fmt(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtDate(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const STATUS_BADGE = {
  scheduled: "badge-teal",
  "checked-in": "badge-blue",
  "in-progress": "badge-orange",
  completed: "badge-green",
  cancelled: "badge-red",
  "no-show": "badge-grey",
};

export default function Appointments() {
  const { user } = useAuth();
  const [appts, setAppts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("upcoming");
  const [showModal, setShowModal] = useState(false);
  const [err, setErr] = useState("");
  const [cancelTarget, setCancelTarget] = useState(null);

  useEffect(() => {
    load();
  }, [filter]);

  async function load() {
    setLoading(true);
    try {
      const params = filter === "upcoming" ? { upcoming: true } : {};
      const data = await api.getAppointments(params);
      setAppts(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Appointments</h2>
          <p>Manage and book your consultations</p>
        </div>
        <div className="header-right">
          <div className="tabs" style={{ margin: 0, border: "none" }}>
            {["upcoming", "all"].map((f) => (
              <button
                key={f}
                className={`tab-btn ${filter === f ? "active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f === "upcoming" ? "Upcoming" : "All"}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={15} /> Book appointment
          </button>
        </div>
      </div>

      {err && <div className="alert alert-error">{err}</div>}

      <div className="card">
        {loading ? (
          <div className="loading">
            <Clock size={16} className="spin" /> Loading…
          </div>
        ) : appts.length === 0 ? (
          <div className="empty-state">
            <Calendar size={40} />
            <p>No appointments found</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Clinician</th>
                  <th>Department</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {appts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className="font-mono">{fmt(a.scheduledAt)}</span>
                    </td>
                    <td>{a.clinicianName || "—"}</td>
                    <td>{a.department || "—"}</td>
                    <td>{a.type || "Consultation"}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[a.status] || "badge-grey"}`}>
                        {a.status}
                      </span>
                    </td>
                    <td>
                      {a.status === "scheduled" && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => setCancelTarget(a)}
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <BookModal
          onClose={() => setShowModal(false)}
          onBooked={() => {
            setShowModal(false);
            load();
          }}
          patientId={user?.patientId}
        />
      )}
      {cancelTarget && (
        <CancelModal
          appt={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onCancelled={(id) => {
            setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, status: "cancelled" } : a)));
            setCancelTarget(null);
          }}
        />
      )}
    </div>
  );
}

function CancelModal({ appt, onClose, onCancelled }) {
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function runCancel() {
    setErr("");
    setLoading(true);
    try {
      await api.patchAppointment(appt.id, { status: "cancelled" });
      onCancelled(appt.id);
    } catch (e) {
      setErr(e.message || "Failed to cancel appointment.");
      setLoading(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && !loading && onClose()}
    >
      <div
        className="modal"
        style={{ maxWidth: 420 }}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cancel-appt-title"
      >
        <div className="modal-header">
          <h3 id="cancel-appt-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={18} color="var(--error)" /> Cancel appointment
          </h3>
          <button className="btn-icon" aria-label="Close" onClick={onClose} disabled={loading}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          {err && <div className="alert alert-error">{err}</div>}
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            Cancel your {appt.type || "Consultation"} with {appt.clinicianName || "your clinician"}{" "}
            on <strong>{fmt(appt.scheduledAt)}</strong>? You'll need to book again if you change
            your mind.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>
            Keep appointment
          </button>
          <button className="btn btn-danger" onClick={runCancel} disabled={loading}>
            {loading ? "Cancelling…" : "Cancel appointment"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BookModal({ onClose, onBooked, patientId }) {
  const [clinicians, setClinicians] = useState([]);
  const [form, setForm] = useState({
    clinicianId: "",
    date: "",
    time: "09:00",
    type: "Consultation",
    notes: "",
  });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .getClinicians()
      .then(setClinicians)
      .catch(() => {});
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    if (!form.clinicianId) {
      setErr("Please select a clinician");
      return;
    }
    if (!form.date) {
      setErr("Please select a date");
      return;
    }
    setErr("");
    setLoading(true);
    try {
      const scheduledAt = new Date(`${form.date}T${form.time}:00`).toISOString();
      await api.createAppointment({
        clinicianId: form.clinicianId,
        patientId,
        scheduledAt,
        durationMins: 30,
        type: form.type,
        notes: form.notes || undefined,
      });
      onBooked();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3>Book Appointment</h3>
          <button className="btn-icon" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          {err && <div className="alert alert-error">{err}</div>}
          <form id="book-form" onSubmit={submit}>
            <div className="field">
              <label>Clinician</label>
              <select
                value={form.clinicianId}
                onChange={(e) => set("clinicianId", e.target.value)}
                required
              >
                <option value="">— Select clinician —</option>
                {clinicians.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.department}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Date</label>
                <input
                  type="date"
                  value={form.date}
                  min={today}
                  onChange={(e) => set("date", e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label>Time</label>
                <input
                  type="time"
                  value={form.time}
                  onChange={(e) => set("time", e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="field">
              <label>Appointment type</label>
              <select value={form.type} onChange={(e) => set("type", e.target.value)}>
                <option>Consultation</option>
                <option>Follow-up</option>
                <option>Procedure</option>
                <option>Emergency</option>
              </select>
            </div>
            <div className="field">
              <label>Notes (optional)</label>
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Reason for visit, symptoms…"
                rows={3}
              />
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button form="book-form" type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Booking…" : "Confirm booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
