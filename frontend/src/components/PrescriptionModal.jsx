import { useState } from "react";
import { api } from "../api.js";
import MedicationSearch from "./MedicationSearch.jsx";

export default function PrescriptionModal({ patientId, consultationId, doctorReady, onClose, onOpenDoctorProfile }) {
  const [items, setItems] = useState([]);
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [createdId, setCreatedId] = useState(null);

  function addMedication(med) {
    setItems((prev) => [
      ...prev,
      {
        key: `${med.id}-${prev.length}`,
        generic_name: med.generic_name,
        commercial_name: med.commercial_names?.split(",")[0]?.trim() || "",
        presentation: med.presentation,
        dose: "",
        frequency: "",
        duration: "",
      },
    ]);
  }

  function updateItem(idx, field, value) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  }

  function removeItem(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (items.length === 0) {
      setError("Agrega al menos un medicamento.");
      return;
    }
    setSaving(true);
    try {
      const rx = await api.prescriptions.create({
        patient_id: patientId,
        consultation_id: consultationId ?? null,
        items: items.map(({ key, ...rest }) => rest),
        instructions,
      });
      setCreatedId(rx.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal folder-card rx-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-tab" style={{ background: "#5B6B5F" }} />
        <h2 className="modal-title">Nueva receta electrónica</h2>

        {!doctorReady && (
          <p className="hint rx-warning">
            No has llenado el perfil del médico — la receta se generará sin encabezado.{" "}
            <button type="button" className="link-btn" onClick={onOpenDoctorProfile}>
              Llenarlo ahora
            </button>
          </p>
        )}

        {createdId ? (
          <div className="rx-success">
            <p>✓ Receta generada correctamente.</p>
            <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
              <a className="btn-primary" href={api.prescriptions.pdfUrl(createdId)} target="_blank" rel="noreferrer">
                Ver / descargar PDF
              </a>
              <button className="btn-ghost" onClick={onClose}>
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className="soap-block">
              <span className="soap-letter">Agregar medicamento</span>
              <MedicationSearch onSelect={addMedication} />
            </label>

            {items.length > 0 && (
              <ul className="rx-item-list">
                {items.map((item, idx) => (
                  <li key={item.key} className="rx-item">
                    <div className="rx-item-header">
                      <strong>
                        {item.generic_name}
                        {item.commercial_name ? ` (${item.commercial_name})` : ""}
                      </strong>
                      <button type="button" className="link-btn" onClick={() => removeItem(idx)}>
                        Quitar
                      </button>
                    </div>
                    <div className="rx-item-sub">{item.presentation}</div>
                    <div className="rx-item-grid">
                      <input
                        placeholder="Dosis (ej. 1 tableta)"
                        value={item.dose}
                        onChange={(e) => updateItem(idx, "dose", e.target.value)}
                      />
                      <input
                        placeholder="Frecuencia (ej. cada 8 h)"
                        value={item.frequency}
                        onChange={(e) => updateItem(idx, "frequency", e.target.value)}
                      />
                      <input
                        placeholder="Duración (ej. 5 días)"
                        value={item.duration}
                        onChange={(e) => updateItem(idx, "duration", e.target.value)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <label className="soap-block" style={{ marginTop: 14 }}>
              <span className="soap-letter">Indicaciones adicionales</span>
              <textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
            </label>

            {error && <p className="form-error">{error}</p>}

            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Generando…" : "Generar receta"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
