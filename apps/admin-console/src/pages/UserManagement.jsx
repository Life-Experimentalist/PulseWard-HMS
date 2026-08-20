import React, { useEffect, useState } from "react";
import { Users, Plus, Search, Trash2, X, Clock, AlertTriangle } from "lucide-react";
import { api } from "../api.js";

function fmt(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const ROLE_BADGE = {
  admin: "badge-red",
  clinician: "badge-blue",
  patient: "badge-teal",
  frontdesk: "badge-orange",
  ops: "badge-grey",
};

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  async function load(query) {
    setLoading(true);
    api
      .getUsers(query)
      .then(setUsers)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Users</h2>
          <p>Manage all platform accounts</p>
        </div>
        <div className="header-right">
          <div className="search-bar" style={{ minWidth: 280 }}>
            <Search size={14} color="var(--text-muted)" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or email…"
            />
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={15} /> Add user
          </button>
        </div>
      </div>

      {err && <div className="alert alert-error">{err}</div>}

      <div className="card">
        {loading ? (
          <div className="loading">
            <Clock size={16} className="spin" /> Loading…
          </div>
        ) : users.length === 0 ? (
          <div className="empty-state">
            <Users size={40} />
            <p>No users found</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td className="font-mono" style={{ fontSize: 12 }}>
                      {u.email}
                    </td>
                    <td>
                      <span className={`badge ${ROLE_BADGE[u.role] || "badge-grey"}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>{fmt(u.createdAt)}</td>
                    <td>
                      <button
                        className="btn-icon"
                        aria-label={`Delete ${u.name}`}
                        onClick={() => setConfirmDelete(u)}
                        title="Delete user"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <AddUserModal
          onClose={() => setShowModal(false)}
          onAdded={(u) => {
            setUsers((prev) => [u, ...prev]);
            setShowModal(false);
          }}
        />
      )}
      {confirmDelete && (
        <ConfirmDeleteModal
          user={confirmDelete}
          onClose={() => setConfirmDelete(null)}
          onDeleted={(id) => {
            setUsers((prev) => prev.filter((u) => u.id !== id));
            setConfirmDelete(null);
          }}
        />
      )}
    </div>
  );
}

function ConfirmDeleteModal({ user, onClose, onDeleted }) {
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function runDelete() {
    setErr("");
    setLoading(true);
    try {
      await api.deleteUser(user.id);
      onDeleted(user.id);
    } catch (e) {
      setErr(e.message || "Failed to delete user.");
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
        aria-labelledby="confirm-del-title"
      >
        <div className="modal-header">
          <h3 id="confirm-del-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={18} color="var(--error)" /> Delete user
          </h3>
          <button className="btn-icon" aria-label="Close" onClick={onClose} disabled={loading}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          {err && <div className="alert alert-error">{err}</div>}
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            This permanently removes <strong>{user.name}</strong> ({user.email}) and revokes their
            access. This action cannot be undone.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={runDelete} disabled={loading}>
            {loading ? "Deleting…" : "Delete user"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddUserModal({ onClose, onAdded }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "patient",
    phone: "",
  });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const result = await api.createUser(form);
      onAdded({ id: result.userId, ...form, createdAt: new Date().toISOString() });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3>Add User</h3>
          <button className="btn-icon" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          {err && <div className="alert alert-error">{err}</div>}
          <form id="user-form" onSubmit={submit}>
            <div className="field">
              <label>Full name</label>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </div>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Role</label>
                <select value={form.role} onChange={(e) => set("role", e.target.value)}>
                  {["patient", "clinician", "admin", "frontdesk", "ops"].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Phone</label>
                <input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button form="user-form" type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Creating…" : "Create user"}
          </button>
        </div>
      </div>
    </div>
  );
}
