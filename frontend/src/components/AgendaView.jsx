import { STATUS, NEXT_STATUS } from "../statusConfig.js";

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export default function AgendaView({ appointments, loading, onChangeStatus }) {
  if (loading) {
    return <p className="empty-state">Cargando agenda…</p>;
  }

  if (appointments.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-title">No hay citas para este día.</p>
        <p>Usa “Nueva cita” para agendar la primera.</p>
      </div>
    );
  }

  return (
    <ol className="agenda-list">
      {appointments.map((appt) => {
        const status = STATUS[appt.status];
        const nextOptions = NEXT_STATUS[appt.status] || [];
        return (
          <li key={appt.id} className="folder-card appt-card" style={{ "--tab-color": status.color }}>
            <div className="modal-tab" style={{ background: status.color }} />
            <div className="appt-time">{formatTime(appt.start_time)}</div>
            <div className="appt-body">
              <div className="appt-header">
                <span className="appt-name">
                  {appt.first_name} {appt.last_name}
                </span>
                <span className="status-pill" style={{ color: status.color, borderColor: status.color }}>
                  {status.label}
                </span>
              </div>
              {appt.allergies && <div className="allergy-alert">⚠ Alergia: {appt.allergies}</div>}
              <div className="appt-meta">
                {appt.visit_type === "primera_vez" ? "Primera vez" : "Subsecuente"} · {appt.duration_minutes} min
                {appt.reason ? ` · ${appt.reason}` : ""}
              </div>
              {nextOptions.length > 0 && (
                <div className="appt-actions">
                  {nextOptions.map((s) => (
                    <button
                      key={s}
                      className="status-btn"
                      style={{ borderColor: STATUS[s].color, color: STATUS[s].color }}
                      onClick={() => onChangeStatus(appt.id, s)}
                    >
                      {STATUS[s].label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
