import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const data = await api.login(form.email, form.password);
      if (data.user.role !== "clinician" && data.user.role !== "admin") {
        throw new Error("This portal is for clinicians only. Please use the patient portal.");
      }
      login(data.user);
      navigate("/");
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-mark-lg">P</div>
          <div className="brand">
            PulseWard<span>Clinician Portal</span>
          </div>
        </div>
        <h2>Clinician sign in</h2>
        <p className="sub">Access your schedule, patient records, and clinical tools.</p>
        {err && <div className="alert alert-error">{err}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="clin-email">Email</label>
            <input
              id="clin-email"
              type="email"
              autoComplete="username"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="dr.sharma@pulseward.com"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="clin-password">Password</label>
            <input
              id="clin-password"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="••••••••"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div
          style={{
            marginTop: 16,
            padding: "12px 14px",
            background: "var(--teal-50)",
            borderRadius: "var(--r-sm)",
            fontSize: 12,
            color: "var(--text-secondary)",
          }}
        >
          <strong>Demo:</strong> dr.sharma@pulseward.com / Doctor@123
        </div>
      </div>
    </div>
  );
}
