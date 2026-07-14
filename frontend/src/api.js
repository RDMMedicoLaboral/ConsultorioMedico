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
    create: (data) => request(`/patients`, { method: "POST", body: JSON.stringify(data) }),
  },
  appointments: {
    listByDate: (date) => request(`/appointments?date=${date}`),
    create: (data) => request(`/appointments`, { method: "POST", body: JSON.stringify(data) }),
    setStatus: (id, status) =>
      request(`/appointments/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  },
};
