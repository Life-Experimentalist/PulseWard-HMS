import { randomUUID } from "node:crypto";

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const value =
      argv[index + 1] && !String(argv[index + 1]).startsWith("--") ? argv[index + 1] : "true";
    if (value !== "true") {
      index += 1;
    }
    result[key] = value;
  }

  return result;
}

function utcDateToken(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function addMinutes(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}

function resolveSimulationStart() {
  const now = new Date();
  const base = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 9, 0, 0, 0)
  );

  if (now > base) {
    return new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  }

  return base.toISOString();
}

async function sendJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => null);
  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

async function registerAndLogin(config, email, role, password) {
  const registerPayload = {
    tenantKey: config.tenantKey,
    email,
    password,
    role,
  };

  const register = await sendJson(`${config.authBaseUrl}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(registerPayload),
  });

  if (!register.ok && register.status !== 409) {
    throw new Error(
      `Register failed for ${email}/${role}: ${
        register.body && register.body.message ? register.body.message : register.status
      }`
    );
  }

  const login = await sendJson(`${config.authBaseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(registerPayload),
  });

  if (!login.ok || !login.body || !login.body.token) {
    throw new Error(
      `Login failed for ${email}/${role}: ${
        login.body && login.body.message ? login.body.message : login.status
      }`
    );
  }

  return login.body.token;
}

async function createAppointment(config, payload, actorRole) {
  const response = await sendJson(`${config.appointmentBaseUrl}/api/v1/appointments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-role": actorRole,
    },
    body: JSON.stringify(payload),
  });

  return response;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = {
    tenantKey: String(args.tenant || "citycare-hospital"),
    doctorEmail: String(args.doctor || "doctor@citycare.example.com"),
    doctorPassword: String(args["doctor-password"] || "demo-password"),
    adminEmail: String(args.admin || "admin@citycare.example.com"),
    adminPassword: String(args["admin-password"] || "demo-password"),
    chatId: String(args.chat || "").trim(),
    authBaseUrl: String(args.auth || "http://127.0.0.1:5101").replace(/\/+$/, ""),
    notificationBaseUrl: String(args.notification || "http://127.0.0.1:5102").replace(/\/+$/, ""),
    appointmentBaseUrl: String(args.appointment || "http://127.0.0.1:5103").replace(/\/+$/, ""),
  };

  const summary = {
    tenantKey: config.tenantKey,
    doctorEmail: config.doctorEmail,
    createdPatients: [],
    createdAppointments: [],
    blockedDay: null,
    blockedDayCreateRejected: false,
    telegram: {
      commandsSetup: false,
      doctorLinked: false,
      agendaWebhookTriggered: false,
    },
  };

  const adminToken = await registerAndLogin(
    config,
    config.adminEmail,
    "admin",
    config.adminPassword
  );
  const doctorToken = await registerAndLogin(
    config,
    config.doctorEmail,
    "doctor",
    config.doctorPassword
  );

  const commandSetup = await sendJson(
    `${config.notificationBaseUrl}/api/v1/integrations/messaging/telegram/commands/setup`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ tenantKey: config.tenantKey }),
    }
  );

  summary.telegram.commandsSetup = commandSetup.ok;

  if (config.chatId) {
    const linkResponse = await sendJson(
      `${config.notificationBaseUrl}/api/v1/integrations/messaging/telegram/link`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${doctorToken}`,
        },
        body: JSON.stringify({
          tenantKey: config.tenantKey,
          chatId: config.chatId,
        }),
      }
    );

    summary.telegram.doctorLinked = linkResponse.ok;
  }

  const simulationStart = resolveSimulationStart();

  for (let index = 0; index < 5; index += 1) {
    const patientEmail = `patient${index + 1}.${Date.now()}@citycare.example.com`;
    await registerAndLogin(config, patientEmail, "patient", "demo-password");
    summary.createdPatients.push(patientEmail);

    const appointmentDate = addMinutes(simulationStart, index * 30);
    const createResult = await createAppointment(
      config,
      {
        tenantKey: config.tenantKey,
        patientId: patientEmail,
        clinicianId: config.doctorEmail,
        appointmentDate,
        durationMinutes: 25,
        status: "scheduled",
        source: "simulation",
        actorRole: "patient",
        clientRequestId: `sim-${randomUUID()}`,
      },
      "patient"
    );

    if (!createResult.ok) {
      throw new Error(
        `Appointment creation failed for ${patientEmail}: ${
          createResult.body && createResult.body.message
            ? createResult.body.message
            : createResult.status
        }`
      );
    }

    summary.createdAppointments.push({
      appointmentId: createResult.body.id,
      patientId: patientEmail,
      appointmentDate,
      status: createResult.body.status,
    });
  }

  const tomorrowDate = new Date();
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const blockDate = utcDateToken(tomorrowDate);

  const blockResponse = await sendJson(
    `${config.appointmentBaseUrl}/api/v1/clinicians/${encodeURIComponent(
      config.doctorEmail
    )}/availability/blocks`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-actor-role": "doctor",
      },
      body: JSON.stringify({
        tenantKey: config.tenantKey,
        blockDate,
        reason: "Doctor unavailable for simulation",
        createdBy: config.doctorEmail,
      }),
    }
  );

  if (!blockResponse.ok) {
    throw new Error(
      `Failed to create blocked day: ${
        blockResponse.body && blockResponse.body.message
          ? blockResponse.body.message
          : blockResponse.status
      }`
    );
  }

  summary.blockedDay = {
    id: blockResponse.body.id,
    blockDate: blockResponse.body.blockDate,
    startDateTime: blockResponse.body.startDateTime,
    endDateTime: blockResponse.body.endDateTime,
  };

  const blockedAttempt = await createAppointment(
    config,
    {
      tenantKey: config.tenantKey,
      patientId: summary.createdPatients[0],
      clinicianId: config.doctorEmail,
      appointmentDate: `${blockDate}T10:00:00.000Z`,
      durationMinutes: 20,
      status: "scheduled",
      source: "simulation",
      actorRole: "patient",
      clientRequestId: `sim-blocked-${randomUUID()}`,
    },
    "patient"
  );

  summary.blockedDayCreateRejected = blockedAttempt.status === 409;
  summary.blockedDayRejectCode =
    blockedAttempt.body && blockedAttempt.body.code ? blockedAttempt.body.code : null;

  if (config.chatId) {
    const updateId = Math.floor(Date.now() / 1000);
    const agendaDay = utcDateToken(simulationStart);
    const webhookPayload = {
      update_id: updateId,
      message: {
        message_id: updateId,
        date: Math.floor(Date.now() / 1000),
        text: `/agenda ${agendaDay}`,
        chat: {
          id: Number(config.chatId),
          type: "private",
        },
        from: {
          id: Number(config.chatId),
          is_bot: false,
          first_name: "Doctor",
          username: "doctor",
        },
      },
    };

    const webhookResponse = await sendJson(
      `${
        config.notificationBaseUrl
      }/api/v1/integrations/messaging/telegram/commands/webhook?tenantKey=${encodeURIComponent(
        config.tenantKey
      )}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(webhookPayload),
      }
    );

    summary.telegram.agendaWebhookTriggered = webhookResponse.ok;
    summary.telegram.agendaWebhookHandled =
      webhookResponse.body && Object.prototype.hasOwnProperty.call(webhookResponse.body, "handled")
        ? webhookResponse.body.handled
        : null;
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("Simulation failed:", error && error.message ? error.message : error);
  process.exit(1);
});
