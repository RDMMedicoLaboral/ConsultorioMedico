# Agenda + Expediente Clínico + Receta Electrónica — MVP (Módulos 1, 2 y 3)

MVP funcional de tres módulos de la radiografía del ECE:

- **Módulo 1 — Agenda**: gestión de pacientes, creación de citas y flujo de
  estatus en tiempo real (Programada → Confirmada → En sala de espera →
  En consulta → Finalizada, con salidas a Cancelada / No asistió).
- **Módulo 2 — Expediente Clínico**: al dar clic en "Iniciar consulta" se
  abre la ficha del paciente con su historial cronológico a la izquierda y
  una nota de evolución nueva (formato **SOAP**) a la derecha, con IMC
  calculado automáticamente y buscador de diagnóstico tipo CIE-11.
- **Módulo 3 — Receta Electrónica**: desde el expediente, botón "Nueva
  receta" abre un formulario con buscador de medicamentos (vademécum),
  dosis/frecuencia/duración por medicamento, e indicaciones adicionales.
  Al generarla se crea un **PDF descargable con código QR** de validación,
  y un endpoint público para que una farmacia (u otro sistema) verifique
  la autenticidad de la receta escaneando el QR.

No incluye todavía: recordatorios por WhatsApp/SMS ni autenticación/roles
— son los siguientes módulos naturales a construir sobre esta base.

## Estructura

```
ece-agenda/
  backend/    API REST (Node.js + Express + SQLite + pdfkit + qrcode)
  frontend/   Interfaz web (React + Vite)
```

## Cómo correrlo

**1. Backend**
```bash
cd backend
npm install
npm run dev        # http://localhost:4000
```
Crea automáticamente `agenda.db` (SQLite) con todas las tablas la primera
vez que arranca, incluyendo `prescriptions`, `medications_catalog` y
`doctor_profile`.

**2. Frontend** (en otra terminal)
```bash
cd frontend
npm install
npm run dev         # http://localhost:5173
```
El frontend ya está configurado (`vite.config.js`) para redirigir `/api`
al backend en el puerto 4000.

**Primer uso**: antes de emitir tu primera receta, ve a "Perfil del
médico" en la barra lateral y llena tus datos (nombre, cédula,
consultorio) — esos datos son los que aparecen en el encabezado del PDF.

## Decisiones técnicas del MVP

- **SQLite en vez de PostgreSQL**: mismo modelo relacional recomendado en
  el documento, pero sin necesidad de levantar un servidor de base de
  datos aparte para probar el MVP. El esquema (`backend/src/db.js`) evita
  a propósito funciones específicas de SQLite para que migrar a Postgres
  sea prácticamente copiar los `CREATE TABLE`.
- **Buscador de diagnóstico (CIE-11)** y **vademécum de medicamentos**:
  ambos usan catálogos LOCALES de ejemplo (`cie11_catalog` y
  `medications_catalog` en `backend/src/db.js`), solo para demostrar el
  flujo de autocompletado. **Los códigos y presentaciones son
  ilustrativos, no oficiales ni exhaustivos.** Antes de usarlos en un
  entorno clínico real: para diagnósticos, conectar la API oficial de la
  OMS (ICD-11 API, https://icd.who.int/icdapi, requiere credenciales
  propias); para medicamentos, sustituir por un vademécum completo y
  vigente del regulador sanitario local o un proveedor comercial.
- **QR de validación**: apunta a
  `/api/prescriptions/verify/:token`, un endpoint público que confirma si
  la receta existe y es auténtica. Ahora mismo resuelve contra
  `localhost`, así que solo es verificable en la misma máquina/red del
  Codespace — para producción, ese endpoint debe vivir en un dominio
  público estable.
- **Bitácora de auditoría** (`audit_log`): ya registra quién (placeholder
  `"sistema"` hasta que exista login), qué acción, sobre qué entidad y
  cuándo — lista para conectarse a un usuario autenticado real.
- **Sin cifrado en reposo todavía**: SQLite no cifra por defecto. Antes de
  manejar pacientes reales, mover a PostgreSQL con cifrado a nivel de
  disco (o `pgcrypto` para campos sensibles) y servir todo por HTTPS.
- **Un solo doctor / sin login**: el modelo de citas no distingue médico
  todavía (por eso el "Perfil del médico" es una sola ficha global).
  Roles (Secretaria vs. Médico) y autenticación son el siguiente paso
  lógico antes de tocar datos clínicos reales.

## Siguientes pasos sugeridos

1. Autenticación + roles (Secretaria solo ve agenda/contacto; Médico ve todo).
2. Migrar de SQLite a PostgreSQL.
3. Conectar el buscador de diagnóstico a la API oficial de la OMS (ICD-11)
   y el vademécum a un catálogo de medicamentos vigente.
4. Recordatorios automáticos vía API de WhatsApp Business.
5. Firma digital real del médico en la receta (más allá del QR de
   validación de integridad de datos).


