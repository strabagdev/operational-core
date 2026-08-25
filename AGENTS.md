<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project

- Nombre: Opco / operational-core.
- Stack: Next.js, TypeScript, Prisma, PostgreSQL.
- Organizations y Contracts viven centralmente en Opco.
- `/api/v1` es la API externa.
- Auth web y auth API externa son mecanismos separados.
- `ExternalApp` identifica una app cliente, no una experiencia ni `AppView`.

# AppViews

- Tipos: `RECORDS`, `WORKFLOW`, `BOARD`, `DASHBOARD`.
- `WORKFLOW` selecciona comportamiento concreto con `config.workflowKey`.
- No crear `AppViewType` específicos como `ATTENDANCE`, `INSPECTION`, etc.
- Los workflows concretos deben resolverse mediante catálogo/registry.

# Entities

- `EntityNature`: `MASTER`, `TRANSACTION`, `REFERENCE`.
- `nature` es metadata semántica; no debe cambiar persistencia genérica ni comportamiento de `RELATION`.
- `RELATION` persiste `targetRecordId` mediante `EntityRelation`.
- UX de relaciones usa `targetRecord.displayName`; no mostrar IDs técnicos como valor normal.
- `displayName` sigue el primary configurado.
- `DATE` es sin timezone.
- `TIME` canónico: `HH:mm`.

# Attendance

- `workflowKey = attendance`.
- Source/target `EntityType` son configurables.
- Roles de fields configurados por IDs.
- `defaultCheckInOptionId` identifica la opción principal de checking.
- Estados de asistencia son las `FieldOption` activas de `statusFieldId`.
- API usa `statusOptionId` + labels; `FieldOption.value` puede ser distinto y es lo persistido.
- Opciones extra permitidas sin cambios de código.
- Una asistencia por Persona+Fecha a nivel de dominio.
- Cambio de status existente devuelve `CONFLICT`; `overwrite` explícito requerido.
- Mantener auditoría.

# Development

- Leer `docs/ARCHITECTURE.md` antes de cambios arquitectónicos.
- Leer `docs/EXTERNAL_API.md` antes de tocar `/api/v1`.
- Leer `docs/HARDENING.md` antes de cambiar offline, sync, resiliencia Prisma, recuperacion de storage, hardening de auth u operational readiness.
- Leer `docs/OPERATIONS.md` antes de trabajo productivo de DB, deploy o recovery.
- Mantener docs sincronizados cuando cambie contrato.
- No usar Playwright salvo solicitud explícita.
- Preferir verificación productiva read-only.
- Datos temporales de prueba deben identificarse y limpiarse.
- No modificar datos productivos arbitrariamente.
- Nunca hacer restore sobre production desde flujos automaticos o de desarrollo.
- Migraciones productivas usan `prisma migrate deploy`.
- No asumir exito de backup sin verificacion de restore.
- No commit/push salvo solicitud explícita.
- No force push / rebase / squash salvo instrucción explícita.

# Security

Nunca incluir:

- `.env`
- secretos
- tokens
- dumps DB
- logs temporales
- exports productivos
- `node_modules`
- `.next`
- artefactos generados innecesarios

# Required Checks

Antes de terminar cambios relevantes ejecutar:

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
git diff --check
```

No inventar comandos alternativos si estos existen en el repo.
