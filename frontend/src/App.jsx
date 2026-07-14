import { useEffect, useState, useCallback } from "react";
import { api } from "./api.js";
import AgendaView from "./components/AgendaView.jsx";
import PatientModal from "./components/PatientModal.jsx";
import AppointmentModal from "./components/AppointmentModal.jsx";

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function shiftDate(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatHeaderDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const s = d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function App() {
  const [date, setDate] = useState(todayISO());
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [showApptModal, setShowApptModal] = useState(false);
  const [search, setSearch] = useState("");

  const loadPatients = useCallback(async () => {
    setPatients(await api.patients.list());
  }, []);

  const loadAppointments = useCallback(async (d) => {
    setLoading(true);
    try {
      setAppointments(await api.appointments.listByDate(d));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  useEffect(() => {
    loadAppointments(date);
  }, [date, loadAppointments]);

  async function handleStatusChange(id, status) {
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    try {
      await api.appointments.setStatus(id, status);
    } catch {
      loadAppointments(date);
    }
  }

  const filteredPatients = search
    ? patients.filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase()))
    : patients;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">Rx</span>
          <div>
            <div className="brand-name">Consultorio</div>
            <div className="brand-sub">Expediente &amp; Agenda</div>
          </div>
        </div>

        <button className="btn-primary full" onClick={() => setShowPatientModal(true)}>
          + Nuevo paciente
        </button>

        <input
          className="search-input"
          placeholder="Buscar paciente…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <ul className="patient-list">
          {filteredPatients.map((p) => (
            <li key={p.id}>
              <span>
                {p.first_name} {p.last_name}
              </span>
              {p.allergies && <span className="allergy-dot" title={`Alergia: ${p.allergies}`} />}
            </li>
          ))}
          {filteredPatients.length === 0 && <li className="hint">Sin resultados.</li>}
        </ul>
      </aside>

      <main className="main">
        <header className="agenda-header">
          <div className="date-nav">
            <button className="btn-ghost icon" onClick={() => setDate((d) => shiftDate(d, -1))}>
              ‹
            </button>
            <div className="date-label">
              <div className="date-title">{formatHeaderDate(date)}</div>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <button className="btn-ghost icon" onClick={() => setDate((d) => shiftDate(d, 1))}>
              ›
            </button>
            <button className="btn-ghost" onClick={() => setDate(todayISO())}>
              Hoy
            </button>
          </div>
          <button className="btn-primary" onClick={() => setShowApptModal(true)}>
            + Nueva cita
          </button>
        </header>

        <AgendaView appointments={appointments} loading={loading} onChangeStatus={handleStatusChange} />
      </main>

      {showPatientModal && (
        <PatientModal
          onClose={() => setShowPatientModal(false)}
          onCreated={() => {
            setShowPatientModal(false);
            loadPatients();
          }}
        />
      )}

      {showApptModal && (
        <AppointmentModal
          date={date}
          patients={patients}
          onClose={() => setShowApptModal(false)}
          onNewPatient={() => {
            setShowApptModal(false);
            setShowPatientModal(true);
          }}
          onCreated={() => {
            setShowApptModal(false);
            loadAppointments(date);
          }}
        />
      )}
    </div>
  );
}
