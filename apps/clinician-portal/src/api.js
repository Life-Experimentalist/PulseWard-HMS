const BASE = "/api/v1";

function getToken() {
  return localStorage.getItem("pw_clin_token");
}
function setToken(t) {
  localStorage.setItem("pw_clin_token", t);
}
function setRefresh(t) {
  localStorage.setItem("pw_clin_refresh", t);
}
function getRefresh() {
  return localStorage.getItem("pw_clin_refresh");
}

export function clearAuth() {
  localStorage.removeItem("pw_clin_token");
  localStorage.removeItem("pw_clin_refresh");
  localStorage.removeItem("pw_clin_user");
}
export function getUser() {
  try {
    return JSON.parse(localStorage.getItem("pw_clin_user") || "null");
  } catch {
    return null;
  }
}
export function setUser(u) {
  localStorage.setItem("pw_clin_user", JSON.stringify(u));
}

function unix(ts) {
  if (!ts) return null;
  if (typeof ts === "string") return ts;
  return new Date(ts * 1000).toISOString();
}

function normAppt(a) {
  return {
    ...a,
    scheduledAt: a.startsAtISO || unix(a.startsAt),
    type: a.kind || a.type || "Consultation",
    durationMins: a.durationMin || 30,
    status: a.status || "scheduled",
  };
}

function normPatient(p) {
  if (!p) return null;
  // vitalsJson is a recorded series (newest last); legacy rows held one object.
  const series = Array.isArray(p.vitalsJson)
    ? p.vitalsJson
    : p.vitalsJson && typeof p.vitalsJson === "object"
    ? [p.vitalsJson]
    : [];
  let latest = null;
  if (series.length) {
    const vals = { ...series[series.length - 1] };
    delete vals.at;
    delete vals.by;
    if (Object.keys(vals).length) latest = vals;
  }
  return {
    ...p,
    bloodGroup: p.bloodType,
    conditions: Array.isArray(p.conditionsJson) ? p.conditionsJson : [],
    allergies: Array.isArray(p.allergiesJson) ? p.allergiesJson : [],
    vitals: latest,
    vitalsSeries: series,
  };
}

function normNote(n) {
  if (!n) return null;
  const body = n.body || {};
  return {
    ...n,
    subjective: body.subjective || body.s || "",
    objective: body.objective || body.o || "",
    assessment: body.assessment || body.a || "",
    plan: body.plan || body.p || "",
    text: body.text || "",
    signedAt: unix(n.signedAt),
    createdAt: unix(n.createdAt),
  };
}

function normLab(l) {
  const results =
    l.results && typeof l.results === "object" && !Array.isArray(l.results)
      ? Object.entries(l.results).map(([k, v]) =>
          typeof v === "object" ? { name: k, ...v } : { name: k, value: String(v) }
        )
      : Array.isArray(l.results)
      ? l.results
      : [];
  return {
    ...l,
    testName: l.panel || l.testName,
    orderedAt: unix(l.orderedAt),
    reportedAt: unix(l.reviewedAt),
    results,
  };
}

function normRx(r) {
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
  if (!res.ok) {
    const err = new Error(data.message || data.error || `HTTP ${res.status}`);
    err.code = data.error;
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Single-flight refresh: rotated single-use refresh tokens mean concurrent 401s
// must share one refresh call, or the losers replay a spent token and trip
// server-side reuse-detection, force-logging the user out. See patient-portal.
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
  return { ...u, clinicianId: u.linkedEntityId || u.clinicianId };
}

export const api = {
  async login(email, password) {
    const data = await req("POST", "/auth/login", { email, password });
    setToken(data.token);
    setRefresh(data.refresh);
    const user = normUser(data.user);
    setUser(user);
    return { user };
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

  async getPatients(q) {
    const d = await req("GET", `/patients${q ? "?q=" + encodeURIComponent(q) : ""}`);
    return (d.patients || []).map(normPatient);
  },
  async getPatient(id) {
    const d = await req("GET", `/patients/${id}`);
    return normPatient(d.patient || d);
  },
  async patchPatient(id, body) {
    const d = await req("PATCH", `/patients/${id}`, body);
    return normPatient(d.patient || d);
  },

  async getAppointments(params = {}) {
    const q = new URLSearchParams(params).toString();
    const d = await req("GET", `/appointments${q ? "?" + q : ""}`);
    return (d.appointments || []).map(normAppt);
  },
  async patchAppointment(id, body) {
    const d = await req("PATCH", `/appointments/${id}`, body);
    return normAppt(d.appointment || d);
  },

  async getNotes(patientId) {
    const d = await req("GET", `/notes?patientId=${patientId}`);
    return (d.notes || []).map(normNote);
  },
  async createNote(body) {
    const payload = {
      patientId: body.patientId,
      clinicianId: body.clinicianId,
      type: (body.type || "soap").toLowerCase(),
      body: {
        subjective: body.subjective || "",
        objective: body.objective || "",
        assessment: body.assessment || "",
        plan: body.plan || "",
      },
    };
    const d = await req("POST", "/notes", payload);
    return normNote(d.note || d);
  },
  async signNote(id) {
    const d = await req("POST", `/notes/${id}/sign`, {});
    return normNote(d.note || d);
  },

  async getLabs(patientId) {
    const d = await req("GET", `/labs?patientId=${patientId}`);
    return (d.labs || []).map(normLab);
  },
  async createLab(body) {
    const d = await req("POST", "/labs", {
      patientId: body.patientId,
      clinicianId: body.clinicianId,
      panel: body.testName || body.panel,
    });
    return normLab(d.lab || d);
  },
  async patchLab(id, body) {
    const d = await req("PATCH", `/labs/${id}`, body);
    return normLab(d.lab || d);
  },

  async getPrescriptions(patientId) {
    const d = await req("GET", `/prescriptions?patientId=${patientId}`);
    return (d.prescriptions || []).map(normRx);
  },
  async createPrescription(body) {
    const payload = {
      patientId: body.patientId,
      clinicianId: body.clinicianId,
      drug: body.drugName || body.drug,
      form: body.route || body.form,
      dose: body.dose,
      freq: body.frequency || body.freq,
      duration: body.durationDays || body.duration,
      instructions: body.instructions,
      ...(body.overrideReason ? { overrideReason: body.overrideReason } : {}),
    };
    const d = await req("POST", "/prescriptions", payload);
    return normRx(d.prescription || d);
  },
  async patchPrescription(id, body) {
    const d = await req("PATCH", `/prescriptions/${id}`, body);
    return normRx(d.prescription || d);
  },

  async recordVitals(patientId, body) {
    const d = await req("POST", `/patients/${patientId}/vitals`, body);
    return d.vitals || [];
  },
  async addAddendum(noteId, text) {
    const d = await req("POST", `/notes/${noteId}/addendum`, { body: { text } });
    return normNote(d.note || d);
  },

  async getMessages(patientId) {
    const d = await req("GET", `/messages${patientId ? "?patientId=" + patientId : ""}`);
    return d.messages || [];
  },
  async sendMessage(body) {
    const d = await req("POST", "/messages", {
      patientId: body.patientId,
      clinicianId: body.clinicianId,
      subject: body.subject,
      text: body.text || body.body,
      threadId: body.threadId,
    });
    return d.message || d;
  },
  async markMessageRead(threadId) {
    return req("POST", `/messages/${threadId}/read`, {});
  },

  async getAvailability() {
    const d = await req("GET", "/availability");
    return d.blocks || [];
  },
  async createBlock(body) {
    // { startsAt, endsAt (unix seconds), kind, reason } → { block, affectedAppointments }
    const d = await req("POST", "/availability", body);
    return { block: d.block, affectedAppointments: (d.affectedAppointments || []).map(normAppt) };
  },
  async deleteBlock(id) {
    return req("DELETE", `/availability/${id}`);
  },

  async getReassignments(status = "open") {
    const d = await req("GET", `/reassignments?status=${status}`);
    return d.queue || [];
  },
  async queueReassignment(body) {
    // { appointmentId, blockId?, reason? }
    const d = await req("POST", "/reassignments", body);
    return d.item;
  },

  async getTasks() {
    const d = await req("GET", "/tasks");
    return d.tasks || [];
  },
  async createTask(body) {
    const d = await req("POST", "/tasks", body);
    return d.task;
  },
  async patchTask(id, body) {
    const d = await req("PATCH", `/tasks/${id}`, body);
    return d.task;
  },
  async deleteTask(id) {
    return req("DELETE", `/tasks/${id}`);
  },

  async getClinicians() {
    const d = await req("GET", "/clinicians");
    return (d.clinicians || []).map((c) => ({ ...c, specialisation: c.specialty }));
  },
};
