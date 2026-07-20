import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "agenda.db");

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------- Migración de esquema (una sola vez) ----------
// Este proyecto pasó de "un solo consultorio" a "multi-clínica" (columna
// clinic_id en varias tablas). No hay lógica de migración incremental
// (ALTER TABLE) para el MVP: si detectamos que existe una base de datos
// con el esquema VIEJO (tabla `patients` sin la columna `clinic_id`),
// simplemente la reiniciamos por completo. Esto es seguro porque, en esta
// etapa, solo hay datos de prueba — nunca se usó con pacientes reales.
// Si en el futuro hay datos reales que proteger, esto debe reemplazarse
// por migraciones explícitas (o por la migración a PostgreSQL ya prevista
// en el README).
function needsFullReset() {
  const tableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='patients'`)
    .get();
  if (!tableExists) return false;
  const columns = db.prepare(`PRAGMA table_info(patients)`).all();
  const hasClinicId = columns.some((c) => c.name === "clinic_id");
  return !hasClinicId;
}

if (needsFullReset()) {
  console.warn(
    "[db] Detectado esquema anterior a multi-clínica (sin clinic_id). " +
      "Reiniciando la base de datos por completo (solo afecta datos de prueba)."
  );
  const oldTables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
    .all();
  db.pragma("foreign_keys = OFF");
  for (const { name } of oldTables) {
    db.exec(`DROP TABLE IF EXISTS "${name}"`);
  }
  db.pragma("foreign_keys = ON");
}

// Migración aditiva segura: agrega columnas nuevas a tablas que ya existen,
// SIN borrar nada. A diferencia del reset de arriba (que solo aplicaba al
// cambio grande de "un consultorio" -> "multi-clínica"), este patrón es el
// que se debe usar de aquí en adelante para cualquier columna nueva.
function ensureColumn(table, column, definition) {
  const tableExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
  if (!tableExists) return; // la tabla se crea más abajo con la columna incluida
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const hasColumn = columns.some((c) => c.name === column);
  if (!hasColumn) {
    db.exec(`ALTER TABLE "${table}" ADD COLUMN ${column} ${definition}`);
  }
}

// NOTA: Para producción, migrar a PostgreSQL (recomendado en el documento
// original) por el cifrado en reposo (AES-256), backups gestionados y
// concurrencia. El esquema de abajo es intencionalmente compatible con
// Postgres (tipos simples, sin funciones específicas de SQLite) para que
// la migración sea casi un copy-paste de los CREATE TABLE.

db.exec(`
-- Cada consultorio/médico que compra la plataforma es una "clínica".
-- TODO lo demás (usuarios, pacientes, citas, expedientes, recetas,
-- configuración) cuelga de una clínica y nunca se comparte entre clínicas.
CREATE TABLE IF NOT EXISTS clinics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_patients_clinic ON patients(clinic_id);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  start_time TEXT NOT NULL,         -- ISO 8601
  duration_minutes INTEGER NOT NULL DEFAULT 20,
  visit_type TEXT NOT NULL DEFAULT 'subsecuente', -- 'primera_vez' | 'subsecuente'
  status TEXT NOT NULL DEFAULT 'programada',
  -- programada | confirmada | en_sala_espera | en_consulta | finalizada | cancelada | no_asistio
  reason TEXT,
  notes TEXT,
  reminder_sent_at TEXT,      -- cuándo se envió el recordatorio (NULL = no enviado)
  reminder_channel TEXT,      -- 'whatsapp' | 'sms' | 'simulado'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_appointments_clinic ON appointments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_appointments_start_time ON appointments(start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);

-- Notas de evolución, formato SOAP (Subjetivo / Objetivo / Análisis / Plan).
-- Una fila = una consulta. Vinculada opcionalmente a la cita que la originó.
CREATE TABLE IF NOT EXISTS consultations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  -- S: Subjetivo
  subjective TEXT,
  -- O: Objetivo (signos vitales)
  blood_pressure TEXT,       -- ej. "120/80"
  heart_rate INTEGER,        -- lpm
  temperature_c REAL,
  weight_kg REAL,
  height_cm REAL,
  bmi REAL,                  -- calculado: weight_kg / (height_cm/100)^2
  -- A: Análisis / diagnóstico
  diagnosis_code TEXT,       -- código CIE-11
  diagnosis_label TEXT,      -- descripción del código
  -- P: Plan
  plan TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_consultations_clinic ON consultations(clinic_id);
CREATE INDEX IF NOT EXISTS idx_consultations_patient ON consultations(patient_id);

-- Catálogo GLOBAL (compartido entre todas las clínicas) con formato de
-- CIE-11 (código + descripción), solo para demostrar el flujo de
-- autocompletado del buscador de diagnóstico. No contiene datos de
-- pacientes, así que no hay problema en compartirlo entre clínicas.
-- IMPORTANTE: estos códigos son ilustrativos. Antes de usar el sistema en un
-- entorno clínico real, sustituir esta tabla por una integración con la API
-- oficial de la OMS (ICD-11 API, https://icd.who.int/icdapi), que requiere
-- credenciales propias y devuelve el catálogo vigente y completo.
CREATE TABLE IF NOT EXISTS cie11_catalog (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL
);

-- Catálogo GLOBAL de ejemplo de medicamentos (vademécum simplificado, se
-- comparte entre clínicas por la misma razón que el catálogo CIE-11).
CREATE TABLE IF NOT EXISTS medications_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  generic_name TEXT NOT NULL,
  commercial_names TEXT,     -- separados por coma
  presentation TEXT NOT NULL -- ej. "Tabletas 500 mg"
);

-- Perfil del médico que emite las recetas: una fila POR CLÍNICA.
CREATE TABLE IF NOT EXISTS doctor_profile (
  clinic_id INTEGER PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,
  full_name TEXT,
  professional_license TEXT, -- cédula profesional
  specialty TEXT,
  clinic_name TEXT,
  clinic_address TEXT,
  clinic_phone TEXT
);

-- Recetas electrónicas. Los medicamentos se guardan como JSON (lista de
-- {generic_name, commercial_name, presentation, dose, frequency, duration})
-- porque son inmutables una vez emitida la receta (no deben cambiar aunque
-- el catálogo se actualice después).
CREATE TABLE IF NOT EXISTS prescriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  consultation_id INTEGER REFERENCES consultations(id) ON DELETE SET NULL,
  qr_token TEXT NOT NULL UNIQUE,
  items_json TEXT NOT NULL,
  instructions TEXT,
  doctor_name TEXT,
  doctor_license TEXT,
  doctor_specialty TEXT,
  clinic_name TEXT,
  clinic_address TEXT,
  clinic_phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_clinic ON prescriptions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_qr ON prescriptions(qr_token);

-- Certificados médicos (incapacidad / reposo / aislamiento / teletrabajo).
-- Igual que en prescriptions: se guarda una "foto" (snapshot) de los datos
-- del paciente, del médico y del establecimiento en el momento de emitir
-- el certificado, porque un certificado ya emitido no debe cambiar aunque
-- el paciente o el perfil del médico se actualicen después.
CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  consultation_id INTEGER REFERENCES consultations(id) ON DELETE SET NULL,

  -- C) Motivo de aislamiento/enfermedad
  diagnosis_code TEXT,
  diagnosis_label TEXT,
  clinical_picture TEXT,       -- "Cuadro clínico"
  presents_symptoms INTEGER NOT NULL DEFAULT 1, -- 1 = SI, 0 = NO
  certificate_type TEXT NOT NULL DEFAULT 'enfermedad', -- 'enfermedad' | 'aislamiento' | 'teletrabajo'
  description TEXT,            -- síntomas / descripción adicional
  days_granted INTEGER NOT NULL,
  date_from TEXT NOT NULL,     -- YYYY-MM-DD
  date_to TEXT NOT NULL,       -- YYYY-MM-DD

  -- B) Datos del paciente (snapshot al momento de emitir)
  patient_full_name TEXT,
  patient_address TEXT,
  patient_phone TEXT,
  patient_email TEXT,
  patient_institution TEXT,
  patient_job_title TEXT,
  patient_id_number TEXT,
  patient_clinical_history_number TEXT,

  -- A) Datos del establecimiento / médico (snapshot al momento de emitir)
  doctor_name TEXT,
  doctor_personal_id TEXT,     -- C.I. del médico
  doctor_license TEXT,         -- Reg. SENESCYT / cédula profesional
  doctor_specialty TEXT,
  doctor_email TEXT,
  clinic_name TEXT,
  clinic_address TEXT,
  clinic_phone TEXT,
  issue_place TEXT,            -- ciudad de emisión, ej. "Manta"

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_certificates_clinic ON certificates(clinic_id);
CREATE INDEX IF NOT EXISTS idx_certificates_patient ON certificates(patient_id);

-- Usuarios del sistema. Dos roles, siempre dentro de UNA clínica:
--   medico     -> acceso total dentro de su propia clínica.
--   secretaria -> solo agenda y datos de contacto de SU clínica; nunca
--                 historial médico, diagnósticos ni recetas.
-- Las cuentas nuevas las crea el administrador de la plataforma (tú), no
-- hay registro público — ver routes/admin.js.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('medico', 'secretaria')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_clinic ON users(clinic_id);

-- Configuración de recordatorios automáticos: una fila POR CLÍNICA.
-- provider: 'simulado' (no envía nada real, solo lo registra — es el modo
-- por defecto para poder probar el flujo sin contratar nada) | 'twilio_whatsapp' | 'twilio_sms'.
CREATE TABLE IF NOT EXISTS reminder_settings (
  clinic_id INTEGER PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'simulado',
  twilio_account_sid TEXT,
  twilio_auth_token TEXT,
  twilio_from_number TEXT,
  message_template TEXT NOT NULL DEFAULT
    'Hola {paciente}, le recordamos su cita el {fecha} a las {hora} en {consultorio}. Responda 1 para CONFIRMAR o 2 para CANCELAR.',
  hours_before INTEGER NOT NULL DEFAULT 24,
  enabled INTEGER NOT NULL DEFAULT 0
);

-- Registro de cada envío/respuesta de recordatorio, para trazabilidad.
CREATE TABLE IF NOT EXISTS reminder_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER REFERENCES appointments(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,   -- 'out' (recordatorio enviado) | 'in' (respuesta del paciente)
  channel TEXT,
  body TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Bitácora de auditoría mínima (quién/cuándo/qué), tal como exige el
-- documento fuente. En el MVP se registra desde las rutas.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER,
  actor TEXT NOT NULL DEFAULT 'sistema',
  action TEXT NOT NULL,       -- create | update | delete | status_change
  entity TEXT NOT NULL,       -- patient | appointment
  entity_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Columnas nuevas agregadas después del lanzamiento inicial, para no
// perder datos ya existentes en producción (ver ensureColumn arriba).
ensureColumn("doctor_profile", "personal_id", "TEXT");      // C.I. del médico
ensureColumn("doctor_profile", "email", "TEXT");
ensureColumn("doctor_profile", "city", "TEXT");              // ciudad de emisión (ej. "Manta")
ensureColumn("patients", "id_number", "TEXT");                // cédula del paciente
ensureColumn("patients", "address", "TEXT");
ensureColumn("patients", "workplace", "TEXT");                // institución o empresa
ensureColumn("patients", "job_title", "TEXT");                // puesto de trabajo
ensureColumn("patients", "clinical_history_number", "TEXT");
ensureColumn("prescriptions", "updated_at", "TEXT");
ensureColumn("certificates", "updated_at", "TEXT");

// Catálogo de diagnósticos CIE-10 (el sistema que realmente se usa en los
// certificados médicos, recetas e historias clínicas en la práctica —
// CIE-11 es el estándar más nuevo de la OMS pero aún no es de uso común en
// el papeleo clínico del día a día). Es un catálogo de ejemplo con más de
// 100 diagnósticos comunes, NO oficial ni exhaustivo. Antes de usarlo en
// un entorno clínico real a gran escala, conviene sustituirlo por un
// catálogo CIE-10 completo y vigente (hay varios de dominio público).
// Se siembra con INSERT OR IGNORE (no solo la primera vez) para que
// cualquier código nuevo que se agregue aquí en el futuro se sume al
// catálogo existente sin duplicar ni perder nada.
{
  const seed = [
    // Infecciosas / parasitarias
    ["A09", "Diarrea y gastroenteritis de presunto origen infeccioso"],
    ["A09.1", "Diarrea y gastroenteritis de origen infeccioso"],
    ["A15", "Tuberculosis respiratoria"],
    ["A90", "Dengue"],
    ["B01", "Varicela"],
    ["B02", "Herpes zóster"],
    ["B34.9", "Infección viral, no especificada"],
    ["B86", "Escabiosis"],
    // Neoplasias (comunes en consulta)
    ["D12", "Pólipo del colon"],
    ["D50", "Anemia por deficiencia de hierro"],
    // Endocrinas / metabólicas
    ["E03.9", "Hipotiroidismo, no especificado"],
    ["E05.9", "Hipertiroidismo, no especificado"],
    ["E10", "Diabetes mellitus tipo 1"],
    ["E11", "Diabetes mellitus tipo 2"],
    ["E66.9", "Obesidad, no especificada"],
    ["E78.5", "Hiperlipidemia, no especificada"],
    // Mentales / conductuales
    ["F32.9", "Episodio depresivo, no especificado"],
    ["F41.1", "Trastorno de ansiedad generalizada"],
    ["F41.9", "Trastorno de ansiedad, no especificado"],
    ["F43.1", "Trastorno de estrés postraumático"],
    ["F51.0", "Insomnio no orgánico"],
    // Sistema nervioso
    ["G43.9", "Migraña, no especificada"],
    ["G44.2", "Cefalea tensional"],
    ["G47.0", "Trastornos del inicio y mantenimiento del sueño"],
    // Ojo / oído
    ["H10.9", "Conjuntivitis, no especificada"],
    ["H60.9", "Otitis externa, no especificada"],
    ["H66.9", "Otitis media, no especificada"],
    ["H81.0", "Enfermedad de Ménière"],
    // Circulatorias
    ["I10", "Hipertensión esencial (primaria)"],
    ["I20.9", "Angina de pecho, no especificada"],
    ["I25.9", "Enfermedad isquémica crónica del corazón"],
    ["I48", "Fibrilación y aleteo auricular"],
    ["I50.9", "Insuficiencia cardíaca, no especificada"],
    ["I83.9", "Várices de miembros inferiores"],
    // Respiratorias
    ["J00", "Rinofaringitis aguda (resfriado común)"],
    ["J01.9", "Sinusitis aguda, no especificada"],
    ["J02.9", "Faringitis aguda, no especificada"],
    ["J03.9", "Amigdalitis aguda, no especificada"],
    ["J06.9", "Infección aguda de las vías respiratorias superiores"],
    ["J11.1", "Influenza con otras manifestaciones respiratorias"],
    ["J18.9", "Neumonía, no especificada"],
    ["J20.9", "Bronquitis aguda, no especificada"],
    ["J30.4", "Rinitis alérgica, no especificada"],
    ["J35.0", "Amigdalitis crónica"],
    ["J40", "Bronquitis, no especificada como aguda o crónica"],
    ["J44.9", "Enfermedad pulmonar obstructiva crónica, no especificada"],
    ["J45.9", "Asma, no especificada"],
    // Digestivas
    ["K02.9", "Caries dental, no especificada"],
    ["K21.0", "Enfermedad por reflujo gastroesofágico con esofagitis"],
    ["K21.9", "Enfermedad por reflujo gastroesofágico sin esofagitis"],
    ["K29.7", "Gastritis, no especificada"],
    ["K30", "Dispepsia funcional"],
    ["K35.8", "Apendicitis aguda, otra y no especificada"],
    ["K52.9", "Gastroenteritis y colitis no infecciosa"],
    ["K59.0", "Estreñimiento"],
    ["K59.1", "Diarrea funcional"],
    ["K64.9", "Hemorroides, no especificadas"],
    // Piel
    ["L02.9", "Absceso cutáneo, no especificado"],
    ["L03.9", "Celulitis, no especificada"],
    ["L20.9", "Dermatitis atópica, no especificada"],
    ["L23.9", "Dermatitis alérgica de contacto"],
    ["L30.9", "Dermatitis, no especificada"],
    ["L50.9", "Urticaria, no especificada"],
    ["L70.0", "Acné vulgar"],
    // Musculoesquelético
    ["M25.5", "Dolor articular"],
    ["M54.2", "Cervicalgia"],
    ["M54.5", "Lumbago no especificado"],
    ["M54.9", "Dorsalgia, no especificada"],
    ["M17.9", "Gonartrosis (artrosis de rodilla), no especificada"],
    ["M19.9", "Artrosis, no especificada"],
    ["M79.1", "Mialgia"],
    ["M79.7", "Fibromialgia"],
    // Genitourinario
    ["N30.9", "Cistitis, no especificada"],
    ["N39.0", "Infección de vías urinarias, sitio no especificado"],
    ["N20.0", "Cálculo del riñón"],
    ["N76.0", "Vaginitis aguda"],
    ["N40", "Hiperplasia de la próstata"],
    // Embarazo / puerperio (uso frecuente en certificados de reposo)
    ["O21.0", "Hiperémesis gravídica leve"],
    ["O26.9", "Atención por afección relacionada con el embarazo"],
    ["Z34.9", "Supervisión de embarazo normal"],
    // Síntomas y signos (muy usados en certificados)
    ["R05", "Tos"],
    ["R06.0", "Disnea"],
    ["R10.4", "Dolor abdominal, otro y no especificado"],
    ["R11", "Náusea y vómito"],
    ["R42", "Mareo y desvanecimiento"],
    ["R50.9", "Fiebre, no especificada"],
    ["R51", "Cefalea"],
    ["R53", "Malestar y fatiga"],
    // Traumatismos / causas externas
    ["S00.9", "Traumatismo superficial de la cabeza"],
    ["S06.0", "Conmoción cerebral"],
    ["S13.4", "Esguince cervical"],
    ["S60.9", "Traumatismo superficial de la muñeca y de la mano"],
    ["S93.4", "Esguince de tobillo"],
    ["T14.9", "Traumatismo, no especificado"],
    // Factores que influyen en el estado de salud (chequeos, controles)
    ["Z00.0", "Examen médico general"],
    ["Z01.0", "Examen de ojos y de la visión"],
    ["Z23", "Necesidad de inmunización, dosis única"],
    ["Z71.1", "Consulta por preocupación de enfermedad no confirmada"],
    ["Z76.3", "Acompañante de persona enferma"],
  ];
  const insert = db.prepare(`INSERT OR IGNORE INTO cie11_catalog (code, label) VALUES (?, ?)`);
  const insertMany = db.transaction((rows) => rows.forEach((r) => insert.run(...r)));
  insertMany(seed);
}

const medsSeedCount = db.prepare(`SELECT COUNT(*) AS n FROM medications_catalog`).get().n;
if (medsSeedCount === 0) {
  // Vademécum mínimo de ejemplo (NO exhaustivo, NO oficial) solo para
  // demostrar el autocompletado del recetario.
  const seed = [
    ["Paracetamol", "Tempra, Tylenol", "Tabletas 500 mg"],
    ["Paracetamol", "Tempra, Tylenol", "Jarabe 120 mg/5 ml"],
    ["Ibuprofeno", "Advil, Motrin", "Tabletas 400 mg"],
    ["Ibuprofeno", "Advil, Motrin", "Suspensión 100 mg/5 ml"],
    ["Amoxicilina", "Amoxil", "Cápsulas 500 mg"],
    ["Amoxicilina", "Amoxil", "Suspensión 250 mg/5 ml"],
    ["Losartán", "Cozaar", "Tabletas 50 mg"],
    ["Metformina", "Glucophage", "Tabletas 850 mg"],
    ["Omeprazol", "Losec", "Cápsulas 20 mg"],
    ["Loratadina", "Clarityne", "Tabletas 10 mg"],
    ["Salbutamol", "Ventolin", "Inhalador 100 mcg"],
    ["Diclofenaco", "Voltaren", "Tabletas 50 mg"],
    ["Enalapril", "Renitec", "Tabletas 10 mg"],
    ["Atorvastatina", "Lipitor", "Tabletas 20 mg"],
    ["Cetirizina", "Zyrtec", "Tabletas 10 mg"],
    ["Azitromicina", "Zithromax", "Tabletas 500 mg"],
    ["Ácido acetilsalicílico", "Aspirina", "Tabletas 100 mg"],
    ["Metamizol", "Neomelubrina", "Tabletas 500 mg"],
    ["Dexametasona", "Decadron", "Tabletas 0.5 mg"],
    ["Complejo B", "Neurobion", "Tabletas"],
  ];
  const insert = db.prepare(
    `INSERT INTO medications_catalog (generic_name, commercial_names, presentation) VALUES (?, ?, ?)`
  );
  const insertMany = db.transaction((rows) => rows.forEach((r) => insert.run(...r)));
  insertMany(seed);
}

export function logAudit({ clinicId = null, actor = "sistema", action, entity, entityId, detail }) {
  db.prepare(
    `INSERT INTO audit_log (clinic_id, actor, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(clinicId, actor, action, entity, entityId ?? null, detail ? JSON.stringify(detail) : null);
}

export function newQrToken() {
  return crypto.randomBytes(16).toString("hex");
}

// Convierte "Sofía Barberán" o "sofia" en un slug simple ("sofia.barberan",
// "sofia"), y si ya existe le agrega un sufijo numérico (sofia2, sofia3...)
// hasta encontrar uno libre en TODA la plataforma (username es único
// globalmente porque el login no pide "clínica").
export function suggestAvailableUsername(desired) {
  const base = desired
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar acentos
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "") || "usuario";

  const exists = (u) => Boolean(db.prepare(`SELECT id FROM users WHERE username = ?`).get(u));

  if (!exists(base)) return base;
  let i = 2;
  while (exists(`${base}${i}`)) i++;
  return `${base}${i}`;
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
