const BASE = "/api/v1";

function getToken() {
  return localStorage.getItem("pw_admin_token");
}
function setToken(t) {
  localStorage.setItem("pw_admin_token", t);
}
function getRefresh() {
  return localStorage.getItem("pw_admin_refresh");
}
function setRefresh(t) {
  localStorage.setItem("pw_admin_refresh", t);
}

export function clearAuth() {
  localStorage.removeItem("pw_admin_token");
  localStorage.removeItem("pw_admin_refresh");
  localStorage.removeItem("pw_admin_user");
}
export function getUser() {
  try {
    return JSON.parse(localStorage.getItem("pw_admin_user") || "null");
  } catch {
    return null;
  }
}
export function setUser(u) {
  localStorage.setItem("pw_admin_user", JSON.stringify(u));
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
    const refreshed = await tryRefresh();
    if (refreshed) return req(method, path, body, false);
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

function unix(ts) {
  if (!ts) return null;
  if (typeof ts === "string") return ts;
  return new Date(ts * 1000).toISOString();
}

export const api = {
  async login(email, password) {
    const data = await req("POST", "/auth/login", { email, password });
    setToken(data.token);
    setRefresh(data.refresh);
    const user = { ...data.user };
    setUser(user);
    return { user };
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

  async getStats() {
    const d = await req("GET", "/admin/stats");
    const s = d.stats || {};
    return {
      users: s.userCount,
      clinicians: s.clinicianCount,
      patients: s.patientCount,
      appointmentsToday: s.apptToday,
      pendingLabs: s.pendingLabs,
      tenants: 1,
    };
  },

  // Real platform health — the single API gateway reports its own and the
  // database's live status (there are no separate microservices to poll).
  async getHealth() {
    const d = await req("GET", "/platform/health");
    return { services: d.services || [], metrics: d.metrics || {} };
  },

  async getUsers(q) {
    const d = await req("GET", `/admin/users${q ? "?q=" + encodeURIComponent(q) : ""}`);
    return (d.users || []).map((u) => ({
      ...u,
      createdAt: unix(u.createdAt),
      lastLoginAt: unix(u.lastLoginAt),
    }));
  },

  async createUser(body) {
    return req("POST", "/admin/users", body);
  },

  async deleteUser(id) {
    return req("DELETE", `/admin/users/${id}`);
  },

  async getAuditLog(limit = 50) {
    const d = await req("GET", `/admin/audit?limit=${limit}`);
    return (d.events || []).map((e) => ({
      ...e,
      actorId: e.actor,
      resource: e.scope?.split(":")[0] || e.scope,
      resourceId: e.scope?.split(":")[1],
      ipAddress: e.ip,
      action: e.action?.split(".").pop() || e.action,
      createdAt: unix(e.at),
    }));
  },

  async getTenants() {
    const d = await req("GET", "/admin/tenants");
    return d.tenants || [];
  },

  async getReassignments(status = "open") {
    const d = await req("GET", `/reassignments?status=${status}`);
    return d.queue || [];
  },

  // action: reassign {clinicianId} | reschedule {startsAt unix} | cancel
  async resolveReassignment(id, body) {
    const d = await req("POST", `/reassignments/${id}/resolve`, body);
    return d.item;
  },

  async getClinicians() {
    const d = await req("GET", "/clinicians");
    return (d.clinicians || []).map((c) => ({
      ...c,
      specialisation: c.specialty,
      registrationNumber: c.npi,
    }));
  },

  async createClinician(body) {
    return req("POST", "/admin/clinicians", {
      ...body,
      specialty: body.specialisation || body.specialty,
      npi: body.registrationNumber || body.npi,
    });
  },
};
