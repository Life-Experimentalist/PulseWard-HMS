const BASE = "/api/v1";

function getToken() {
  return localStorage.getItem("pw_token");
}
function setToken(t) {
  localStorage.setItem("pw_token", t);
}
function setRefresh(t) {
  localStorage.setItem("pw_refresh", t);
}
function getRefresh() {
  return localStorage.getItem("pw_refresh");
}

export function clearAuth() {
  localStorage.removeItem("pw_token");
  localStorage.removeItem("pw_refresh");
  localStorage.removeItem("pw_user");
}
export function getUser() {
  try {
    return JSON.parse(localStorage.getItem("pw_user") || "null");
  } catch {
    return null;
  }
}
export function setUser(u) {
  localStorage.setItem("pw_user", JSON.stringify(u));
}

function unix(ts) {
  if (!ts) return null;
  if (typeof ts === "string") return ts;
  return new Date(ts * 1000).toISOString();
}

function normPatient(p) {
  if (!p) return null;
  return {
    ...p,
    bloodGroup: p.bloodType || p.bloodGroup,
    conditions: Array.isArray(p.conditionsJson) ? p.conditionsJson : p.conditions || [],
    allergies: Array.isArray(p.allergiesJson) ? p.allergiesJson : p.allergies || [],
    vitals: p.vitalsJson && !Array.isArray(p.vitalsJson) ? p.vitalsJson : p.vitals || null,
  };
}

function normAppt(a) {
  if (!a) return null;
  return {
    ...a,
    scheduledAt: a.startsAtISO || unix(a.startsAt),
    type: a.kind || a.type,
    durationMins: a.durationMin || a.durationMins || 30,
  };
}

function normLab(l) {
  if (!l) return null;
  const results =
    l.results && typeof l.results === "object" && !Array.isArray(l.results)
      ? Object.entries(l.results).map(([k, v]) =>
          typeof v === "object" ? { name: k, ...v } : { name: k, value: v }
        )
      : Array.isArray(l.results)
      ? l.results
      : [];
  return {
    ...l,
    testName: l.panel || l.testName,
    orderedAt: unix(l.orderedAt),
    reportedAt: unix(l.reviewedAt || l.reportedAt),
    results,
  };
}

function normRx(r) {
  if (!r) return null;
  const pa = unix(r.prescribedAt);
  let validUntil = null;
  if (pa && r.duration) {
    const d = new Date(pa);
    d.setDate(d.getDate() + Number(r.duration));
    validUntil = d.toISOString();
  }
  return {
    ...r,
    drugName: r.drug || r.drugName,
    frequency: r.freq || r.frequency,
    route: r.form || r.route,
    prescribedAt: pa,
    validUntil,
  };
}

function normNote(n) {
  if (!n) return null;
  const body = n.body || {};
  return {
    ...n,
    subjective: body.subjective || body.s || n.subjective,
    objective: body.objective || body.o || n.objective,
    assessment: body.assessment || body.a || n.assessment,
    plan: body.plan || body.p || n.plan,
    signedAt: unix(n.signedAt),
    createdAt: unix(n.createdAt),
  };
}

function normNotif(n) {
  return { ...n, readAt: unix(n.readAt), createdAt: unix(n.createdAt) };
}

async function req(method, path, body, retry = true) {
  const token = getToken();
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  };
  const res = await fetch(BASE + path, opts);
  if (res.status === 401 && retry) {
    const ok = await tryRefresh();
    if (ok) return req(method, path, body, false);
    clearAuth();
    window.location.href = "/";
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return data;
}

// Single-flight refresh: refresh tokens are single-use and rotated on the
// server, and replaying a consumed token trips reuse-detection (which revokes
// the whole session family). If several requests 401 at once they must share
// ONE refresh call, or the losers would replay an already-spent token and get
// the user force-logged-out.
let refreshInFlight = null;
function tryRefresh() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const rt = getRefresh();
    if (!rt) return false;
    try {
      const res = await fetch(BASE + "/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: rt }),
      });
      if (!res.ok) return false;
      const d = await res.json();
      setToken(d.token);
      if (d.refresh) setRefresh(d.refresh);
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function normUser(u) {
  if (!u) return null;
  return { ...u, patientId: u.linkedEntityId || u.patientId };
}

export const api = {
  async login(email, password) {
    const data = await req("POST", "/auth/login", { email, password });
    setToken(data.token);
    setRefresh(data.refresh);
    const user = normUser(data.user);
    setUser(user);
    return { accessToken: data.token, refreshToken: data.refresh, user };
  },
  async signup(payload) {
    const data = await req("POST", "/auth/signup", payload);
    setToken(data.token);
    setRefresh(data.refresh);
    const user = normUser(data.user);
    setUser(user);
    return { accessToken: data.token, refreshToken: data.refresh, user };
  },
  async me() {
    return req("GET", "/auth/me");
  },
  async logout() {
    const rt = getRefresh();
    try {
      if (rt)
        await fetch(BASE + "/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh: rt }),
        });
    } catch {
      /* best-effort — clear client state regardless */
    }
    clearAuth();
  },

  async getPatient(id) {
    const d = await req("GET", `/patients/${id}`);
    return normPatient(d.patient || d);
  },
  async updatePatient(id, body) {
    const d = await req("PATCH", `/patients/${id}`, body);
    return normPatient(d.patient || d);
  },

  async getAppointments(params = {}) {
    const q = new URLSearchParams(params).toString();
    const d = await req("GET", `/appointments${q ? "?" + q : ""}`);
    return (d.appointments || []).map(normAppt);
  },
  async createAppointment(body) {
    const payload = {
      patientId: body.patientId,
      clinicianId: body.clinicianId,
      startsAt: Math.floor(new Date(body.scheduledAt).getTime() / 1000),
      durationMin: body.durationMins || 30,
      kind: body.type || "consultation",
      reason: body.notes,
    };
    const d = await req("POST", "/appointments", payload);
    return normAppt(d.appointment || d);
  },
  async patchAppointment(id, body) {
    const payload = { ...body };
    if (body.scheduledAt)
      payload.startsAt = Math.floor(new Date(body.scheduledAt).getTime() / 1000);
    const d = await req("PATCH", `/appointments/${id}`, payload);
    return normAppt(d.appointment || d);
  },

  async getClinicians() {
    const d = await req("GET", "/clinicians");
    return (d.clinicians || []).map((c) => ({ ...c, specialisation: c.specialty }));
  },

  async getNotes(patientId) {
    const d = await req("GET", `/notes?patientId=${patientId}`);
    return (d.notes || []).map(normNote);
  },
  async getLabs(patientId) {
    const d = await req("GET", `/labs?patientId=${patientId}`);
    return (d.labs || []).map(normLab);
  },
  async getPrescriptions(patientId, active) {
    const q = `?patientId=${patientId}${active ? "&active=true" : ""}`;
    const d = await req("GET", `/prescriptions${q}`);
    return (d.prescriptions || []).map(normRx);
  },

  async getMessages(patientId) {
    const d = await req("GET", `/messages?patientId=${patientId}`);
    return d.messages || [];
  },
  async sendMessage(body) {
    const payload = {
      patientId: body.patientId,
      clinicianId: body.clinicianId,
      subject: body.subject,
      text: body.body,
      threadId: body.threadId,
    };
    const d = await req("POST", "/messages", payload);
    return d.message || d;
  },

  async getNotifications() {
    const d = await req("GET", "/notifications");
    return (d.notifications || []).map(normNotif);
  },
  async markNotifRead(id) {
    return req("POST", `/notifications/${id}/read`, {});
  },
  async markAllNotifRead() {
    return req("POST", "/notifications/read-all", {});
  },
};
