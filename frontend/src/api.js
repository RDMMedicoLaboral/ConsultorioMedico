const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  patients: {
    list: (q) => request(`/patients${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    get: (id) => request(`/patients/${id}`),
    create: (data) => request(`/patients`, { method: "POST", body: JSON.stringify(data) }),
  },
  appointments: {
    listByDate: (date) => request(`/appointments?date=${date}`),
    create: (data) => request(`/appointments`, { method: "POST", body: JSON.stringify(data) }),
    setStatus: (id, status) =>
      request(`/appointments/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  },
  consultations: {
    listByPatient: (patientId) => request(`/patients/${patientId}/consultations`),
    create: (data) => request(`/consultations`, { method: "POST", body: JSON.stringify(data) }),
  },
  cie11: {
    search: (q) => request(`/cie11?q=${encodeURIComponent(q)}`),
  },
  medications: {
    search: (q) => request(`/medications?q=${encodeURIComponent(q)}`),
  },
  doctorProfile: {
    get: () => request(`/doctor-profile`),
    update: (data) => request(`/doctor-profile`, { method: "PUT", body: JSON.stringify(data) }),
  },
  prescriptions: {
    listByPatient: (patientId) => request(`/prescriptions/patient/${patientId}`),
    create: (data) => request(`/prescriptions`, { method: "POST", body: JSON.stringify(data) }),
    pdfUrl: (id) => `${BASE}/prescriptions/${id}/pdf`,
  },
};
