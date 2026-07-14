import express from "express";
import cors from "cors";
import "./db.js"; // inicializa el esquema al arrancar
import { patientsRouter } from "./routes/patients.js";
import { appointmentsRouter } from "./routes/appointments.js";
import { consultationsRouter } from "./routes/consultations.js";
import { cie11Router } from "./routes/cie11.js";
import { medicationsRouter } from "./routes/medications.js";
import { doctorProfileRouter } from "./routes/doctorProfile.js";
import { prescriptionsRouter } from "./routes/prescriptions.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Log simple de auditoría de acceso (IP + ruta), como pide el documento.
// En producción: guardar también el usuario autenticado (JWT/sesión).
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} desde ${req.ip}`);
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/patients", patientsRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/cie11", cie11Router);
app.use("/api/medications", medicationsRouter);
app.use("/api/doctor-profile", doctorProfileRouter);
app.use("/api/prescriptions", prescriptionsRouter);
app.use("/api", consultationsRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
});

app.listen(PORT, () => {
  console.log(`API de Agenda escuchando en http://localhost:${PORT}`);
});
