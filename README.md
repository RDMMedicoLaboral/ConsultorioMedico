# Agenda + Expediente Clínico — MVP (Módulos 1 y 2)

MVP funcional de dos módulos de la radiografía del ECE:

- **Módulo 1 — Agenda**: gestión de pacientes, creación de citas y flujo de
  estatus en tiempo real (Programada → Confirmada → En sala de espera →
  En consulta → Finalizada, con salidas a Cancelada / No asistió).
- **Módulo 2 — Expediente Clínico**: al dar clic en "Iniciar consulta" se
  abre la ficha del paciente con su historial cronológico a la izquierda y
  una nota de evolución nueva (formato **SOAP**) a la derecha, con IMC
  calculado automáticamente y buscador de diagnóstico tipo CIE-11.

No incluye todavía: recordatorios por WhatsApp/SMS, receta electrónica con
QR, ni autenticación/roles — son los siguientes módulos naturales a
construir sobre esta base.

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
`appointments`, `consultations`, `cie11_catalog` y `audit_log` la primera
vez que arranca.

**2. Frontend** (en otra terminal)
```bash
cd frontend
npm install
npm run dev         # http://localhost:5173
```
El frontend ya está configurado (`vite.config.js`) para redirigir `/api`
al backend en el puerto 4000.

Abre `http://localhost:5173`, registra un paciente, agenda su primera
cita y luego da clic en "Iniciar consulta" para abrir su expediente y
guardar una nota SOAP.

## Decisiones técnicas del MVP

- **SQLite en vez de PostgreSQL**: mismo modelo relacional recomendado en
  el documento, pero sin necesidad de levantar un servidor de base de
  datos aparte para probar el MVP. El esquema (`backend/src/db.js`) evita
  a propósito funciones específicas de SQLite para que migrar a Postgres
  sea prácticamente copiar los `CREATE TABLE`.
- **Buscador de diagnóstico (CIE-11)**: por ahora usa un catálogo LOCAL de
  ~20 diagnósticos comunes, solo para demostrar el flujo de
  autocompletado (tabla `cie11_catalog` en `backend/src/db.js`). **Los
  códigos son ilustrativos, no oficiales.** Antes de usarlo en un
  entorno clínico real, hay que sustituirlo por la API oficial de la OMS
  (ICD-11 API: https://icd.who.int/icdapi), que requiere credenciales
  propias y devuelve el catálogo vigente y completo.
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
3. Conectar el buscador de diagnóstico a la API oficial de la OMS (ICD-11).
4. Recordatorios automáticos vía API de WhatsApp Business.
5. Receta electrónica con PDF + código QR de validación (usa el
   `diagnosis_label`/`plan` de la última consulta como base).

