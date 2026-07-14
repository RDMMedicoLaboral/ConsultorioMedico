import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "agenda.db");

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// NOTA: Para producción, migrar a PostgreSQL (recomendado en el documento
// original) por el cifrado en reposo (AES-256), backups gestionados y
// concurrencia. El esquema de abajo es intencionalmente compatible con
// Postgres (tipos simples, sin funciones específicas de SQLite) para que
// la migración sea casi un copy-paste de los CREATE TABLE.

db.exec(`
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_date TEXT,
  gender TEXT,
  phone TEXT,
  email TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  blood_type TEXT,
  allergies TEXT,            -- texto libre; se muestra como alerta roja en UI
  chronic_conditions TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  start_time TEXT NOT NULL,         -- ISO 8601
  duration_minutes INTEGER NOT NULL DEFAULT 20,
  visit_type TEXT NOT NULL DEFAULT 'subsecuente', -- 'primera_vez' | 'subsecuente'
  status TEXT NOT NULL DEFAULT 'programada',
  -- programada | confirmada | en_sala_espera | en_consulta | finalizada | cancelada | no_asistio
  reason TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_appointments_start_time ON appointments(start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);

-- Bitácora de auditoría mínima (quién/cuándo/qué), tal como exige el
-- documento fuente. En el MVP se registra desde las rutas.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL DEFAULT 'sistema',
  action TEXT NOT NULL,       -- create | update | delete | status_change
  entity TEXT NOT NULL,       -- patient | appointment
  entity_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

export function logAudit({ actor = "sistema", action, entity, entityId, detail }) {
  db.prepare(
    `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)`
  ).run(actor, action, entity, entityId ?? null, detail ? JSON.stringify(detail) : null);
}

export const VALID_STATUSES = [
  "programada",
  "confirmada",
  "en_sala_espera",
  "en_consulta",
  "finalizada",
  "cancelada",
  "no_asistio",
];
