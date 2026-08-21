const BASE = "/api/v1";

function getToken() {
  return localStorage.getItem("pw_ops_token");
}
function setToken(t) {
  localStorage.setItem("pw_ops_token", t);
}
function getRefresh() {
  return localStorage.getItem("pw_ops_refresh");
}
function setRefresh(t) {
  localStorage.setItem("pw_ops_refresh", t);
}

export function clearAuth() {
  localStorage.removeItem("pw_ops_token");
  localStorage.removeItem("pw_ops_refresh");
  localStorage.removeItem("pw_ops_user");
}
export function getUser() {
  try {
    return JSON.parse(localStorage.getItem("pw_ops_user") || "null");
  } catch {
    return null;
  }
}
export function setUser(u) {
  localStorage.setItem("pw_ops_user", JSON.stringify(u));
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
// server-side reuse-detection, force-logging the user out.
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
  async me() {
    return req("GET", "/auth/me");
  },

  // Platform health — the single API gateway reports its own and the database's
  // real status (there are no separate microservices to poll).
  async getHealth() {
    const d = await req("GET", "/platform/health");
    return { services: d.services || [], metrics: d.metrics || {} };
  },
  async getIncidents() {
    const d = await req("GET", "/platform/incidents");
    return d.incidents || [];
  },
  // {severity: sev1|sev2|sev3, title, service?, detail?, owner?}
  async createIncident(body) {
    const d = await req("POST", "/platform/incidents", body);
    return d.incident;
  },
  // {status?: open|monitoring|resolved, severity?, owner?, detail?}
  async patchIncident(id, body) {
    const d = await req("PATCH", `/platform/incidents/${id}`, body);
    return d.incident;
  },
};
