import { useEffect, useState } from "react";
import { api } from "../api.js";
import DiagnosisSearch from "./DiagnosisSearch.jsx";

const EMPTY_NOTE = {
  subjective: "",
  blood_pressure: "",
  heart_rate: "",
  temperature_c: "",
  weight_kg: "",
  height_cm: "",
  diagnosis_code: "",
  diagnosis_label: "",
  plan: "",
};

function computeBmi(weight, height) {
  const w = Number(weight);
  const h = Number(height);
  if (!w || !h) return null;
  const m = h / 100;
  return Math.round((w / (m * m)) * 10) / 10;
}

function formatDateTime(iso) {
  return new Date(iso.replace(" ", "T")).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PatientRecord({ patientId, appointmentId, onBack }) {
  const [patient, setPatient] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState(EMPTY_NOTE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedMsg, setSavedMsg] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [p, h] = await Promise.all([
        api.patients.get(patientId),
        api.consultations.listByPatient(patientId),
      ]);
      setPatient(p);
      setHistory(h);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    setNote(EMPTY_NOTE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const set = (field) => (e) => setNote({ ...note, [field]: e.target.value });
  const bmi = computeBmi(note.weight_kg, note.height_cm);

  async function handleSave(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.consultations.create({
        patient_id: patientId,
        appointment_id: appointmentId ?? null,
        subjective: note.subjective || null,
        blood_pressure: note.blood_pressure || null,
        heart_rate: note.heart_rate ? Number(note.heart_rate) : null,
        temperature_c: note.temperature_c ? Number(note.temperature_c) : null,
        weight_kg: note.weight_kg ? Number(note.weight_kg) : null,
        height_cm: note.height_cm ? Number(note.height_cm) : null,
        diagnosis_code: note.diagnosis_code || null,
        diagnosis_label: note.diagnosis_label || null,
        plan: note.plan || null,
      });
      setNote(EMPTY_NOTE);
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2500);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !patient) {
    return <p className="empty-state">Cargando expediente…</p>;
  }

  return (
    <div className="record-shell">
      <button className="btn-ghost back-btn" onClick={onBack}>
        ← Volver a la agenda
      </button>

      <div className="record-grid">
        {/* ---------- Columna izquierda: ficha + historial ---------- */}
        <aside className="record-history">
          <div className="folder-card">
            <div className="modal-tab" style={{ background: "#3D6B5C" }} />
            <h2 className="patient-title">
              {patient.first_name} {patient.last_name}
            </h2>
            <dl className="id-list">
              {patient.birth_date && (
                <>
                  <dt>Nacimiento</dt>
                  <dd>{patient.birth_date}</dd>
                </>
              )}
              {patient.gender && (
                <>
                  <dt>Género</dt>
                  <dd>{patient.gender}</dd>
                </>
              )}
              {patient.blood_type && (
                <>
                  <dt>Tipo de sangre</dt>
                  <dd>{patient.blood_type}</dd>
                </>
              )}
              {patient.phone && (
                <>
                  <dt>Teléfono</dt>
                  <dd>{patient.phone}</dd>
                </>
              )}
            </dl>

            {patient.allergies && (
              <div className="allergy-banner">⚠ ALERGIAS: {patient.allergies}</div>
            )}
            {patient.chronic_conditions && (
              <div className="chronic-note">
                <strong>Antecedentes:</strong> {patient.chronic_conditions}
              </div>
            )}
          </div>

          <h3 className="history-title">Historial cronológico</h3>
          {history.length === 0 ? (
            <p className="hint">Aún no hay notas de evolución.</p>
          ) : (
            <ol className="history-list">
              {history.map((c) => (
                <li key={c.id} className="folder-card history-card">
                  <div className="modal-tab" style={{ background: "#2B5C8A" }} />
                  <div className="history-date">{formatDateTime(c.created_at)}</div>
                  {c.diagnosis_label && (
                    <div className="history-dx">
                      {c.diagnosis_code && <span className="cie-code">{c.diagnosis_code}</span>}{" "}
                      {c.diagnosis_label}
                    </div>
                  )}
                  {c.subjective && <div className="history-field"><strong>S:</strong> {c.subjective}</div>}
                  {(c.blood_pressure || c.heart_rate || c.bmi) && (
                    <div className="history-field">
                      <strong>O:</strong>{" "}
                      {[
                        c.blood_pressure && `PA ${c.blood_pressure}`,
                        c.heart_rate && `FC ${c.heart_rate} lpm`,
                        c.temperature_c && `T ${c.temperature_c}°C`,
                        c.bmi && `IMC ${c.bmi}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                  {c.plan && <div className="history-field"><strong>P:</strong> {c.plan}</div>}
                </li>
              ))}
            </ol>
          )}
        </aside>

        {/* ---------- Columna derecha: nueva nota SOAP ---------- */}
        <section className="record-note folder-card">
          <div className="modal-tab" style={{ background: "#C08A3E" }} />
          <h3 className="modal-title">Nueva nota de evolución (SOAP)</h3>

          <form onSubmit={handleSave} className="soap-form">
            <label className="soap-block">
              <span className="soap-letter">S · Subjetivo</span>
              <textarea
                rows={3}
                value={note.subjective}
                onChange={set("subjective")}
                placeholder="Motivo de consulta, síntomas que refiere el paciente…"
              />
            </label>

            <div className="soap-block">
              <span className="soap-letter">O · Objetivo (signos vitales)</span>
              <div className="vitals-grid">
                <label>
                  Presión arterial
                  <input value={note.blood_pressure} onChange={set("blood_pressure")} placeholder="120/80" />
                </label>
                <label>
                  FC (lpm)
                  <input type="number" value={note.heart_rate} onChange={set("heart_rate")} />
                </label>
                <label>
                  Temp (°C)
                  <input type="number" step="0.1" value={note.temperature_c} onChange={set("temperature_c")} />
                </label>
                <label>
                  Peso (kg)
                  <input type="number" step="0.1" value={note.weight_kg} onChange={set("weight_kg")} />
                </label>
                <label>
                  Talla (cm)
                  <input type="number" value={note.height_cm} onChange={set("height_cm")} />
                </label>
                <label>
                  IMC
                  <input value={bmi ?? "—"} disabled />
                </label>
              </div>
            </div>

            <label className="soap-block">
              <span className="soap-letter">A · Análisis (diagnóstico, CIE-11)</span>
              <DiagnosisSearch
                code={note.diagnosis_code}
                label={note.diagnosis_label}
                onSelect={({ code, label }) => setNote((n) => ({ ...n, diagnosis_code: code, diagnosis_label: label }))}
              />
            </label>

            <label className="soap-block">
              <span className="soap-letter">P · Plan</span>
              <textarea
                rows={3}
                value={note.plan}
                onChange={set("plan")}
                placeholder="Tratamiento, estudios solicitados, recomendaciones…"
              />
            </label>

            {error && <p className="form-error">{error}</p>}
            {savedMsg && <p className="saved-msg">✓ Nota guardada.</p>}

            <div className="modal-actions">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Guardando…" : "Guardar nota"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
