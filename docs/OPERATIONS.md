# Operational Core Operations

## Estado De Infraestructura

| Area | Estado | Evidencia | Pendiente |
| --- | --- | --- | --- |
| Railway config | MISSING | No hay `railway.json`, `railway.toml` ni config Railway versionada en el repo. | Verificar servicios, variables, deploys y backups en dashboard Railway. |
| PostgreSQL | VERIFIED | Prisma usa `env("DATABASE_URL")`; docs de desarrollo indican PostgreSQL/Railway por `DATABASE_URL`. | Confirmar base production/staging real fuera del repo sin imprimir credenciales. |
| Scripts DB | DOCUMENTED | `scripts/db-backup.sh`, `scripts/db-restore.sh`, `scripts/db-verify-restore.sh`. | Ejecutar solo contra development/staging seguro. |
| Prisma migrations | VERIFIED | `prisma/migrations` contiene historial SQL y `migration_lock.toml`. | Revisar cada migration antes de production deploy. |
| Health/readiness | VERIFIED | `/api/v1/health` no consulta DB; `/api/v1/ready` ejecuta check Prisma. | Monitores externos deben apuntar al endpoint correcto. |
| Staging real | UNKNOWN | No hay config staging versionada ni CI/CD en el repo. | Crear servicio app y PostgreSQL staging separados o verificar si ya existen fuera del repo. |
| Backups verificables | UNKNOWN | No hay evidencia local de jobs, snapshots o restore drills. | Configurar almacenamiento externo aprobado y ejecutar restore drill. |
| CI/CD | MISSING | No hay `.github` ni workflow versionado detectado. | Documentar pipeline real si existe fuera del repo. |

No asumir capacidades de Railway que no esten verificadas desde config accesible o dashboard operativo. Las filas `UNKNOWN` no estan resueltas.

## Backup PostgreSQL

Estrategia recomendada inicial:

- Backup logico con `pg_dump --format=custom`.
- Incluir schema, data, constraints, indexes y tablas administradas por Prisma.
- No guardar dumps dentro del repo.
- No imprimir `DATABASE_URL`.
- Generar checksum SHA-256 junto al dump.
- No comprimir nuevamente el formato custom de `pg_dump`.

Naming:

```text
opco-<environment>-YYYYMMDD-HHMMSS.dump
```

Comando:

```bash
DATABASE_URL="$DATABASE_URL" OPCO_ENV=staging scripts/db-backup.sh --output-dir /secure/off-repo/backups
```

Evidencia minima de backup:

- path del dump fuera del repo;
- tamano en bytes;
- archivo `.sha256`;
- fecha UTC;
- ambiente declarado;
- resultado posterior de restore drill.

Un backup sin restore probado es solo un artefacto, no una garantia operativa.

## Restore Staging

Nunca hacer restore sobre production desde flujos automaticos o de desarrollo.

Requisitos:

- Base destino vacia o staging dedicada.
- `ALLOW_DB_RESTORE=true`.
- `OPCO_ENV=staging` o `OPCO_ENV=development`.
- `CONFIRM_RESTORE_TARGET` igual a `OPCO_ENV`.
- Dump en formato custom creado por `pg_dump`.

Comando:

```bash
ALLOW_DB_RESTORE=true \
OPCO_ENV=staging \
CONFIRM_RESTORE_TARGET=staging \
DATABASE_URL="$STAGING_DATABASE_URL" \
scripts/db-restore.sh /secure/off-repo/backups/opco-staging-YYYYMMDD-HHMMSS.dump
```

El script aborta si `OPCO_ENV=production`. Despues del restore, ejecutar verificacion:

```bash
DATABASE_URL="$STAGING_DATABASE_URL" scripts/db-verify-restore.sh
```

## Restore Drill

Objetivo: demostrar que un backup sirve antes de depender de el.

Procedimiento:

1. Crear o seleccionar una DB segura de staging/test.
2. Ejecutar `scripts/db-backup.sh` contra esa DB.
3. Guardar checksum y tamano.
4. Crear una DB destino vacia y dedicada.
5. Ejecutar `scripts/db-restore.sh` contra la DB destino.
6. Ejecutar `scripts/db-verify-restore.sh`.
7. Ejecutar `npx prisma validate`.
8. Levantar la app apuntando a la DB restaurada.
9. Probar `/api/v1/health`.
10. Probar `/api/v1/ready`.
11. Probar login con usuario seguro de staging.
12. Probar lectura de EntityTypes y Records autorizados.
13. Destruir la DB temporal.

Evidencia de cierre:

- dump creado;
- checksum SHA-256;
- tiempo de backup;
- tiempo de restore;
- salida de `db-verify-restore.sh`;
- readiness `ready`;
- smoke test de login y lectura;
- confirmacion de cleanup.

Estado actual: PENDING EXTERNAL INFRA. No hay DB segura verificada en el repo para ejecutar el drill real.

## Deploy Y Migraciones

Flujo production recomendado:

```text
working tree limpio
-> checks verdes
-> backup reciente confirmado
-> migrations revisadas
-> staging green
-> deploy codigo
-> npx prisma migrate deploy
-> /api/v1/health
-> /api/v1/ready
-> smoke tests
-> logs
-> decision rollback/continue
```

Produccion usa:

```bash
npx prisma migrate deploy
```

No usar en produccion:

```bash
npx prisma migrate dev
```

Auditoria actual de migrations:

| Tipo | Estado | Evidencia |
| --- | --- | --- |
| Historial Prisma | VERIFIED | Migrations SQL bajo `prisma/migrations`. |
| Data migrations | VERIFIED | Hay `UPDATE` en `external_app_client_id`, `app_view_workflow_key`, `attendance_status_option_ids` y `attendance_default_check_in_option`. |
| Destructiva historica | VERIFIED | `20260810171000_remove_entity_record_status` hace `DROP INDEX`, `DROP COLUMN` y `DROP TYPE`. |
| Reescritura historica | REQUIRED NOT TO DO | No reescribir migrations ya aplicadas. |

Antes de deploy productivo, revisar cualquier nueva migration buscando `DROP`, `DELETE`, `TRUNCATE`, backfills, defaults y cambios `NOT NULL`.

## Rollback Operacional

Separar rollback de codigo y rollback de base.

Code rollback:

- Redeploy del commit anterior compatible.
- Confirmar que el schema actual sigue siendo compatible con ese commit.
- Probar `/api/v1/health`, `/api/v1/ready`, login y lecturas principales.

Database rollback:

- No revertir migrations automaticamente.
- Preferir forward fix cuando el sistema pueda operar.
- Restore de DB solo para incidente grave, con decision explicita y bajo procedimiento.
- No hacer restore sobre production sin autorizacion operativa y evidencia de backup valido.

Riesgo clave: un rollback de codigo puede ser incompatible con un schema ya migrado.

## PWA / Client Rollback

`opco-client` debe tratar su service worker como versionado.

En rollback:

- Publicar un build con nueva version de cache.
- No reutilizar service worker stale.
- No borrar SQLite ni pending automaticamente.
- Confirmar que `EXPO_PUBLIC_OPCO_API_URL` apunta al ambiente correcto.
- Usar `clientId` staging para staging.
- Nunca poner una UI staging delante de una DB production.

No se modifica `opco-client` en esta fase.

## Incident Runbook

### DB Unavailable

1. Confirmar `/api/v1/health`.
2. Confirmar `/api/v1/ready`.
3. Si health OK y ready 503, tratar como dependencia DB.
4. Revisar logs de app sin imprimir secrets.
5. Revisar estado PostgreSQL en proveedor externo.
6. No limpiar sesiones ni forzar logout por indisponibilidad temporal.
7. Comunicar estado degradado y ETA si existe.

### /ready 503

`/api/v1/ready` valida PostgreSQL. Un 503 con `status=not_ready` indica que la app vive pero no esta operacionalmente lista.

Acciones:

- revisar conectividad DB;
- revisar pool/conexiones;
- revisar migraciones pendientes o fallidas;
- evitar deploys adicionales hasta entender causa.

### Backup Manual

1. Confirmar ambiente destino.
2. Ejecutar backup fuera del repo.
3. Guardar checksum.
4. Registrar hora UTC, operador y ambiente.
5. Planificar restore drill si el backup sera usado como garantia.

### Restore Staging

1. Confirmar que la DB destino no es production.
2. Ejecutar `scripts/db-restore.sh` con safeguards.
3. Ejecutar `scripts/db-verify-restore.sh`.
4. Levantar app contra DB restaurada.
5. Ejecutar smoke tests.
6. Destruir recursos temporales si eran de drill.

### Deploy Migration

1. Backup reciente confirmado.
2. Revisar migration SQL.
3. Deploy codigo.
4. Ejecutar `npx prisma migrate deploy`.
5. Confirmar `/api/v1/health`.
6. Confirmar `/api/v1/ready`.
7. Ejecutar smoke test post-deploy.
8. Revisar logs.

### Rollback

1. Determinar si el incidente es codigo, DB o integracion.
2. Para codigo, redeploy commit anterior compatible.
3. Para DB, preferir forward fix.
4. Restore solo como incidente grave y nunca automatico.
5. Confirmar readiness y smoke tests despues de cualquier cambio.

### PWA Stale

1. Confirmar version de build y service worker.
2. Publicar build con nueva cache version.
3. Pedir refresh controlado si corresponde.
4. No borrar SQLite/pending automaticamente.

### Sync Diagnostics

1. Identificar `ownerKey`, `contractId` y `entityTypeId`.
2. Revisar `lastSuccessfulSyncAt`.
3. Contar pending, enviados, aceptados, rechazados y conflictos.
4. Distinguir red, auth, DB remota, validacion y conflicto de dominio.
5. No reconciliar destructivamente pending no confirmado.

### SQLite Unavailable

1. Bloquear writes locales.
2. Mostrar estado recuperable.
3. Intentar retry seguro.
4. Intentar backup/export de pending antes de reset.
5. Reset solo explicito.

### Escalation Checklist

- Ambiente afectado.
- Ultimo deploy o migration.
- Resultado de `/health`.
- Resultado de `/ready`.
- Logs relevantes sin secretos.
- Backup mas reciente y si tiene restore drill.
- RPO/RTO objetivo y brecha estimada.
- Decision: wait, forward fix, code rollback o restore.

## Smoke Test Post-Deploy

Minimo:

- `/api/v1/health` responde 200.
- `/api/v1/ready` responde ready.
- Login web seguro funciona.
- `/app` carga contratos autorizados.
- `/api/v1/auth/login` funciona con app/usuario de staging o production controlado.
- `/api/v1/context` responde contexto autorizado.
- Listar entidades.
- Listar records de una entidad conocida.
- Crear/editar solo si el ambiente es staging o hay autorizacion explicita.

## RPO / RTO

Politica inicial recomendada, no cumplimiento verificado:

- RPO objetivo: <= 24h.
- RTO objetivo: <= 2h.

No afirmar cumplimiento hasta ejecutar restore drill real y medir tiempos.

Retencion recomendada inicial:

- diarios: 7 dias;
- semanales: 4 semanas;
- mensuales: 3 meses.

No implementar almacenamiento externo sin infraestructura aprobada.
