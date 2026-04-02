import { useEffect, useMemo, useState } from "react";

const localStorageKey = "pulseward-admin-console-config";

const defaultConfig = {
  tenantKey: "default",
  authBaseUrl: "http://localhost:5101",
  notificationBaseUrl: "http://localhost:5102",
  appointmentBaseUrl: "http://localhost:5103",
};

const tabs = [
  { key: "overview", label: "Overview" },
  { key: "integrations", label: "Integrations" },
  { key: "identity", label: "Identity" },
  { key: "abha", label: "ABHA API" },
  { key: "settings", label: "Settings" },
  { key: "activity", label: "Activity" },
];

function statusTone(value) {
  if (value === "ok") return "ok";
  if (value === "warn") return "warn";
  if (value === "pending") return "pending";
  return "bad";
}

function statusLabel(value) {
  if (value === "ok") return "Healthy";
  if (value === "warn") return "Degraded";
  if (value === "pending") return "Checking";
  return "Offline";
}

function nowStamp() {
  return new Date().toLocaleTimeString();
}

export default function App() {
  const [activeTab, setActiveTab] = useState("overview");
  const [config, setConfig] = useState(defaultConfig);
  const [activity, setActivity] = useState(["Initializing dashboard..."]);
  const [isSaving, setIsSaving] = useState(false);

  const [serviceStatus, setServiceStatus] = useState({
    auth: { state: "pending", detail: "Waiting for probe" },
    notification: { state: "pending", detail: "Waiting for probe" },
    appointment: { state: "pending", detail: "Waiting for probe" },
  });

  const [oauthProviders, setOauthProviders] = useState([]);
  const [googleStatus, setGoogleStatus] = useState({
    configured: false,
    redirectUri: "Unknown",
  });
  const [abhaStatus, setAbhaStatus] = useState({
    enabled: false,
    configured: false,
    mode: "sandbox",
    gatewayBaseUrl: "",
    hasClientId: false,
    hasClientSecret: false,
    hasGatewayBaseUrl: false,
  });
  const [abhaHealth, setAbhaHealth] = useState({
    state: "pending",
    detail: "ABHA gateway check pending",
    checkedUrl: "",
    statusCode: null,
    latencyMs: null,
  });

  const [telegramStatus, setTelegramStatus] = useState("Unknown");
  const [emailStatus, setEmailStatus] = useState("Unknown");

  const [telegramForm, setTelegramForm] = useState({
    botToken: "",
    chatId: "",
    message: "PulseWard Telegram integration test.",
  });

  const [emailForm, setEmailForm] = useState({
    host: "",
    port: 587,
    secure: false,
    user: "",
    pass: "",
    from: "",
    recipient: "",
    subject: "PulseWard SMTP integration test",
    message: "PulseWard SMTP integration validation message.",
  });

  const [storageInfo, setStorageInfo] = useState({
    source: "unknown",
    path: "not loaded",
    tenantCount: 0,
    updatedAt: null,
  });

  function addActivity(message, data) {
    const line = `[${nowStamp()}] ${message}`;
    const block = data ? `${line}\n${JSON.stringify(data, null, 2)}` : line;
    setActivity((current) => [block, ...current].slice(0, 80));
  }

  async function requestJson(url, options) {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.message || body.error || body.detail || `HTTP ${response.status}`);
    }
    return body;
  }

  function normalizeBaseUrl(value) {
    return (value || "").trim().replace(/\/$/, "");
  }

  function updateConfigField(field, value) {
    setConfig((prev) => ({ ...prev, [field]: value }));
  }

  function applySettingsPayload(payload) {
    const savedRouting = payload && payload.settings && payload.settings.routing;
    if (savedRouting) {
      setConfig((prev) => ({
        ...prev,
        tenantKey: savedRouting.tenantKey || prev.tenantKey,
        authBaseUrl: savedRouting.authBaseUrl || prev.authBaseUrl,
        notificationBaseUrl: savedRouting.notificationBaseUrl || prev.notificationBaseUrl,
        appointmentBaseUrl: savedRouting.appointmentBaseUrl || prev.appointmentBaseUrl,
      }));
    }

    if (payload && payload.settings && payload.settings.ui && payload.settings.ui.lastTab) {
      setActiveTab(payload.settings.ui.lastTab);
    }

    if (payload && payload.storage) {
      setStorageInfo({
        source: payload.storage.source || "server",
        path: payload.storage.path || "not-set",
        tenantCount: payload.storage.tenantCount || 0,
        updatedAt: payload.storage.updatedAt || null,
      });
    }
  }

  async function loadSavedSettings() {
    try {
      const response = await requestJson(
        `${normalizeBaseUrl(
          config.authBaseUrl
        )}/api/v1/admin/settings?tenantKey=${encodeURIComponent(config.tenantKey || "default")}`
      );
      applySettingsPayload(response);
      addActivity("Loaded tenant settings from auth-service store.", {
        tenantKey: response.tenantKey,
      });
      return;
    } catch (error) {
      addActivity("Server settings load failed, checking local fallback.", {
        error: error.message,
      });
    }

    const raw = localStorage.getItem(localStorageKey);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      setConfig((prev) => ({ ...prev, ...parsed }));
      addActivity("Loaded dashboard settings from browser localStorage fallback.");
    } catch (_error) {
      addActivity("Could not parse localStorage dashboard config.");
    }
  }

  async function saveSettings() {
    setIsSaving(true);
    const normalized = {
      tenantKey: (config.tenantKey || "default").trim() || "default",
      authBaseUrl: normalizeBaseUrl(config.authBaseUrl),
      notificationBaseUrl: normalizeBaseUrl(config.notificationBaseUrl),
      appointmentBaseUrl: normalizeBaseUrl(config.appointmentBaseUrl),
    };

    setConfig(normalized);
    localStorage.setItem(localStorageKey, JSON.stringify(normalized));

    try {
      const payload = {
        tenantKey: normalized.tenantKey,
        settings: {
          routing: normalized,
          ui: {
            lastTab: activeTab,
          },
        },
      };

      const response = await requestJson(`${normalized.authBaseUrl}/api/v1/admin/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      applySettingsPayload(response);
      addActivity("Saved tenant settings to auth-service persistent store.", {
        tenantKey: normalized.tenantKey,
      });
    } catch (error) {
      addActivity("Server settings save failed. Local fallback is still saved.", {
        error: error.message,
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function refreshStorageInfo() {
    try {
      const response = await requestJson(
        `${normalizeBaseUrl(config.authBaseUrl)}/api/v1/admin/settings/storage`
      );
      setStorageInfo({
        source: response.source || "server",
        path: response.path || "not-set",
        tenantCount: response.tenantCount || 0,
        updatedAt: response.updatedAt || null,
      });
    } catch (error) {
      addActivity("Storage metadata probe failed.", { error: error.message });
    }
  }

  async function refreshServiceHealth() {
    setServiceStatus({
      auth: { state: "pending", detail: "Checking /auth/roles" },
      notification: { state: "pending", detail: "Checking /integrations/messaging/providers" },
      appointment: { state: "pending", detail: "Checking /appointments" },
    });

    await Promise.all([
      (async () => {
        try {
          const authResponse = await requestJson(
            `${normalizeBaseUrl(config.authBaseUrl)}/api/v1/auth/roles`
          );
          setServiceStatus((prev) => ({
            ...prev,
            auth: { state: "ok", detail: `Roles loaded: ${authResponse.roles.length}` },
          }));
        } catch (error) {
          setServiceStatus((prev) => ({
            ...prev,
            auth: { state: "bad", detail: error.message },
          }));
        }
      })(),
      (async () => {
        try {
          const notificationResponse = await requestJson(
            `${normalizeBaseUrl(
              config.notificationBaseUrl
            )}/api/v1/integrations/messaging/providers?tenantKey=${encodeURIComponent(
              config.tenantKey || "default"
            )}`
          );
          setServiceStatus((prev) => ({
            ...prev,
            notification: {
              state: "ok",
              detail: `Providers found: ${notificationResponse.length}`,
            },
          }));
        } catch (error) {
          setServiceStatus((prev) => ({
            ...prev,
            notification: { state: "bad", detail: error.message },
          }));
        }
      })(),
      (async () => {
        try {
          await requestJson(`${normalizeBaseUrl(config.appointmentBaseUrl)}/api/v1/appointments`);
          setServiceStatus((prev) => ({
            ...prev,
            appointment: { state: "ok", detail: "Appointment API reachable" },
          }));
        } catch (error) {
          setServiceStatus((prev) => ({
            ...prev,
            appointment: { state: "warn", detail: error.message },
          }));
        }
      })(),
    ]);
  }

  async function refreshIdentity() {
    try {
      const providerResponse = await requestJson(
        `${normalizeBaseUrl(config.authBaseUrl)}/api/v1/auth/oauth/providers`
      );
      setOauthProviders(providerResponse.providers || []);
    } catch (error) {
      setOauthProviders([]);
      addActivity("OAuth provider scan failed.", { error: error.message });
    }

    try {
      const googleResponse = await requestJson(
        `${normalizeBaseUrl(config.authBaseUrl)}/api/v1/auth/oauth/google/config-status`
      );
      setGoogleStatus({
        configured: Boolean(googleResponse.configured),
        redirectUri: googleResponse.redirectUri || "Not configured",
      });
    } catch (error) {
      addActivity("Google OAuth status probe failed.", { error: error.message });
    }

    try {
      const abhaResponse = await requestJson(
        `${normalizeBaseUrl(config.authBaseUrl)}/api/v1/platform/abha/config-status`
      );
      setAbhaStatus({
        enabled: Boolean(abhaResponse.enabled),
        configured: Boolean(abhaResponse.configured),
        mode: abhaResponse.mode || "sandbox",
        gatewayBaseUrl: abhaResponse.gatewayBaseUrl || "",
        hasClientId: Boolean(abhaResponse.hasClientId),
        hasClientSecret: Boolean(abhaResponse.hasClientSecret),
        hasGatewayBaseUrl: Boolean(abhaResponse.hasGatewayBaseUrl),
      });
    } catch (error) {
      addActivity("ABHA status probe failed.", { error: error.message });
    }
  }

  async function checkAbhaGateway(logResult) {
    setAbhaHealth({
      state: "pending",
      detail: "Checking ABHA gateway reachability...",
      checkedUrl: "",
      statusCode: null,
      latencyMs: null,
    });

    try {
      const response = await requestJson(
        `${normalizeBaseUrl(config.authBaseUrl)}/api/v1/platform/abha/health-check?timeoutMs=4000`
      );

      setAbhaHealth({
        state: response.reachable ? "ok" : "warn",
        detail: response.detail || "ABHA gateway check completed",
        checkedUrl: response.checkedUrl || "",
        statusCode: response.statusCode,
        latencyMs: response.latencyMs,
      });

      if (logResult) {
        addActivity("ABHA health-check completed.", response);
      }
    } catch (error) {
      setAbhaHealth({
        state: "bad",
        detail: error.message,
        checkedUrl: "",
        statusCode: null,
        latencyMs: null,
      });

      if (logResult) {
        addActivity("ABHA health-check failed.", { error: error.message });
      }
    }
  }

  async function refreshIntegrationStatus() {
    try {
      const telegramResponse = await requestJson(
        `${normalizeBaseUrl(
          config.notificationBaseUrl
        )}/api/v1/integrations/messaging/telegram/config-status?tenantKey=${encodeURIComponent(
          config.tenantKey || "default"
        )}`
      );
      setTelegramStatus(
        telegramResponse.configured
          ? `Configured (${telegramResponse.secretKey})`
          : `Missing bot token (${telegramResponse.secretKey})`
      );
    } catch (error) {
      setTelegramStatus(`Error: ${error.message}`);
    }

    try {
      const emailResponse = await requestJson(
        `${normalizeBaseUrl(
          config.notificationBaseUrl
        )}/api/v1/integrations/messaging/email/config-status?tenantKey=${encodeURIComponent(
          config.tenantKey || "default"
        )}`
      );
      setEmailStatus(
        emailResponse.configured
          ? `Configured (${emailResponse.secretKey})`
          : `Missing SMTP credentials (${emailResponse.secretKey})`
      );
    } catch (error) {
      setEmailStatus(`Error: ${error.message}`);
    }
  }

  async function refreshAll() {
    addActivity("Refreshing dashboard telemetry...");
    await Promise.all([
      refreshServiceHealth(),
      refreshIdentity(),
      refreshIntegrationStatus(),
      refreshStorageInfo(),
      checkAbhaGateway(false),
    ]);
    addActivity("Refresh complete.");
  }

  async function openGoogleOauthStart() {
    try {
      const response = await requestJson(
        `${normalizeBaseUrl(
          config.authBaseUrl
        )}/api/v1/auth/oauth/google/start?tenantKey=${encodeURIComponent(
          config.tenantKey || "default"
        )}&role=admin`
      );
      if (response.oauthUrl) {
        window.open(response.oauthUrl, "_blank", "noopener,noreferrer");
        addActivity("Opened Google OAuth start URL.");
      }
    } catch (error) {
      addActivity("Failed to open Google OAuth start URL.", { error: error.message });
    }
  }

  async function sendTelegramTest(event) {
    event.preventDefault();

    const payload = {
      tenantKey: config.tenantKey,
      providerKey: "telegram-bot",
      channel: "patient-notification",
      recipient: telegramForm.chatId.trim(),
      message: telegramForm.message.trim(),
      dryRun: false,
      credentialsOverride: {
        botToken: telegramForm.botToken.trim(),
        chatId: telegramForm.chatId.trim(),
      },
    };

    try {
      const response = await requestJson(
        `${normalizeBaseUrl(config.notificationBaseUrl)}/api/v1/integrations/messaging/test`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );
      addActivity("Telegram test completed.", response);
      await refreshIntegrationStatus();
    } catch (error) {
      addActivity("Telegram test failed.", { error: error.message });
    }
  }

  async function sendEmailTest(event) {
    event.preventDefault();

    const payload = {
      tenantKey: config.tenantKey,
      providerKey: "email-smtp",
      channel: "patient-notification",
      recipient: emailForm.recipient.trim(),
      message: emailForm.message.trim(),
      dryRun: false,
      credentialsOverride: {
        host: emailForm.host.trim(),
        port: Number(emailForm.port || 587),
        secure: emailForm.secure,
        user: emailForm.user.trim(),
        pass: emailForm.pass.trim(),
        from: emailForm.from.trim(),
        subject: emailForm.subject.trim(),
      },
    };

    try {
      const response = await requestJson(
        `${normalizeBaseUrl(config.notificationBaseUrl)}/api/v1/integrations/messaging/test`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );
      addActivity("SMTP email test completed.", response);
      await refreshIntegrationStatus();
    } catch (error) {
      addActivity("SMTP email test failed.", { error: error.message });
    }
  }

  useEffect(() => {
    loadSavedSettings();
  }, []);

  useEffect(() => {
    refreshAll();
  }, [config.authBaseUrl, config.notificationBaseUrl, config.appointmentBaseUrl, config.tenantKey]);

  useEffect(() => {
    localStorage.setItem(localStorageKey, JSON.stringify(config));
  }, [config]);

  const serviceCards = useMemo(
    () => [
      { label: "Auth Service", value: serviceStatus.auth },
      { label: "Notification Service", value: serviceStatus.notification },
      { label: "Appointment Service", value: serviceStatus.appointment },
    ],
    [serviceStatus]
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">PulseWard HMS</p>
          <h1>Admin Console</h1>
          <p>Operational controls with tenant-based settings and integration labs.</p>
        </div>

        <nav className="tab-nav">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={activeTab === tab.key ? "tab-btn active" : "tab-btn"}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="tenant-box">
          <label>
            Active Tenant
            <input
              type="text"
              value={config.tenantKey}
              onChange={(event) => updateConfigField("tenantKey", event.target.value)}
            />
          </label>
          <button type="button" className="primary-btn" onClick={saveSettings} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Tenant Settings"}
          </button>
        </div>
      </aside>

      <main className="main-pane">
        {activeTab === "overview" && (
          <section className="tab-pane">
            <header className="pane-header">
              <h2>Platform Overview</h2>
              <button type="button" className="ghost-btn" onClick={refreshAll}>
                Refresh Telemetry
              </button>
            </header>

            <div className="status-grid">
              {serviceCards.map((item) => (
                <article key={item.label} className="card">
                  <h3>{item.label}</h3>
                  <span className={`status-chip ${statusTone(item.value.state)}`}>
                    {statusLabel(item.value.state)}
                  </span>
                  <p>{item.value.detail}</p>
                </article>
              ))}
            </div>

            <section className="card">
              <h3>Current Storage</h3>
              <div className="meta-grid">
                <div>
                  <span className="meta-label">Source</span>
                  <strong>{storageInfo.source}</strong>
                </div>
                <div>
                  <span className="meta-label">Tenant Settings Count</span>
                  <strong>{storageInfo.tenantCount}</strong>
                </div>
                <div>
                  <span className="meta-label">Path</span>
                  <strong className="mono-text">{storageInfo.path}</strong>
                </div>
                <div>
                  <span className="meta-label">Updated</span>
                  <strong>{storageInfo.updatedAt || "Not yet persisted"}</strong>
                </div>
              </div>
            </section>
          </section>
        )}

        {activeTab === "integrations" && (
          <section className="tab-pane split-two">
            <article className="card">
              <h3>Telegram Bot Lab</h3>
              <p className="muted">Status: {telegramStatus}</p>
              <form onSubmit={sendTelegramTest} className="form-grid">
                <label>
                  Bot Token
                  <input
                    type="password"
                    value={telegramForm.botToken}
                    onChange={(event) =>
                      setTelegramForm((prev) => ({ ...prev, botToken: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Chat ID
                  <input
                    type="text"
                    value={telegramForm.chatId}
                    onChange={(event) =>
                      setTelegramForm((prev) => ({ ...prev, chatId: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Message
                  <textarea
                    value={telegramForm.message}
                    onChange={(event) =>
                      setTelegramForm((prev) => ({ ...prev, message: event.target.value }))
                    }
                  />
                </label>
                <button type="submit" className="primary-btn">
                  Send Telegram Test
                </button>
              </form>
            </article>

            <article className="card">
              <h3>Email SMTP Lab</h3>
              <p className="muted">Status: {emailStatus}</p>
              <form onSubmit={sendEmailTest} className="form-grid">
                <label>
                  SMTP Host
                  <input
                    type="text"
                    value={emailForm.host}
                    onChange={(event) =>
                      setEmailForm((prev) => ({ ...prev, host: event.target.value }))
                    }
                  />
                </label>
                <label>
                  SMTP Port
                  <input
                    type="number"
                    value={emailForm.port}
                    onChange={(event) =>
                      setEmailForm((prev) => ({ ...prev, port: Number(event.target.value) }))
                    }
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={emailForm.secure}
                    onChange={(event) =>
                      setEmailForm((prev) => ({ ...prev, secure: event.target.checked }))
                    }
                  />
                  Use secure transport
                </label>
                <label>
                  SMTP User
                  <input
                    type="text"
                    value={emailForm.user}
                    onChange={(event) =>
                      setEmailForm((prev) => ({ ...prev, user: event.target.value }))
                    }
                  />
                </label>
                <label>
                  SMTP Password
                  <input
                    type="password"
                    value={emailForm.pass}
                    onChange={(event) =>
                      setEmailForm((prev) => ({ ...prev, pass: event.target.value }))
                    }
                  />
                </label>
                <label>
                  From Address
                  <input
                    type="email"
                    value={emailForm.from}
                    onChange={(event) =>
                      setEmailForm((prev) => ({ ...prev, from: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Recipient
                  <input
                    type="email"
                    value={emailForm.recipient}
                    onChange={(event) =>
                      setEmailForm((prev) => ({ ...prev, recipient: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Subject
                  <input
                    type="text"
                    value={emailForm.subject}
                    onChange={(event) =>
                      setEmailForm((prev) => ({ ...prev, subject: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Message
                  <textarea
                    value={emailForm.message}
                    onChange={(event) =>
                      setEmailForm((prev) => ({ ...prev, message: event.target.value }))
                    }
                  />
                </label>
                <button type="submit" className="primary-btn">
                  Send Email Test
                </button>
              </form>
            </article>
          </section>
        )}

        {activeTab === "identity" && (
          <section className="tab-pane split-two">
            <article className="card">
              <h3>OAuth Providers</h3>
              <div className="pill-wrap">
                {oauthProviders.length === 0 && <span className="pill">No providers loaded</span>}
                {oauthProviders.map((provider) => (
                  <span key={provider.key} className="pill">
                    {provider.key} | {provider.enabled ? "enabled" : "disabled"}
                  </span>
                ))}
              </div>

              <div className="meta-grid compact">
                <div>
                  <span className="meta-label">Google OAuth</span>
                  <strong>{googleStatus.configured ? "Configured" : "Not configured"}</strong>
                </div>
                <div>
                  <span className="meta-label">Redirect URI</span>
                  <strong className="mono-text">{googleStatus.redirectUri}</strong>
                </div>
              </div>

              <button type="button" className="primary-btn" onClick={openGoogleOauthStart}>
                Open Google OAuth Start URL
              </button>
            </article>

            <article className="card">
              <h3>ABHA Summary</h3>
              <div className="meta-grid compact">
                <div>
                  <span className="meta-label">Enabled</span>
                  <strong>{abhaStatus.enabled ? "Yes" : "No"}</strong>
                </div>
                <div>
                  <span className="meta-label">Configured</span>
                  <strong>{abhaStatus.configured ? "Yes" : "No"}</strong>
                </div>
                <div>
                  <span className="meta-label">Mode</span>
                  <strong>{abhaStatus.mode}</strong>
                </div>
                <div>
                  <span className="meta-label">Gateway Base URL</span>
                  <strong className="mono-text">
                    {abhaStatus.gatewayBaseUrl || "Not configured"}
                  </strong>
                </div>
                <div>
                  <span className="meta-label">Client ID</span>
                  <strong>{abhaStatus.hasClientId ? "Present" : "Missing"}</strong>
                </div>
                <div>
                  <span className="meta-label">Client Secret</span>
                  <strong>{abhaStatus.hasClientSecret ? "Present" : "Missing"}</strong>
                </div>
                <div>
                  <span className="meta-label">Gateway URL</span>
                  <strong>{abhaStatus.hasGatewayBaseUrl ? "Present" : "Missing"}</strong>
                </div>
              </div>
              <button type="button" className="ghost-btn" onClick={() => setActiveTab("abha")}>
                ABHA API Details
              </button>
            </article>
          </section>
        )}

        {activeTab === "abha" && (
          <section className="tab-pane split-two">
            <article className="card">
              <h3>ABHA Configuration</h3>
              <p className="muted">Environment-backed readiness for ABHA integration.</p>
              <div className="meta-grid compact">
                <div>
                  <span className="meta-label">Enabled</span>
                  <strong>{abhaStatus.enabled ? "Yes" : "No"}</strong>
                </div>
                <div>
                  <span className="meta-label">Configured</span>
                  <strong>{abhaStatus.configured ? "Yes" : "No"}</strong>
                </div>
                <div>
                  <span className="meta-label">Mode</span>
                  <strong>{abhaStatus.mode}</strong>
                </div>
                <div>
                  <span className="meta-label">Gateway Base URL</span>
                  <strong className="mono-text">
                    {abhaStatus.gatewayBaseUrl || "Not configured"}
                  </strong>
                </div>
                <div>
                  <span className="meta-label">Client ID</span>
                  <strong>{abhaStatus.hasClientId ? "Present" : "Missing"}</strong>
                </div>
                <div>
                  <span className="meta-label">Client Secret</span>
                  <strong>{abhaStatus.hasClientSecret ? "Present" : "Missing"}</strong>
                </div>
              </div>
            </article>

            <article className="card">
              <h3>ABHA Gateway Check</h3>
              <span className={`status-chip ${statusTone(abhaHealth.state)}`}>
                {statusLabel(abhaHealth.state)}
              </span>
              <p>{abhaHealth.detail}</p>
              <div className="meta-grid compact">
                <div>
                  <span className="meta-label">Checked URL</span>
                  <strong className="mono-text">
                    {abhaHealth.checkedUrl || "Not checked yet"}
                  </strong>
                </div>
                <div>
                  <span className="meta-label">HTTP Status</span>
                  <strong>{abhaHealth.statusCode || "-"}</strong>
                </div>
                <div>
                  <span className="meta-label">Latency</span>
                  <strong>{abhaHealth.latencyMs ? `${abhaHealth.latencyMs} ms` : "-"}</strong>
                </div>
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => checkAbhaGateway(true)}
                >
                  Run ABHA Health Check
                </button>
                <button type="button" className="ghost-btn" onClick={refreshIdentity}>
                  Reload ABHA Config
                </button>
              </div>
            </article>
          </section>
        )}

        {activeTab === "settings" && (
          <section className="tab-pane split-two">
            <article className="card">
              <h3>Service Routing</h3>
              <p className="muted">
                These values are stored per tenant in auth-service persistent settings.
              </p>
              <div className="form-grid">
                <label>
                  Auth Service Base URL
                  <input
                    type="url"
                    value={config.authBaseUrl}
                    onChange={(event) => updateConfigField("authBaseUrl", event.target.value)}
                  />
                </label>
                <label>
                  Notification Service Base URL
                  <input
                    type="url"
                    value={config.notificationBaseUrl}
                    onChange={(event) =>
                      updateConfigField("notificationBaseUrl", event.target.value)
                    }
                  />
                </label>
                <label>
                  Appointment Service Base URL
                  <input
                    type="url"
                    value={config.appointmentBaseUrl}
                    onChange={(event) =>
                      updateConfigField("appointmentBaseUrl", event.target.value)
                    }
                  />
                </label>
                <div className="button-row">
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={saveSettings}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Save Settings"}
                  </button>
                  <button type="button" className="ghost-btn" onClick={refreshAll}>
                    Refresh
                  </button>
                </div>
              </div>
            </article>

            <article className="card">
              <h3>Data Storage Details</h3>
              <p className="muted">
                Operational settings are persisted in auth-service under a tenant-keyed JSON store.
              </p>
              <div className="meta-grid compact">
                <div>
                  <span className="meta-label">Storage Source</span>
                  <strong>{storageInfo.source}</strong>
                </div>
                <div>
                  <span className="meta-label">Tenant Count</span>
                  <strong>{storageInfo.tenantCount}</strong>
                </div>
                <div>
                  <span className="meta-label">Path</span>
                  <strong className="mono-text">{storageInfo.path}</strong>
                </div>
              </div>
              <button type="button" className="ghost-btn" onClick={refreshStorageInfo}>
                Reload Storage Metadata
              </button>
            </article>
          </section>
        )}

        {activeTab === "activity" && (
          <section className="tab-pane">
            <header className="pane-header">
              <h2>Activity Timeline</h2>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setActivity(["Activity log was reset from dashboard UI."])}
              >
                Clear Log
              </button>
            </header>
            <pre className="log-panel">{activity.join("\n\n")}</pre>
          </section>
        )}
      </main>
    </div>
  );
}
