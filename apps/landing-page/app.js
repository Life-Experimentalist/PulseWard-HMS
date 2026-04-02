const STORAGE_KEY = "pulseward.demo.state.v2";
const DEFAULT_STATE = {
  setup: {
    completed: false,
    completedAt: null,
  },
  tenant: {
    hospitalName: "Generic Care Hospital",
    tenantKey: "default",
    domain: "generic-care.local",
    timezone: "Asia/Kolkata",
  },
  admin: {
    email: "admin@generic-care.local",
    password: "Admin@123",
  },
  branding: {
    primaryColor: "#0f4c5c",
    accentColor: "#ea8f3b",
  },
  modules: {
    messaging: {
      telegram: true,
      email: true,
      webhook: true,
      whatsapp: false,
      defaultProvider: "telegram-bot",
    },
    calendar: {
      google: true,
      apple: true,
      outlook: false,
    },
    oauth: {
      google: false,
      clerk: false,
    },
    pwaPushEnabled: false,
  },
  services: {
    mode: "local",
    authApiUrl: "http://localhost:5101/api/v1",
    notificationApiUrl: "http://localhost:5102/api/v1",
    appointmentApiUrl: "http://localhost:5103/api/v1",
  },
  data: {
    appointments: [],
    notifications: [],
  },
  backups: [],
};

let state = loadState();
let wizardStep = 1;
let deferredPrompt = null;
let swRegistration = null;

const setupWizard = document.getElementById("setup-wizard");
const setupForm = document.getElementById("setup-form");
const adminForm = document.getElementById("admin-config-form");
const setupBackBtn = document.getElementById("setupBack");
const setupNextBtn = document.getElementById("setupNext");
const setupFinishBtn = document.getElementById("setupFinish");

const authForm = document.getElementById("role-login-form");
const authOutput = document.getElementById("auth-output");
const adminOutput = document.getElementById("admin-output");
const dataOutput = document.getElementById("data-output");
const pwaOutput = document.getElementById("pwa-output");

const installBtn = document.getElementById("install-pwa-btn");
const enablePushBtn = document.getElementById("enable-push-btn");
const testPushBtn = document.getElementById("test-push-btn");
const restartSetupBtn = document.getElementById("restart-setup-btn");

initialize();

function initialize() {
  attachListeners();
  hydrateForms();
  renderAll();
  registerServiceWorker();

  if (!state.setup.completed) {
    openSetupWizard();
  }
}

function attachListeners() {
  setupBackBtn.addEventListener("click", () => {
    wizardStep = Math.max(1, wizardStep - 1);
    renderWizardStep();
  });

  setupNextBtn.addEventListener("click", () => {
    wizardStep = Math.min(4, wizardStep + 1);
    renderWizardStep();
  });

  setupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(setupForm).entries());

    state.tenant.hospitalName = data.hospitalName || DEFAULT_STATE.tenant.hospitalName;
    state.tenant.tenantKey = data.tenantKey || DEFAULT_STATE.tenant.tenantKey;
    state.tenant.domain = data.domain || DEFAULT_STATE.tenant.domain;
    state.tenant.timezone = data.timezone || DEFAULT_STATE.tenant.timezone;

    state.admin.email = data.adminEmail || DEFAULT_STATE.admin.email;
    state.admin.password = data.adminPassword || DEFAULT_STATE.admin.password;

    state.modules.messaging.telegram = Boolean(data.setupProviderTelegram);
    state.modules.messaging.email = Boolean(data.setupProviderEmail);
    state.modules.messaging.webhook = Boolean(data.setupProviderWebhook);
    state.modules.messaging.whatsapp = Boolean(data.setupProviderWhatsApp);
    state.modules.calendar.apple = Boolean(data.setupProviderAppleCalendar);

    state.services.mode = data.mode || "local";
    state.services.authApiUrl = normalizeUrl(data.authUrl, DEFAULT_STATE.services.authApiUrl);
    state.services.notificationApiUrl = normalizeUrl(
      data.notificationUrl,
      DEFAULT_STATE.services.notificationApiUrl
    );
    state.services.appointmentApiUrl = normalizeUrl(
      data.appointmentUrl,
      DEFAULT_STATE.services.appointmentApiUrl
    );

    state.setup.completed = true;
    state.setup.completedAt = new Date().toISOString();

    saveState();
    createSnapshot("Initial setup complete");

    if (state.services.mode === "live") {
      await discoverServiceUrls();
      await bootstrapAdminLive();
    }

    closeSetupWizard();
    hydrateForms();
    renderAll();
  });

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(authForm).entries());

    if (state.services.mode === "live") {
      const result = await postJson(`${state.services.authApiUrl}/auth/login`, {
        tenantKey: payload.tenantKey,
        role: payload.role,
        email: payload.email,
        password: payload.password,
      });

      if (result.ok) {
        setOutput(authOutput, result.data);
      } else {
        setOutput(authOutput, {
          message: "Live login failed",
          detail: result.error || result.data,
        });
      }
      return;
    }

    if (payload.role === "admin") {
      const pass = payload.password === state.admin.password;
      const email = payload.email.toLowerCase() === state.admin.email.toLowerCase();
      if (!pass || !email) {
        setOutput(authOutput, {
          message: "Invalid admin credentials for local demo mode.",
          hint: "Use the admin email and password from setup wizard.",
        });
        return;
      }
    }

    setOutput(authOutput, {
      status: "local-demo-login-success",
      tenantKey: payload.tenantKey,
      role: payload.role,
      token: `demo-token-${Date.now()}`,
    });
  });

  document.getElementById("google-oauth-btn").addEventListener("click", async () => {
    const tenantKey = document.getElementById("tenantKey").value;
    const role = document.getElementById("role").value;

    if (state.services.mode === "live") {
      const result = await getJson(
        `${state.services.authApiUrl}/auth/oauth/google/start?tenantKey=${encodeURIComponent(
          tenantKey
        )}&role=${encodeURIComponent(role)}`
      );
      setOutput(
        authOutput,
        result.ok ? result.data : { message: "OAuth endpoint failed", detail: result.error }
      );
      return;
    }

    setOutput(authOutput, {
      provider: "google-oauth",
      mode: "local",
      oauthUrl:
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=demo-client&redirect_uri=http://localhost/callback",
      note: "Switch to Live mode in Admin Configuration to call backend OAuth endpoint.",
    });
  });

  document.getElementById("clerk-oauth-btn").addEventListener("click", async () => {
    const tenantKey = document.getElementById("tenantKey").value;

    if (state.services.mode === "live") {
      const result = await getJson(
        `${state.services.authApiUrl}/auth/oauth/clerk/start?tenantKey=${encodeURIComponent(
          tenantKey
        )}`
      );
      setOutput(
        authOutput,
        result.ok ? result.data : { message: "Clerk endpoint failed", detail: result.error }
      );
      return;
    }

    setOutput(authOutput, {
      provider: "clerk",
      mode: "local",
      note: "Switch to Live mode to receive backend clerk-start payload.",
    });
  });

  adminForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    state.tenant.hospitalName = payload.hospitalName || state.tenant.hospitalName;
    state.branding.primaryColor = payload.primaryColor || state.branding.primaryColor;
    state.branding.accentColor = payload.accentColor || state.branding.accentColor;

    state.modules.messaging.telegram = Boolean(payload.providerTelegram);
    state.modules.messaging.email = Boolean(payload.providerEmail);
    state.modules.messaging.webhook = Boolean(payload.providerWebhook);
    state.modules.messaging.whatsapp = Boolean(payload.providerWhatsApp);
    state.modules.messaging.defaultProvider = payload.defaultMessagingProvider;

    state.modules.calendar.google = Boolean(payload.providerGoogleCalendar);
    state.modules.calendar.apple = Boolean(payload.providerAppleCalendar);
    state.modules.calendar.outlook = Boolean(payload.providerOutlookCalendar);

    state.modules.oauth.google = Boolean(payload.oauthGoogle);
    state.modules.oauth.clerk = Boolean(payload.oauthClerk);

    state.services.mode = payload.dataMode || state.services.mode;
    state.services.authApiUrl = normalizeUrl(payload.authApiUrl, state.services.authApiUrl);
    state.services.notificationApiUrl = normalizeUrl(
      payload.notificationApiUrl,
      state.services.notificationApiUrl
    );
    state.services.appointmentApiUrl = normalizeUrl(
      payload.appointmentApiUrl,
      state.services.appointmentApiUrl
    );

    saveState();
    renderAll();
    setOutput(adminOutput, {
      message: "Admin configuration updated",
      savedAt: new Date().toISOString(),
    });
  });

  document.getElementById("sync-providers-btn").addEventListener("click", syncProviders);
  document.getElementById("discover-services-btn").addEventListener("click", discoverServiceUrls);

  document.getElementById("appointment-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    payload.appointmentDate = payload.appointmentDate || new Date().toISOString();

    if (state.services.mode === "live") {
      const result = await postJson(`${state.services.appointmentApiUrl}/appointments`, payload);
      setOutput(
        dataOutput,
        result.ok ? result.data : { message: "Could not create appointment", detail: result.error }
      );
      await refreshData();
      return;
    }

    state.data.appointments.push({
      id: `apt-${Date.now()}`,
      patientId: payload.patientId,
      clinicianId: payload.clinicianId,
      appointmentDate: payload.appointmentDate,
      status: payload.status,
    });
    saveState();
    renderTables();
    renderStats();
    setOutput(dataOutput, { message: "Appointment created in local mode" });
  });

  document.getElementById("notification-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    if (state.services.mode === "live") {
      const createResult = await postJson(`${state.services.notificationApiUrl}/notifications`, {
        recipient: payload.recipient,
        message: payload.message,
      });

      const testResult = await postJson(
        `${state.services.notificationApiUrl}/integrations/messaging/test`,
        {
          tenantKey: state.tenant.tenantKey,
          channel: payload.channel,
          providerKey: payload.providerKey,
          recipient: payload.recipient,
          message: payload.message,
          dryRun: true,
        }
      );

      setOutput(dataOutput, {
        notificationCreated: createResult.ok,
        deliveryTest: testResult.ok ? testResult.data : testResult.error,
      });

      await refreshData();
      await simulatePush(payload.message);
      return;
    }

    state.data.notifications.push({
      id: `ntf-${Date.now()}`,
      recipient: payload.recipient,
      message: payload.message,
      channel: payload.channel,
      providerKey: payload.providerKey,
      timestamp: new Date().toISOString(),
    });
    saveState();
    renderTables();
    renderStats();
    setOutput(dataOutput, { message: "Notification added in local mode" });
    await simulatePush(payload.message);
  });

  document.getElementById("refresh-data-btn").addEventListener("click", refreshData);
  document.getElementById("run-seed-btn").addEventListener("click", seedDemoData);

  document.getElementById("create-backup-btn").addEventListener("click", () => {
    createSnapshot("Manual snapshot");
    renderBackupList();
  });

  document.getElementById("download-backup-btn").addEventListener("click", downloadBackup);

  document.getElementById("restore-backup-input").addEventListener("change", restoreBackupFromFile);

  enablePushBtn.addEventListener("click", enableBrowserNotifications);
  testPushBtn.addEventListener("click", async () => {
    await simulatePush("Server push test from PulseWard demo");
  });

  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) {
      setOutput(pwaOutput, "Install prompt is unavailable in this browser context.");
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.disabled = true;
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    installBtn.disabled = false;
  });

  restartSetupBtn.addEventListener("click", () => {
    openSetupWizard();
  });

  document.getElementById("run-demo-flow-btn").addEventListener("click", async () => {
    await seedDemoData();
    window.location.hash = "#data-lab";
  });

  document.getElementById("view-admin-btn").addEventListener("click", () => {
    window.location.hash = "#admin-console";
  });
}

function hydrateForms() {
  document.getElementById("email").value = state.admin.email;
  document.getElementById("password").value = state.admin.password;
  document.getElementById("tenantKey").value = state.tenant.tenantKey;

  document.getElementById("setupHospitalName").value = state.tenant.hospitalName;
  document.getElementById("setupTenantKey").value = state.tenant.tenantKey;
  document.getElementById("setupDomain").value = state.tenant.domain;
  document.getElementById("setupAdminEmail").value = state.admin.email;
  document.getElementById("setupAdminPassword").value = state.admin.password;
  document.getElementById("setupTimezone").value = state.tenant.timezone;
  document.getElementById("setupMode").value = state.services.mode;
  document.getElementById("setupAuthUrl").value = state.services.authApiUrl;
  document.getElementById("setupNotificationUrl").value = state.services.notificationApiUrl;
  document.getElementById("setupAppointmentUrl").value = state.services.appointmentApiUrl;

  document.getElementById("adminHospitalName").value = state.tenant.hospitalName;
  document.getElementById("adminPrimaryColor").value = state.branding.primaryColor;
  document.getElementById("adminAccentColor").value = state.branding.accentColor;

  setupForm.querySelector("input[name='setupProviderTelegram']").checked =
    state.modules.messaging.telegram;
  setupForm.querySelector("input[name='setupProviderEmail']").checked =
    state.modules.messaging.email;
  setupForm.querySelector("input[name='setupProviderWebhook']").checked =
    state.modules.messaging.webhook;
  setupForm.querySelector("input[name='setupProviderWhatsApp']").checked =
    state.modules.messaging.whatsapp;
  setupForm.querySelector("input[name='setupProviderAppleCalendar']").checked =
    state.modules.calendar.apple;

  adminForm.querySelector("input[name='providerTelegram']").checked =
    state.modules.messaging.telegram;
  adminForm.querySelector("input[name='providerEmail']").checked = state.modules.messaging.email;
  adminForm.querySelector("input[name='providerWebhook']").checked =
    state.modules.messaging.webhook;
  adminForm.querySelector("input[name='providerWhatsApp']").checked =
    state.modules.messaging.whatsapp;

  adminForm.querySelector("input[name='providerGoogleCalendar']").checked =
    state.modules.calendar.google;
  adminForm.querySelector("input[name='providerAppleCalendar']").checked =
    state.modules.calendar.apple;
  adminForm.querySelector("input[name='providerOutlookCalendar']").checked =
    state.modules.calendar.outlook;

  adminForm.querySelector("input[name='oauthGoogle']").checked = state.modules.oauth.google;
  adminForm.querySelector("input[name='oauthClerk']").checked = state.modules.oauth.clerk;

  document.getElementById("defaultMessagingProvider").value =
    state.modules.messaging.defaultProvider;
  document.getElementById("dataMode").value = state.services.mode;
  document.getElementById("authApiUrl").value = state.services.authApiUrl;
  document.getElementById("notificationApiUrl").value = state.services.notificationApiUrl;
  document.getElementById("appointmentApiUrl").value = state.services.appointmentApiUrl;
  document.getElementById("appointmentDate").value = new Date(
    Date.now() + 60 * 60 * 1000
  ).toISOString();
}

function renderAll() {
  renderWizardStep();
  applyBranding();
  renderHospitalHeader();
  renderLinks();
  renderTables();
  renderStats();
  renderBackupList();
}

function renderWizardStep() {
  var panes = document.querySelectorAll(".step-pane");
  var dots = document.querySelectorAll(".step-dot");

  panes.forEach((pane) =>
    pane.classList.toggle("active", Number(pane.dataset.step) === wizardStep)
  );
  dots.forEach((dot) => dot.classList.toggle("active", Number(dot.dataset.step) === wizardStep));

  setupBackBtn.disabled = wizardStep === 1;
  setupNextBtn.classList.toggle("hidden", wizardStep === 4);
  setupFinishBtn.classList.toggle("hidden", wizardStep !== 4);
}

function renderHospitalHeader() {
  document.getElementById(
    "hospitalNameHeading"
  ).textContent = `${state.tenant.hospitalName} Demo Workspace`;
  document.getElementById("hospitalSubheading").textContent = `Tenant ${
    state.tenant.tenantKey
  } at ${state.tenant.domain} using ${state.services.mode.toUpperCase()} mode.`;
  document.getElementById("brandLogo").textContent = state.tenant.hospitalName;
}

function renderLinks() {
  var links = [
    { label: "Auth Roles", href: `${state.services.authApiUrl}/auth/roles` },
    { label: "OAuth Providers", href: `${state.services.authApiUrl}/auth/oauth/providers` },
    {
      label: "Messaging Providers",
      href: `${
        state.services.notificationApiUrl
      }/integrations/messaging/providers?tenantKey=${encodeURIComponent(state.tenant.tenantKey)}`,
    },
    {
      label: "Calendar Providers",
      href: `${
        state.services.appointmentApiUrl
      }/integrations/calendars/providers?tenantKey=${encodeURIComponent(state.tenant.tenantKey)}`,
    },
  ];

  var holder = document.getElementById("system-link-list");
  holder.innerHTML = links
    .map(
      (link) =>
        `<a href="${link.href}" target="_blank" rel="noreferrer" class="system-link">${escapeHtml(
          link.label
        )}</a>`
    )
    .join("");
}

function renderStats() {
  document.getElementById("statMode").textContent = state.services.mode.toUpperCase();
  document.getElementById("statAppointments").textContent = String(state.data.appointments.length);
  document.getElementById("statNotifications").textContent = String(
    state.data.notifications.length
  );
}

function renderTables() {
  document.getElementById("appointments-table").innerHTML = renderTable(
    ["id", "patientId", "clinicianId", "appointmentDate", "status"],
    state.data.appointments
  );

  document.getElementById("notifications-table").innerHTML = renderTable(
    ["id", "recipient", "channel", "providerKey", "timestamp"],
    state.data.notifications
  );
}

function renderBackupList() {
  var container = document.getElementById("backup-list");
  if (!state.backups.length) {
    container.innerHTML = '<p class="subtle">No snapshots yet.</p>';
    return;
  }

  container.innerHTML = state.backups
    .map(
      (backup) =>
        `<div class="backup-row"><div><strong>${escapeHtml(backup.label)}</strong><p>${escapeHtml(
          backup.createdAt
        )}</p></div><button type="button" class="ghost" data-restore-id="${escapeHtml(
          backup.id
        )}">Restore</button></div>`
    )
    .join("");

  container.querySelectorAll("button[data-restore-id]").forEach((button) => {
    button.addEventListener("click", () => {
      var selected = state.backups.find((item) => item.id === button.dataset.restoreId);
      if (!selected) {
        return;
      }
      state = normalizeState(selected.payload);
      saveState();
      hydrateForms();
      renderAll();
      setOutput(dataOutput, { message: "Snapshot restored", restoredAt: new Date().toISOString() });
    });
  });
}

function createSnapshot(label) {
  var payload = normalizeState(JSON.parse(JSON.stringify(state)));
  payload.backups = [];

  state.backups.unshift({
    id: `backup-${Date.now()}`,
    label: label,
    createdAt: new Date().toISOString(),
    payload: payload,
  });

  state.backups = state.backups.slice(0, 10);
  saveState();
}

function downloadBackup() {
  var payload = {
    exportedAt: new Date().toISOString(),
    app: "PulseWard Demo Console",
    state: normalizeState(JSON.parse(JSON.stringify(state))),
  };

  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `pulseward-demo-backup-${Date.now()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function restoreBackupFromFile(event) {
  var file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }

  try {
    var text = await file.text();
    var parsed = JSON.parse(text);
    var candidate = parsed.state || parsed;
    state = normalizeState(candidate);
    saveState();
    hydrateForms();
    renderAll();
    setOutput(dataOutput, { message: "Backup restored from file" });
  } catch (error) {
    setOutput(dataOutput, { message: "Backup restore failed", detail: error.message });
  } finally {
    event.target.value = "";
  }
}

async function refreshData() {
  if (state.services.mode !== "live") {
    renderTables();
    renderStats();
    setOutput(dataOutput, { message: "Local data refreshed" });
    return;
  }

  var appointmentsResult = await getJson(`${state.services.appointmentApiUrl}/appointments`);
  var notificationsResult = await getJson(`${state.services.notificationApiUrl}/notifications`);

  if (appointmentsResult.ok) {
    state.data.appointments = Array.isArray(appointmentsResult.data) ? appointmentsResult.data : [];
  }
  if (notificationsResult.ok) {
    state.data.notifications = Array.isArray(notificationsResult.data)
      ? notificationsResult.data
      : [];
  }

  saveState();
  renderTables();
  renderStats();

  setOutput(dataOutput, {
    mode: state.services.mode,
    appointmentsLoaded: state.data.appointments.length,
    notificationsLoaded: state.data.notifications.length,
    appointmentsError: appointmentsResult.ok ? null : appointmentsResult.error,
    notificationsError: notificationsResult.ok ? null : notificationsResult.error,
  });
}

async function seedDemoData() {
  var sampleAppointment = {
    patientId: "pat-seed-001",
    clinicianId: "cln-seed-001",
    appointmentDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    status: "scheduled",
  };

  var sampleNotification = {
    recipient: "patient@generic-care.local",
    channel: "patient-notification",
    providerKey: state.modules.messaging.defaultProvider,
    message: `Reminder from ${state.tenant.hospitalName}`,
  };

  if (state.services.mode === "live") {
    await postJson(`${state.services.appointmentApiUrl}/appointments`, sampleAppointment);
    await postJson(`${state.services.notificationApiUrl}/notifications`, {
      recipient: sampleNotification.recipient,
      message: sampleNotification.message,
    });
    await postJson(`${state.services.notificationApiUrl}/integrations/messaging/test`, {
      tenantKey: state.tenant.tenantKey,
      channel: sampleNotification.channel,
      providerKey: sampleNotification.providerKey,
      recipient: sampleNotification.recipient,
      message: sampleNotification.message,
      dryRun: true,
    });
    await refreshData();
    await simulatePush(sampleNotification.message);
    return;
  }

  state.data.appointments.push({
    id: `apt-${Date.now()}`,
    patientId: sampleAppointment.patientId,
    clinicianId: sampleAppointment.clinicianId,
    appointmentDate: sampleAppointment.appointmentDate,
    status: sampleAppointment.status,
  });

  state.data.notifications.push({
    id: `ntf-${Date.now()}`,
    recipient: sampleNotification.recipient,
    message: sampleNotification.message,
    channel: sampleNotification.channel,
    providerKey: sampleNotification.providerKey,
    timestamp: new Date().toISOString(),
  });

  saveState();
  renderTables();
  renderStats();
  await simulatePush(sampleNotification.message);
  setOutput(dataOutput, { message: "Demo seed complete in local mode" });
}

async function syncProviders() {
  if (state.services.mode !== "live") {
    setOutput(adminOutput, {
      mode: "local",
      providers: {
        messaging: state.modules.messaging,
        calendar: state.modules.calendar,
      },
      note: "Switch to live mode to query service provider endpoints.",
    });
    return;
  }

  var messaging = await getJson(
    `${
      state.services.notificationApiUrl
    }/integrations/messaging/providers?tenantKey=${encodeURIComponent(state.tenant.tenantKey)}`
  );
  var calendars = await getJson(
    `${
      state.services.appointmentApiUrl
    }/integrations/calendars/providers?tenantKey=${encodeURIComponent(state.tenant.tenantKey)}`
  );

  setOutput(adminOutput, {
    messagingProviders: messaging.ok ? messaging.data : messaging.error,
    calendarProviders: calendars.ok ? calendars.data : calendars.error,
  });
}

async function discoverServiceUrls() {
  var base = "http://localhost:";
  var defaultPorts = [5101, 5102, 5103];
  var configuredPorts = [
    extractPortFromUrl(state.services.authApiUrl),
    extractPortFromUrl(state.services.notificationApiUrl),
    extractPortFromUrl(state.services.appointmentApiUrl),
  ].filter(Boolean);

  var searchRange = [];
  defaultPorts.concat(configuredPorts).forEach(function (basePort) {
    for (var offset = -1; offset <= 3; offset += 1) {
      var candidate = basePort + offset;
      if (candidate < 1024 || searchRange.indexOf(candidate) !== -1) {
        continue;
      }
      searchRange.push(candidate);
    }
  });

  var found = {
    auth: null,
    notification: null,
    appointment: null,
  };

  for (var i = 0; i < searchRange.length; i += 1) {
    var probePort = searchRange[i];
    var authProbe = await getJson(`${base}${probePort}/api/v1/auth/roles`);
    if (authProbe.ok && !found.auth) {
      found.auth = `${base}${probePort}/api/v1`;
    }

    var notificationProbe = await getJson(`${base}${probePort}/api/v1/notifications`);
    if (notificationProbe.ok && !found.notification) {
      found.notification = `${base}${probePort}/api/v1`;
    }

    var appointmentProbe = await getJson(`${base}${probePort}/api/v1/appointments`);
    if (appointmentProbe.ok && !found.appointment) {
      found.appointment = `${base}${probePort}/api/v1`;
    }

    if (found.auth && found.notification && found.appointment) {
      break;
    }
  }

  if (found.auth) {
    state.services.authApiUrl = found.auth;
    document.getElementById("authApiUrl").value = found.auth;
    document.getElementById("setupAuthUrl").value = found.auth;
  }
  if (found.notification) {
    state.services.notificationApiUrl = found.notification;
    document.getElementById("notificationApiUrl").value = found.notification;
    document.getElementById("setupNotificationUrl").value = found.notification;
  }
  if (found.appointment) {
    state.services.appointmentApiUrl = found.appointment;
    document.getElementById("appointmentApiUrl").value = found.appointment;
    document.getElementById("setupAppointmentUrl").value = found.appointment;
  }

  saveState();
  renderLinks();

  setOutput(adminOutput, {
    message: "Service discovery completed",
    discovered: found,
    hint: "If any service is null, start that service and run discovery again.",
  });
}

function extractPortFromUrl(url) {
  try {
    var parsed = new URL(url);
    if (parsed.port) {
      return Number(parsed.port);
    }
    return parsed.protocol === "https:" ? 443 : 80;
  } catch (_error) {
    return null;
  }
}

async function bootstrapAdminLive() {
  var payload = {
    tenantKey: state.tenant.tenantKey,
    email: state.admin.email,
    password: state.admin.password,
    role: "admin",
  };

  var result = await postJson(`${state.services.authApiUrl}/auth/register`, payload);
  if (result.ok) {
    setOutput(adminOutput, {
      message: "Live admin bootstrap succeeded.",
      userId: result.data.userId,
    });
    return;
  }

  setOutput(adminOutput, {
    message: "Live admin bootstrap returned a non-success response.",
    detail: result.error || result.data,
    note: "This can happen if the auth service is not running or payload validation fails.",
  });
}

function openSetupWizard() {
  wizardStep = 1;
  setupWizard.classList.remove("hidden");
  hydrateForms();
  renderWizardStep();
}

function closeSetupWizard() {
  setupWizard.classList.add("hidden");
}

function applyBranding() {
  document.documentElement.style.setProperty("--teal", state.branding.primaryColor);
  document.documentElement.style.setProperty("--sun", state.branding.accentColor);
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    swRegistration = await navigator.serviceWorker.register("./service-worker.js");
  } catch (error) {
    setOutput(pwaOutput, { message: "Service worker registration failed", detail: error.message });
  }
}

async function enableBrowserNotifications() {
  if (!("Notification" in window)) {
    setOutput(pwaOutput, "This browser does not support notifications.");
    return;
  }

  var permission = await Notification.requestPermission();
  state.modules.pwaPushEnabled = permission === "granted";
  saveState();

  setOutput(pwaOutput, {
    notificationPermission: permission,
    pwaPushEnabled: state.modules.pwaPushEnabled,
  });
}

async function simulatePush(message) {
  var text = message || "PulseWard demo notification";

  if (swRegistration && swRegistration.active) {
    swRegistration.active.postMessage({
      type: "SHOW_NOTIFICATION",
      title: `${state.tenant.hospitalName} Alert`,
      body: text,
    });
  } else if ("Notification" in window && Notification.permission === "granted") {
    new Notification(`${state.tenant.hospitalName} Alert`, { body: text });
  }

  setOutput(pwaOutput, {
    pushedAt: new Date().toISOString(),
    message: text,
    mode: state.services.mode,
  });
}

function normalizeState(candidate) {
  var merged = JSON.parse(JSON.stringify(DEFAULT_STATE));
  merged.setup = Object.assign({}, merged.setup, candidate.setup || {});
  merged.tenant = Object.assign({}, merged.tenant, candidate.tenant || {});
  merged.admin = Object.assign({}, merged.admin, candidate.admin || {});
  merged.branding = Object.assign({}, merged.branding, candidate.branding || {});

  merged.modules = Object.assign({}, merged.modules, candidate.modules || {});
  merged.modules.messaging = Object.assign(
    {},
    DEFAULT_STATE.modules.messaging,
    (candidate.modules && candidate.modules.messaging) || {}
  );
  merged.modules.calendar = Object.assign(
    {},
    DEFAULT_STATE.modules.calendar,
    (candidate.modules && candidate.modules.calendar) || {}
  );
  merged.modules.oauth = Object.assign(
    {},
    DEFAULT_STATE.modules.oauth,
    (candidate.modules && candidate.modules.oauth) || {}
  );

  merged.services = Object.assign({}, merged.services, candidate.services || {});
  merged.data = Object.assign({}, merged.data, candidate.data || {});
  merged.data.appointments = Array.isArray(merged.data.appointments)
    ? merged.data.appointments
    : [];
  merged.data.notifications = Array.isArray(merged.data.notifications)
    ? merged.data.notifications
    : [];
  merged.backups = Array.isArray(candidate.backups) ? candidate.backups : [];

  return merged;
}

function loadState() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return normalizeState(DEFAULT_STATE);
    }
    return normalizeState(JSON.parse(raw));
  } catch (_error) {
    return normalizeState(DEFAULT_STATE);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function renderTable(columns, rows) {
  if (!rows.length) {
    return '<p class="subtle">No records yet.</p>';
  }

  var thead = `<tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>`;
  var body = rows
    .map((row) => {
      return `<tr>${columns
        .map((column) => `<td>${escapeHtml(String(row[column] || ""))}</td>`)
        .join("")}</tr>`;
    })
    .join("");

  return `<div class="table-wrap"><table><thead>${thead}</thead><tbody>${body}</tbody></table></div>`;
}

function setOutput(element, value) {
  if (!element) {
    return;
  }
  if (typeof value === "string") {
    element.textContent = value;
    return;
  }
  element.textContent = JSON.stringify(value, null, 2);
}

function normalizeUrl(value, fallback) {
  var result = (value || fallback || "").trim();
  if (!result) {
    return fallback;
  }
  return result.replace(/\/$/, "");
}

async function getJson(url) {
  try {
    var response = await fetch(url);
    var data = await response.json();
    return { ok: response.ok, data: data };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function postJson(url, payload) {
  try {
    var response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    var data = null;
    try {
      data = await response.json();
    } catch (_error) {
      data = null;
    }

    return {
      ok: response.ok,
      data: data,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
