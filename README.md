# Agenda Inteligente — MVP (Módulo 1)

MVP funcional del **Módulo 1: Agenda** descrito en la radiografía del ECE:
gestión de pacientes, creación de citas y flujo de estatus en tiempo real
(Programada → Confirmada → En sala de espera → En consulta → Finalizada,
con salidas a Cancelada / No asistió).

No incluye todavía: recordatorios por WhatsApp/SMS, expediente clínico
(notas SOAP), receta electrónica, ni autenticación/roles — son los
siguientes módulos naturales a construir sobre esta base.

## Estructura

```
ece-agenda/
  backend/    API REST (Node.js + Express + SQLite)
  frontend/   Interfaz web (React + Vite)
```

## Cómo correrlo

**1. Backend**
```bash
cd backend
npm install
npm run dev        # http://localhost:4000
```
Crea automáticamente `agenda.db` (SQLite) con las tablas `patients`,
`appointments` y `audit_log` la primera vez que arranca.

**2. Frontend** (en otra terminal)
```bash
cd frontend
npm install
npm run dev         # http://localhost:5173
```
El frontend ya está configurado (`vite.config.js`) para redirigir `/api`
al backend en el puerto 4000.

Abre `http://localhost:5173`, registra un paciente y agenda su primera cita.

## Decisiones técnicas del MVP

- **SQLite en vez de PostgreSQL**: mismo modelo relacional recomendado en
  el documento, pero sin necesidad de levantar un servidor de base de
  datos aparte para probar el MVP. El esquema (`backend/src/db.js`) evita
  a propósito funciones específicas de SQLite para que migrar a Postgres
  sea prácticamente copiar los `CREATE TABLE`.
- **Bitácora de auditoría** (`audit_log`): ya registra quién (placeholder
  `"sistema"` hasta que exista login), qué acción, sobre qué entidad y
  cuándo — lista para conectarse a un usuario autenticado real.
- **Sin cifrado en reposo todavía**: SQLite no cifra por defecto. Antes de
  manejar pacientes reales, mover a PostgreSQL con cifrado a nivel de
  disco (o `pgcrypto` para campos sensibles) y servir todo por HTTPS.
- **Un solo doctor / sin login**: el modelo de citas no distingue médico
  todavía. Roles (Secretaria vs. Médico) y autenticación son el siguiente
  paso lógico antes de tocar datos clínicos reales.

## Siguientes pasos sugeridos

1. Autenticación + roles (Secretaria solo ve agenda/contacto; Médico ve todo).
2. Migrar de SQLite a PostgreSQL.
3. Módulo de Expediente Clínico (notas SOAP + buscador CIE-11).
4. Recordatorios automáticos vía API de WhatsApp Business.
5. Receta electrónica con PDF + código QR de validación.
