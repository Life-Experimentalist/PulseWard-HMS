import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";

const __dir = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dir, "pulseward.db");

let _db;

export function getDb() {
  if (!_db) {
    _db = new DatabaseSync(DB_PATH);
    _db.exec("PRAGMA journal_mode = WAL");
    _db.exec("PRAGMA foreign_keys = ON");
    initSchema(_db);
    seedIfEmpty(_db);
  }
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      hfr_id TEXT,
      accent TEXT DEFAULT '#0f4c5c',
      branding_json TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','clinician','patient','frontdesk','ops')),
      linked_entity_id TEXT,
      name TEXT NOT NULL,
      totp_enabled INTEGER DEFAULT 0,
      last_login_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(tenant_id, email)
    );

    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      mrn TEXT NOT NULL,
      profile_id TEXT,
      abha_number TEXT,
      abha_address TEXT,
      name TEXT NOT NULL,
      dob TEXT,
      gender TEXT CHECK(gender IN ('M','F','O')),
      blood_type TEXT,
      phone TEXT,
      email TEXT,
      photo_url TEXT,
      demographics_json TEXT DEFAULT '{}',
      conditions_json TEXT DEFAULT '[]',
      allergies_json TEXT DEFAULT '[]',
      vitals_json TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(tenant_id, mrn)
    );

    CREATE TABLE IF NOT EXISTS clinicians (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      specialty TEXT,
      department TEXT,
      npi TEXT,
      photo_url TEXT,
      languages_json TEXT DEFAULT '["English"]',
      color TEXT DEFAULT '#0f4c5c',
      bio TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      clinician_id TEXT NOT NULL REFERENCES clinicians(id),
      starts_at INTEGER NOT NULL,
      duration_min INTEGER NOT NULL DEFAULT 30,
      kind TEXT DEFAULT 'consultation',
      status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK(status IN ('scheduled','checked-in','in-progress','completed','cancelled','no-show')),
      room TEXT,
      reason TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS availability_blocks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      clinician_id TEXT NOT NULL REFERENCES clinicians(id),
      starts_at INTEGER NOT NULL,
      ends_at INTEGER NOT NULL,
      kind TEXT DEFAULT 'leave',
      reason TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      clinician_id TEXT NOT NULL REFERENCES clinicians(id),
      appointment_id TEXT REFERENCES appointments(id),
      type TEXT DEFAULT 'soap' CHECK(type IN ('soap','progress','telecons','admission','discharge')),
      title TEXT,
      body_json TEXT DEFAULT '{}',
      diagnoses_json TEXT DEFAULT '[]',
      signed_at INTEGER,
      prev_hash TEXT,
      addendum_of TEXT REFERENCES notes(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS lab_orders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      clinician_id TEXT NOT NULL REFERENCES clinicians(id),
      panel TEXT NOT NULL,
      ordered_at INTEGER NOT NULL DEFAULT (unixepoch()),
      status TEXT NOT NULL DEFAULT 'ordered'
        CHECK(status IN ('ordered','in-lab','resulted','reviewed','cancelled')),
      results_json TEXT DEFAULT '{}',
      pdf_key TEXT,
      reviewed_at INTEGER,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS prescriptions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      clinician_id TEXT NOT NULL REFERENCES clinicians(id),
      appointment_id TEXT REFERENCES appointments(id),
      drug TEXT NOT NULL,
      form TEXT,
      dose TEXT,
      freq TEXT,
      duration TEXT,
      refills INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK(status IN ('active','dispensed','completed','discontinued')),
      instructions TEXT,
      override_reason TEXT,
      discontinued_reason TEXT,
      prescribed_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      clinician_id TEXT NOT NULL REFERENCES clinicians(id),
      subject TEXT,
      thread_json TEXT DEFAULT '[]',
      last_at INTEGER NOT NULL DEFAULT (unixepoch()),
      read_by_patient INTEGER DEFAULT 0,
      read_by_clinician INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      user_id TEXT REFERENCES users(id),
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      payload_json TEXT DEFAULT '{}',
      read_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS consents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      scope TEXT NOT NULL,
      granted INTEGER DEFAULT 0,
      granted_at INTEGER,
      expires_at INTEGER,
      abdm_consent_id TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      at INTEGER NOT NULL DEFAULT (unixepoch()),
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      scope TEXT,
      ip TEXT,
      user_agent TEXT,
      diff_json TEXT
    );

    -- Rotating refresh tokens. Each row is one issued token; on refresh the old
    -- row is revoked and a new one is issued in the same family. Replay of a
    -- revoked token revokes the whole family (reuse detection).
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      family_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      revoked_at INTEGER,
      replaced_by TEXT
    );

    -- Operational incidents recorded by ops/admin; uptime is derived from these.
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      severity TEXT NOT NULL CHECK(severity IN ('sev1','sev2','sev3')),
      title TEXT NOT NULL,
      service TEXT DEFAULT 'api-gateway',
      detail TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','monitoring','resolved')),
      owner TEXT,
      opened_at INTEGER NOT NULL DEFAULT (unixepoch()),
      resolved_at INTEGER
    );

    -- Appointments displaced by an availability block, awaiting an admin or
    -- front-desk decision: reassign, reschedule, or cancel.
    CREATE TABLE IF NOT EXISTS reassignment_queue (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      appointment_id TEXT NOT NULL REFERENCES appointments(id),
      block_id TEXT REFERENCES availability_blocks(id),
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
      resolution_json TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      resolved_at INTEGER
    );

    -- Per-user Eisenhower task board (Do first / Schedule / Delegate / Eliminate).
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      quadrant TEXT NOT NULL DEFAULT 'do' CHECK(quadrant IN ('do','schedule','delegate','eliminate')),
      done INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_appt_clinician ON appointments(tenant_id, clinician_id, starts_at);
    CREATE INDEX IF NOT EXISTS idx_appt_patient ON appointments(tenant_id, patient_id, starts_at);
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_events(tenant_id, at DESC);
    CREATE INDEX IF NOT EXISTS idx_refresh_family ON refresh_tokens(family_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_block_clinician ON availability_blocks(tenant_id, clinician_id, starts_at);
    CREATE INDEX IF NOT EXISTS idx_queue_tenant ON reassignment_queue(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(tenant_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_incidents_tenant ON incidents(tenant_id, opened_at DESC);
  `);
  applyMigrations(db);
}

// CREATE TABLE IF NOT EXISTS never alters an existing table, so columns added
// after a release must be applied to older databases explicitly.
function applyMigrations(db) {
  const ensureColumn = (table, column, ddl) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };
  ensureColumn("prescriptions", "discontinued_reason", "discontinued_reason TEXT");
}

function seedIfEmpty(db) {
  const tenantExists = db.prepare("SELECT id FROM tenants LIMIT 1").get();
  if (tenantExists) return;

  const tenantId = uuid();
  const adminId = uuid();
  const clinician1Id = uuid();
  const clinician2Id = uuid();
  const clinician3Id = uuid();
  const patient1Id = uuid();
  const patient2Id = uuid();
  const patient3Id = uuid();

  const adminHash = bcrypt.hashSync("Admin@123", 10);
  const drHash = bcrypt.hashSync("Doctor@123", 10);
  const ptHash = bcrypt.hashSync("Patient@123", 10);

  const now = Math.floor(Date.now() / 1000);
  const today = new Date();
  today.setHours(9, 0, 0, 0);
  const todayTs = Math.floor(today.getTime() / 1000);

  db.prepare("INSERT INTO tenants(id,slug,name,hfr_id,accent,created_at) VALUES(?,?,?,?,?,?)").run(
    tenantId,
    "default",
    "PulseWard General Hospital",
    "HFR-001",
    "#0f4c5c",
    now
  );

  db.prepare(
    "INSERT INTO users(id,tenant_id,email,password_hash,role,name,created_at) VALUES(?,?,?,?,?,?,?)"
  ).run(adminId, tenantId, "admin@pulseward.com", adminHash, "admin", "System Admin", now);

  db.prepare(
    "INSERT INTO clinicians(id,tenant_id,name,specialty,department,color,bio) VALUES(?,?,?,?,?,?,?)"
  ).run(
    clinician1Id,
    tenantId,
    "Dr. Priya Sharma",
    "Cardiology",
    "Cardiology",
    "#0f4c5c",
    "Senior cardiologist with 15 years of experience in interventional cardiology."
  );
  db.prepare(
    "INSERT INTO clinicians(id,tenant_id,name,specialty,department,color,bio) VALUES(?,?,?,?,?,?,?)"
  ).run(
    clinician2Id,
    tenantId,
    "Dr. Arjun Mehta",
    "Neurology",
    "Neurology",
    "#6b46c1",
    "Neurologist specializing in epilepsy and movement disorders."
  );
  db.prepare(
    "INSERT INTO clinicians(id,tenant_id,name,specialty,department,color,bio) VALUES(?,?,?,?,?,?,?)"
  ).run(
    clinician3Id,
    tenantId,
    "Dr. Sunita Rao",
    "General Medicine",
    "General Medicine",
    "#1f8a5b",
    "General physician focused on preventive care and chronic disease management."
  );

  db.prepare(
    "INSERT INTO users(id,tenant_id,email,password_hash,role,linked_entity_id,name,created_at) VALUES(?,?,?,?,?,?,?,?)"
  ).run(
    uuid(),
    tenantId,
    "dr.sharma@pulseward.com",
    drHash,
    "clinician",
    clinician1Id,
    "Dr. Priya Sharma",
    now
  );
  db.prepare(
    "INSERT INTO users(id,tenant_id,email,password_hash,role,linked_entity_id,name,created_at) VALUES(?,?,?,?,?,?,?,?)"
  ).run(
    uuid(),
    tenantId,
    "dr.mehta@pulseward.com",
    drHash,
    "clinician",
    clinician2Id,
    "Dr. Arjun Mehta",
    now
  );

  db.prepare(
    "INSERT INTO patients(id,tenant_id,mrn,profile_id,name,dob,gender,blood_type,phone,email,conditions_json,allergies_json,vitals_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).run(
    patient1Id,
    tenantId,
    "PW-26-00001",
    "PID-A1B2C",
    "Riya Patel",
    "1990-03-15",
    "F",
    "B+",
    "+91 98765 43210",
    "patient@pulseward.com",
    JSON.stringify(["Type 2 Diabetes", "Hypertension"]),
    JSON.stringify([
      { substance: "Penicillin", severity: "severe", reaction: "Anaphylaxis" },
      { substance: "Sulfa drugs", severity: "moderate", reaction: "Rash" },
    ]),
    JSON.stringify([
      { at: now - 86400 * 90, bp: "134/86", hr: 78, temp: 36.7, weight: 63.5, spo2: 97 },
      { at: now - 86400 * 30, bp: "130/84", hr: 76, temp: 36.6, weight: 62.8, spo2: 98 },
      { at: now - 86400 * 7, bp: "128/82", hr: 74, temp: 36.8, weight: 62, spo2: 98 },
    ])
  );

  db.prepare(
    "INSERT INTO patients(id,tenant_id,mrn,profile_id,name,dob,gender,blood_type,phone,email,conditions_json,allergies_json,vitals_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).run(
    patient2Id,
    tenantId,
    "PW-26-00002",
    "PID-D4E5F",
    "Vikram Singh",
    "1975-11-22",
    "M",
    "O+",
    "+91 87654 32109",
    "vikram.singh@email.com",
    JSON.stringify(["Asthma"]),
    JSON.stringify([{ substance: "Aspirin", severity: "mild", reaction: "GI upset" }]),
    JSON.stringify([
      { at: now - 86400 * 14, bp: "118/76", hr: 68, temp: 36.5, weight: 78, spo2: 96 },
    ])
  );

  db.prepare(
    "INSERT INTO patients(id,tenant_id,mrn,profile_id,name,dob,gender,blood_type,phone,email,conditions_json,allergies_json,vitals_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).run(
    patient3Id,
    tenantId,
    "PW-26-00003",
    "PID-G7H8I",
    "Meera Nair",
    "1985-07-08",
    "F",
    "A+",
    "+91 76543 21098",
    "meera.nair@email.com",
    JSON.stringify([]),
    JSON.stringify([]),
    JSON.stringify([
      { at: now - 86400 * 21, bp: "110/70", hr: 64, temp: 36.6, weight: 55, spo2: 99 },
    ])
  );

  db.prepare(
    "INSERT INTO users(id,tenant_id,email,password_hash,role,linked_entity_id,name,created_at) VALUES(?,?,?,?,?,?,?,?)"
  ).run(
    uuid(),
    tenantId,
    "patient@pulseward.com",
    ptHash,
    "patient",
    patient1Id,
    "Riya Patel",
    now
  );

  // Appointments
  const appt1Id = uuid();
  const appt2Id = uuid();
  const appt3Id = uuid();

  db.prepare(
    "INSERT INTO appointments(id,tenant_id,patient_id,clinician_id,starts_at,duration_min,kind,status,reason) VALUES(?,?,?,?,?,?,?,?,?)"
  ).run(
    appt1Id,
    tenantId,
    patient1Id,
    clinician1Id,
    todayTs + 3600,
    30,
    "consultation",
    "scheduled",
    "Quarterly diabetes review and BP monitoring"
  );
  db.prepare(
    "INSERT INTO appointments(id,tenant_id,patient_id,clinician_id,starts_at,duration_min,kind,status,reason) VALUES(?,?,?,?,?,?,?,?,?)"
  ).run(
    appt2Id,
    tenantId,
    patient2Id,
    clinician1Id,
    todayTs + 7200,
    45,
    "follow-up",
    "scheduled",
    "Asthma management follow-up"
  );
  db.prepare(
    "INSERT INTO appointments(id,tenant_id,patient_id,clinician_id,starts_at,duration_min,kind,status,reason) VALUES(?,?,?,?,?,?,?,?,?)"
  ).run(
    appt3Id,
    tenantId,
    patient1Id,
    clinician3Id,
    todayTs + 86400 * 3,
    30,
    "follow-up",
    "scheduled",
    "General health check"
  );
  db.prepare(
    "INSERT INTO appointments(id,tenant_id,patient_id,clinician_id,starts_at,duration_min,kind,status,reason) VALUES(?,?,?,?,?,?,?,?,?)"
  ).run(
    uuid(),
    tenantId,
    patient1Id,
    clinician1Id,
    todayTs - 86400 * 7,
    30,
    "consultation",
    "completed",
    "Blood pressure review"
  );

  // Lab orders
  db.prepare(
    "INSERT INTO lab_orders(id,tenant_id,patient_id,clinician_id,panel,status,results_json) VALUES(?,?,?,?,?,?,?)"
  ).run(
    uuid(),
    tenantId,
    patient1Id,
    clinician1Id,
    "HbA1c + Lipid Profile",
    "resulted",
    JSON.stringify({
      HbA1c: { value: "7.2", unit: "%", referenceRange: "< 7.0", flag: "H" },
      "Total Cholesterol": { value: "195", unit: "mg/dL", referenceRange: "< 200" },
      LDL: { value: "118", unit: "mg/dL", referenceRange: "< 100", flag: "H" },
      HDL: { value: "52", unit: "mg/dL", referenceRange: "> 40" },
      Triglycerides: { value: "142", unit: "mg/dL", referenceRange: "< 150" },
    })
  );
  db.prepare(
    "INSERT INTO lab_orders(id,tenant_id,patient_id,clinician_id,panel,status,results_json) VALUES(?,?,?,?,?,?,?)"
  ).run(uuid(), tenantId, patient2Id, clinician1Id, "CBC + Spirometry", "ordered", "{}");

  // Prescriptions
  db.prepare(
    "INSERT INTO prescriptions(id,tenant_id,patient_id,clinician_id,drug,form,dose,freq,duration,refills,status,instructions) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)"
  ).run(
    uuid(),
    tenantId,
    patient1Id,
    clinician1Id,
    "Metformin",
    "Tablet",
    "500mg",
    "BD",
    "90",
    2,
    "active",
    "Take after meals with water"
  );
  db.prepare(
    "INSERT INTO prescriptions(id,tenant_id,patient_id,clinician_id,drug,form,dose,freq,duration,refills,status,instructions) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)"
  ).run(
    uuid(),
    tenantId,
    patient1Id,
    clinician1Id,
    "Amlodipine",
    "Tablet",
    "5mg",
    "OD",
    "90",
    2,
    "active",
    "Take in the morning"
  );
  db.prepare(
    "INSERT INTO prescriptions(id,tenant_id,patient_id,clinician_id,drug,form,dose,freq,duration,refills,status,instructions) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)"
  ).run(
    uuid(),
    tenantId,
    patient2Id,
    clinician1Id,
    "Salbutamol",
    "Inhaler",
    "2 puffs",
    "PRN",
    "30",
    1,
    "active",
    "Use when wheezing or breathless"
  );

  // Notes (SOAP)
  db.prepare(
    "INSERT INTO notes(id,tenant_id,patient_id,clinician_id,type,title,body_json,diagnoses_json,signed_at) VALUES(?,?,?,?,?,?,?,?,?)"
  ).run(
    uuid(),
    tenantId,
    patient1Id,
    clinician1Id,
    "soap",
    "Quarterly Diabetes Review",
    JSON.stringify({
      subjective:
        "Patient reports good compliance with medications. Occasional morning hyperglycaemia. No chest pain or dyspnoea.",
      objective:
        "BP: 128/82 mmHg, HR: 74 bpm, Weight: 62 kg, BMI: 23.4. HbA1c: 7.2% (up from 6.9 last quarter).",
      assessment: "Type 2 Diabetes - suboptimal control. Hypertension - well controlled.",
      plan: "Increase Metformin to 1000mg BD. Recheck HbA1c in 3 months. Reinforce dietary counselling. Continue Amlodipine.",
    }),
    JSON.stringify([
      { icd10: "E11.65", label: "Type 2 diabetes mellitus with hyperglycemia" },
      { icd10: "I10", label: "Essential hypertension" },
    ]),
    Math.floor(Date.now() / 1000) - 86400 * 7
  );

  // Messages
  db.prepare(
    "INSERT INTO messages(id,tenant_id,patient_id,clinician_id,subject,thread_json,last_at) VALUES(?,?,?,?,?,?,?)"
  ).run(
    uuid(),
    tenantId,
    patient1Id,
    clinician1Id,
    "Question about medication side effects",
    JSON.stringify([
      {
        from: "patient",
        text: "Doctor, I have been feeling slightly nauseous in the mornings since starting Metformin. Is this normal?",
        at: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
      {
        from: "clinician",
        text: "Yes, nausea is a common side effect. Try taking it right after a full meal. If it persists beyond 2 weeks, please let me know.",
        at: new Date(Date.now() - 86400000).toISOString(),
      },
    ]),
    Math.floor(Date.now() / 1000) - 86400
  );

  // Notifications
  const notifUserId = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get("patient@pulseward.com")?.id;
  if (notifUserId) {
    db.prepare(
      "INSERT INTO notifications(id,tenant_id,user_id,kind,title,body,created_at) VALUES(?,?,?,?,?,?,?)"
    ).run(
      uuid(),
      tenantId,
      notifUserId,
      "appointment.booked",
      "Appointment Confirmed",
      "Your appointment with Dr. Priya Sharma is scheduled for today at 10:00 AM.",
      now - 3600
    );
    db.prepare(
      "INSERT INTO notifications(id,tenant_id,user_id,kind,title,body,created_at) VALUES(?,?,?,?,?,?,?)"
    ).run(
      uuid(),
      tenantId,
      notifUserId,
      "lab.resulted",
      "Lab Results Ready",
      "Your HbA1c + Lipid Profile results are now available.",
      now - 7200
    );
  }

  console.log("✓ Database seeded");
  console.log("  Patient:   patient@pulseward.com  / Patient@123");
  console.log("  Clinician: dr.sharma@pulseward.com / Doctor@123");
  console.log("  Admin:     admin@pulseward.com     / Admin@123");
}
