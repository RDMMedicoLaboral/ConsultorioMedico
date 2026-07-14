import { Router } from "express";
import { db, logAudit } from "../db.js";

export const patientsRouter = Router();

// GET /api/patients?q=texto  -> lista / búsqueda
patientsRouter.get("/", (req, res) => {
  const { q } = req.query;
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = db
      .prepare(
        `SELECT * FROM patients
         WHERE first_name LIKE ? OR last_name LIKE ? OR phone LIKE ?
         ORDER BY last_name, first_name`
      )
      .all(like, like, like);
  } else {
    rows = db.prepare(`SELECT * FROM patients ORDER BY last_name, first_name`).all();
  }
  res.json(rows);
});

patientsRouter.get("/:id", (req, res) => {
  const patient = db.prepare(`SELECT * FROM patients WHERE id = ?`).get(req.params.id);
  if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });
  res.json(patient);
});

patientsRouter.post("/", (req, res) => {
  const {
    first_name,
    last_name,
    birth_date,
    gender,
    phone,
    email,
    emergency_contact_name,
    emergency_contact_phone,
    blood_type,
    allergies,
    chronic_conditions,
    notes,
  } = req.body;

  if (!first_name || !last_name) {
    return res.status(400).json({ error: "first_name y last_name son obligatorios" });
  }

  const result = db
    .prepare(
      `INSERT INTO patients
        (first_name, last_name, birth_date, gender, phone, email,
         emergency_contact_name, emergency_contact_phone, blood_type,
         allergies, chronic_conditions, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      first_name,
      last_name,
      birth_date ?? null,
      gender ?? null,
      phone ?? null,
      email ?? null,
      emergency_contact_name ?? null,
      emergency_contact_phone ?? null,
      blood_type ?? null,
      allergies ?? null,
      chronic_conditions ?? null,
      notes ?? null
    );

  logAudit({ action: "create", entity: "patient", entityId: result.lastInsertRowid });
  const patient = db.prepare(`SELECT * FROM patients WHERE id = ?`).get(result.lastInsertRowid);
  res.status(201).json(patient);
});

patientsRouter.put("/:id", (req, res) => {
  const existing = db.prepare(`SELECT * FROM patients WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Paciente no encontrado" });

  const merged = { ...existing, ...req.body };
  db.prepare(
    `UPDATE patients SET
      first_name = ?, last_name = ?, birth_date = ?, gender = ?, phone = ?,
      email = ?, emergency_contact_name = ?, emergency_contact_phone = ?,
      blood_type = ?, allergies = ?, chronic_conditions = ?, notes = ?,
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    merged.first_name,
    merged.last_name,
    merged.birth_date,
    merged.gender,
    merged.phone,
    merged.email,
    merged.emergency_contact_name,
    merged.emergency_contact_phone,
    merged.blood_type,
    merged.allergies,
    merged.chronic_conditions,
    merged.notes,
    req.params.id
  );

  logAudit({ action: "update", entity: "patient", entityId: req.params.id });
  res.json(db.prepare(`SELECT * FROM patients WHERE id = ?`).get(req.params.id));
});

patientsRouter.delete("/:id", (req, res) => {
  const existing = db.prepare(`SELECT * FROM patients WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Paciente no encontrado" });

  db.prepare(`DELETE FROM patients WHERE id = ?`).run(req.params.id);
  logAudit({ action: "delete", entity: "patient", entityId: req.params.id });
  res.status(204).end();
});
