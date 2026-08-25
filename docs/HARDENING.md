# Operational Core Hardening

## Objetivo

Endurecer Operational Core para degradar de forma predecible ante fallas temporales de infraestructura, proteger datos locales pendientes y preparar una experiencia cliente recuperable en escenarios offline.

Reglas de la fase:

- No ampliar alcance funcional fuera de los bloques listados.
- Mantener separadas la sesion web Auth.js y la autenticacion externa `/api/v1`.
- No ocultar fallas de infraestructura como errores de credenciales o permisos.
- Proteger datos pendientes antes de cualquier reset o reconciliacion destructiva.
- Mantener auditoria y limites tenant como invariantes.

## Estado

Fecha de apertura: 2026-08-25.

| Bloque | Estado | Alcance |
| --- | --- | --- |
| Hardening 1A | PENDING | Cold start offline, PWA shell, `ownerKey`, restore de cache/sesion. |
| Hardening 1B | PENDING | Retry de lecturas Prisma, `DB_UNAVAILABLE`, `/health` vs `/ready`, auth resiliente a DB temporal. |
| Hardening 1C | PENDING | Telemetria de sync, scope por `ownerKey + contractId + entityTypeId`, push/refresh/reconcile, `lastSuccessfulSyncAt`. |
| Hardening 1D | PENDING | `SQLITE_UNAVAILABLE`, retry local, reset explicito, proteccion de pendientes. |
| Auth / Permissions | PENDING | Semantica MEMBER/ADMIN/PLATFORM_ADMIN y restricciones de administracion. |
| Pending | PENDING | Backup/restore, staging y restore drill. |

## Principios

### Identidad De Propiedad

`ownerKey` identifica el espacio local de datos del usuario/app/dispositivo. No reemplaza `contractId`, `entityTypeId`, `organizationId` ni los controles de autorizacion del servidor.

Todo cache local, cola de pendientes y telemetria de sincronizacion debe estar scoped por:

```text
ownerKey + contractId + entityTypeId
```

Cuando el alcance no incluya alguno de esos valores, la operacion no debe leer, mezclar, reconciliar ni borrar datos locales.

### Degradacion Recuperable

Una falla temporal de PostgreSQL o SQLite debe convertirse en estado recuperable, no en perdida de sesion, perdida de pendientes, reset implicito ni error ambiguo.

### Pending Primero

Los cambios locales pendientes tienen prioridad sobre limpieza, reset y reconciliacion. Antes de borrar cache, recrear SQLite o descartar una cola, debe existir una ruta explicita de backup o confirmacion irreversible.

## Hardening 1A

### Cold Start Offline

Objetivo: permitir que el cliente abra una experiencia minima cuando arranca sin red, siempre que exista cache local valida.

Criterios:

- El arranque offline no debe bloquearse esperando `/api/v1/context`.
- La app debe distinguir entre "no hay sesion restaurable", "hay sesion/cache local", y "servidor no disponible".
- El usuario debe poder ver datos cacheados scoped por `ownerKey + contractId + entityTypeId`.
- Las mutaciones offline deben entrar a una cola local de pendientes y no simular confirmacion remota.
- El estado visible debe indicar que la informacion puede estar desactualizada.

### PWA Shell

Objetivo: entregar un shell navegable y estable aun con red ausente o intermitente.

Criterios:

- Manifest y service worker configurados para cachear el shell de la app.
- Assets esenciales disponibles offline.
- Rutas de app muestran estado offline recuperable en vez de pantalla rota.
- El shell no cachea respuestas autenticadas entre `ownerKey` distintos.
- La estrategia de cache separa shell estatico, contexto autenticado y datos operacionales.

### ownerKey

Objetivo: tener una llave local estable para aislar cache, cola y telemetria por propietario real.

Criterios:

- `ownerKey` se deriva de identidad autenticada/app/dispositivo de forma estable.
- Cambiar de usuario, app cliente u organizacion no reutiliza cache anterior.
- Logout no destruye pendientes sin backup o confirmacion explicita.
- Los stores locales incluyen `ownerKey` como parte de su clave primaria o indice equivalente.

### Cache / Session Restore

Objetivo: restaurar sesion operacional local sin depender de un round-trip exitoso inicial.

Criterios:

- Se restaura ultimo contexto valido solo si coincide con `ownerKey`.
- Se conserva `lastSuccessfulSyncAt` para explicar frescura.
- Si el servidor vuelve, el cliente refresca contexto antes de permitir reconciliaciones.
- Si el servidor rechaza la sesion, se bloquean nuevas mutaciones y se conserva backup de pendientes.

## Hardening 1B

### Prisma Read Retry

Objetivo: absorber fallas transitorias de conexion en lecturas sin duplicar writes ni ocultar errores persistentes.

Criterios:

- Solo lecturas idempotentes pueden reintentarse automaticamente.
- Mutaciones, transacciones de escritura y operaciones con efectos laterales no se reintentan de forma implicita.
- El retry maximo inicial es una repeticion despues de una falla clasificada como transitoria.
- El codigo centraliza la clasificacion para errores Prisma/PostgreSQL de conexion, reset, timeout o pool cerrado.

### DB_UNAVAILABLE

Objetivo: exponer indisponibilidad de base como infraestructura, no como auth, permisos o validacion.

Criterios:

- `/api/v1` responde `503` con codigo estable `DB_UNAVAILABLE`.
- El envelope mantiene el contrato de error de la API externa.
- El frontend puede distinguir `DB_UNAVAILABLE` de `UNAUTHORIZED`, `FORBIDDEN` y errores de dominio.
- Logs internos pueden incluir diagnostico tecnico sin exponer secretos ni URLs completas.

### /health vs /ready

Objetivo: separar vida del proceso de disponibilidad operacional.

Criterios:

- `/api/v1/health` responde si el proceso HTTP esta vivo.
- `/api/v1/ready` verifica dependencias necesarias para operar, incluyendo PostgreSQL.
- Fallas de DB deben afectar readiness, no necesariamente health.
- Monitores y deploys deben usar el endpoint correcto segun intencion.

### Auth No Invalida Sesion Por DB Temporal

Objetivo: evitar que una falla temporal de DB destruya una sesion web valida.

Criterios:

- Un error transitorio al revalidar usuario/sesion se presenta como estado recuperable.
- No se ejecuta logout ni limpieza de cookies por fallas de infraestructura.
- Usuarios inactivos o credenciales invalidas siguen invalidando acceso de forma normal cuando la DB responde.
- La API externa tambien separa refresh-token invalido de `DB_UNAVAILABLE`.

## Hardening 1C

### Sync Telemetry

Objetivo: observar sincronizacion cliente-servidor sin inferir estado desde errores dispersos.

Criterios:

- Registrar inicio, exito, fallo y duracion de ciclos de sync.
- Registrar conteos de pendientes, enviados, aceptados, rechazados y reconciliados.
- Registrar `ownerKey`, `contractId` y `entityTypeId` como dimensiones logicas, sin datos sensibles.
- Distinguir fallas de red, DB remota, auth, validacion y conflictos de dominio.

### Scope ownerKey + contractId + entityTypeId

Objetivo: impedir mezcla de datos entre usuarios, contratos o entidades.

Criterios:

- Pull, push, refresh, reconcile, cache lookup y pending lookup usan el scope completo.
- Los indices locales deben permitir busquedas por scope sin escanear stores globales.
- El servidor nunca confia en scope enviado por cliente sin revalidar token, contrato, membresia y entidad.

### Push / Refresh / Reconcile

Objetivo: definir el ciclo canonico de sincronizacion.

Flujo esperado:

```text
restore local -> refresh server context -> push pending -> refresh records -> reconcile local state
```

Criterios:

- `push` envia pendientes idempotentes y preserva orden cuando el dominio lo requiera.
- `refresh` trae estado remoto autorizado y paginado o incremental.
- `reconcile` nunca elimina pendientes no confirmados.
- Conflictos de dominio quedan visibles y requieren resolucion explicita.
- Reintentos no duplican records ni auditoria.

### lastSuccessfulSyncAt

Objetivo: mantener una marca confiable de frescura por scope.

Criterios:

- Se actualiza solo despues de completar exitosamente el ciclo definido.
- Se guarda por `ownerKey + contractId + entityTypeId`.
- La UI puede mostrar datos cacheados con antiguedad conocida.
- Un fallo parcial no debe mover `lastSuccessfulSyncAt`.

## Hardening 1D

### SQLITE_UNAVAILABLE

Objetivo: tratar fallas del store local como estado recuperable y diagnosticable.

Criterios:

- El cliente distingue `SQLITE_UNAVAILABLE` de red, DB remota y auth.
- La app bloquea writes locales si SQLite no esta disponible.
- Pendientes ya persistidos no se consideran perdidos hasta ejecutar verificacion o restore.
- La telemetria incluye eventos de apertura, migracion, error y recuperacion del store local.

### Retry

Objetivo: reintentar operaciones locales seguras sin corromper estado.

Criterios:

- Lecturas locales pueden reintentarse cuando el error sea transitorio.
- Writes locales deben ser idempotentes o estar protegidos por transaccion local.
- Migraciones locales no deben repetirse parcialmente sin marca de version consistente.

### Reset Explicito

Objetivo: impedir reset local accidental.

Criterios:

- No hay reset automatico por error de apertura, migracion o schema.
- El reset requiere accion explicita del usuario o comando administrativo documentado.
- Antes del reset se intenta backup de stores criticos.
- El usuario ve que se perderan cache y/o pendientes no sincronizados.

### Proteccion De Pending

Objetivo: no perder mutaciones offline o aun no confirmadas.

Criterios:

- La cola pending se persiste antes de mostrar una mutacion como guardada localmente.
- Cada item pending tiene idempotency key estable.
- Los items enviados pero no confirmados sobreviven reinicios.
- Reset, logout, cambio de owner y migracion local deben preservar o exportar pending antes de limpiar.

## Auth / Permissions

Roles actuales:

- `MEMBER`: usuario operativo de una organizacion.
- `ADMIN`: administrador de una organizacion via `Membership.role`.
- `PLATFORM_ADMIN`: administrador global via `User.platformRole`.

Reglas:

- `MEMBER` opera records dentro de contratos autorizados.
- `MEMBER` puede ver auditoria operacional que pertenezca a su contrato autorizado.
- `MEMBER` no administra settings, schema, users ni apps.
- `ADMIN` administra contratos, entidades, campos, vistas, accesos y usuarios dentro de su organizacion.
- `ADMIN` no obtiene permisos globales de plataforma.
- `PLATFORM_ADMIN` administra organizaciones desde el area de plataforma.
- `PLATFORM_ADMIN` no debe saltarse automaticamente las reglas operativas de membresia contractual.

Criterios:

- Las rutas web de settings/schema/users/apps rechazan `MEMBER`.
- Las Server Actions de administracion revalidan rol `ADMIN` server-side.
- `/api/v1` revalida membresia, contrato activo y permisos por request.
- La auditoria visible para `MEMBER` no expone eventos de otras organizaciones o contratos.

## Pending

### Backup / Restore

Objetivo: poder recuperar estado local critico antes y despues de operaciones riesgosas.

Criterios:

- Backup incluye pending, metadata de sync, owner scope y version de schema local.
- Restore valida compatibilidad de owner/scope antes de importar.
- Restore no pisa pendientes existentes sin confirmacion explicita.
- Backups no incluyen secretos, tokens ni credenciales.

### Staging

Objetivo: practicar hardening contra un entorno no productivo con datos controlados.

Criterios:

- Entorno staging separado de produccion.
- Datos de prueba identificables y limpiables.
- Pruebas mutantes no usan datos productivos arbitrarios.
- Variables de entorno y secrets no se documentan con valores reales.

### Restore Drill

Objetivo: demostrar que backup/restore funciona antes de depender de el.

Criterios:

- Crear pendientes offline identificables.
- Ejecutar backup.
- Simular reset o store local indisponible en entorno seguro.
- Restaurar backup.
- Confirmar que pendientes se conservan y pueden sincronizarse una sola vez.
- Registrar evidencia, fecha y resultado del drill.

## Required Checks

Antes de cerrar cambios de codigo relevantes para este documento:

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
git diff --check
```

Si un bloque cambia contrato externo bajo `/api/v1`, actualizar `docs/EXTERNAL_API.md` en el mismo cambio.
