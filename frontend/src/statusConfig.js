export const STATUS = {
  programada: { label: "Programada", color: "#8C8577" },
  confirmada: { label: "Confirmada", color: "#3D6B5C" },
  en_sala_espera: { label: "En sala de espera", color: "#C08A3E" },
  en_consulta: { label: "En consulta", color: "#2B5C8A" },
  finalizada: { label: "Finalizada", color: "#5B6B5F" },
  cancelada: { label: "Cancelada", color: "#9B3B3B" },
  no_asistio: { label: "No asistió", color: "#6B4A3D" },
};

// A qué estatus puede pasar una cita desde su estatus actual (flujo del
// documento: Programada -> Confirmada -> En sala de espera -> En consulta -> Finalizada,
// con salidas a Cancelada / No asistió desde los estados tempranos).
export const NEXT_STATUS = {
  programada: ["confirmada", "cancelada", "no_asistio"],
  confirmada: ["en_sala_espera", "cancelada", "no_asistio"],
  en_sala_espera: ["en_consulta", "no_asistio"],
  en_consulta: ["finalizada"],
  finalizada: [],
  cancelada: [],
  no_asistio: [],
};
