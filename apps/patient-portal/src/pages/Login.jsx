import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", name: "", phone: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      let data;
      if (mode === "login") {
        data = await api.login(form.email, form.password);
      } else {
        data = await api.signup({
          email: form.email,
          password: form.password,
          name: form.name,
          phone: form.phone,
          role: "patient",
        });
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
          <div className="logo-mark">P</div>
          <div className="brand">
            PulseWard<span>Patient Portal</span>
          </div>
        </div>
        <h2>{mode === "login" ? "Welcome back" : "Create account"}</h2>
        <p className="sub">
          {mode === "login"
            ? "Sign in to access your care space."
            : "Register to manage your health records."}
        </p>

        {err && <div className="alert alert-error">{err}</div>}

        <form onSubmit={submit}>
          {mode === "signup" && (
            <>
              <div className="field">
                <label htmlFor="pt-name">Full name</label>
                <input
                  id="pt-name"
                  type="text"
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Riya Patel"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="pt-phone">Phone</label>
                <input
                  id="pt-phone"
                  type="tel"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="pt-email">Email address</label>
            <input
              id="pt-email"
              type="email"
              autoComplete="username"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="patient@pulseward.com"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="pt-password">Password</label>
            <input
              id="pt-password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        {mode === "login" && (
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
            <strong>Demo credentials:</strong>
            <br />
            patient@pulseward.com / Patient@123
          </div>
        )}

        <div className="auth-switch">
          {mode === "login" ? (
            <span>
              No account?{" "}
              <button
                onClick={() => {
                  setMode("signup");
                  setErr("");
                }}
              >
                Register
              </button>
            </span>
          ) : (
            <span>
              Already registered?{" "}
              <button
                onClick={() => {
                  setMode("login");
                  setErr("");
                }}
              >
                Sign in
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
