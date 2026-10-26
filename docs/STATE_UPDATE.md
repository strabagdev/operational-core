# State Update

`state-update` is the official workflow primitive for updating operational state in a configurable target `EntityType`. It supports a source subject record, one or more state fields, optional extra fields, optional date semantics, uniqueness rules, append history, current-record updates, conflicts, audit, and offline-safe idempotency.

## Config

State-update AppViews use `type = WORKFLOW` and `workflowKey = state-update`. The config references only records and fields owned by the same contract:

- `sourceEntityTypeId`: subject entity.
- `targetEntityTypeId`: entity where events/current state are persisted.
- `subjectFieldId`: target `RELATION` field pointing to the source entity.
- `stateFields`: one or more compatible target fields with `required` metadata. Supported state field types are `SELECT`, `TEXT`, numeric fields (`INTEGER`, `DECIMAL`, `MONEY`), `DATE`, and `BOOLEAN`. `defaultOptionId` is only valid for `SELECT`.
- `extraFieldIds`: supported target fields captured with the state update.
- `dateFieldId`: optional target `DATE` field.
- `uniqueness.mode`: `none`, `subject`, or `subject-date`.
- `historyMode`: `append` or `update-current`.

`attendance` remains a compatibility preset. Its AppView keeps `workflowKey = attendance`, while the backend maps Persona, Fecha, Estado, and Observacion into this engine with `subject-date` uniqueness and `update-current` history.

## Operational Diagnostics

Workflow endpoints echo sanitized `X-Opco-Request-Id` values and expose `Server-Timing` for browser diagnostics. `POST /workflow/state-update` reports route, auth/body/engine/serialization phases plus engine timing marks; `GET /workflow/state-update` and Attendance workflow GET/POST expose route-level timing. Timing logs fingerprint contract/appView scope and never include payloads, tokens, names, full IDs, or form values.

## Online/Offline Contract

Clients POST this wire format:

```json
{
  "clientRequestId": "stable-device-request-id",
  "subjectRecordId": "source_record_id",
  "date": "2026-08-22",
  "states": {
    "select_state_field_id": "field_option_id",
    "text_state_field_id": "R2",
    "numeric_state_field_id": 12,
    "date_state_field_id": "2026-08-22",
    "boolean_state_field_id": true
  },
  "extraValues": {
    "extra_field_id": "value"
  },
  "overwrite": false,
  "expectedUpdatedAt": "2026-08-22T12:00:00.000Z"
}
```

Offline clients must keep one stable `clientRequestId` per intended command. A retry with the same semantic payload returns the same stored response. A reused key with a different semantic payload is rejected with `IDEMPOTENCY_KEY_REUSED`.

## Exact Intention

The state-update intention includes:

- ExternalApp, authenticated user, contract, AppView, and workflow operation scope.
- `subjectRecordId`.
- `date`, when configured.
- `states`, sorted by field id.
- `extraValues`, sorted by field id.
- `overwrite`.
- `expectedUpdatedAt`, when present.

Omitted extra fields are preserved and are not compared as requested nulls. Explicit `null` means clear the value when validation allows it. Empty string, `false`, `0`, and `null` remain distinct. JSON key order is not meaningful.

## History Modes

`append` always creates a new target record for a new idempotency key. Retrying the same key and payload replays the original event; it must not create a second record or audit event.

`update-current` finds the current target by configured uniqueness. For `subject-date`, the current record is the record matching both subject and date. It never silently overwrites a differing current record.

## Visible Workflow Current Selection

For generic workflow GET `subjects[].current`, `uniqueness.mode = subject` with a configured
`dateFieldId` selects the record with the greatest non-null value of that configured DATE field.
It follows the existing latest-event criterion: date descending, record id ascending on equal dates;
records missing that date are excluded. If none has a date, current is null. Revision numbers,
createdAt and updatedAt do not select this visible current. updatedAt remains the remote version.

This selection is explicitly requested by the workflow GET. The default lookup used for mutations,
uniqueness/conflict checks and the STATE_UPDATE CURRENT report projection is unchanged. Subject-date
scopes (including Attendance) and workflows without a configured date retain their existing lookup.
The distinction is deliberate in this narrow correction; it does not redefine mutation targets or REPORT.

2026-10-04 validation: three new selection regressions failed before the correction. Five regressions
now cover newer date versus later modification/revision, date ties, missing dates, no-date compatibility
and unchanged update-current conflict target. The focused workflow/Attendance/api-reports run passed
71 tests; typecheck and lint passed. Local Core/PostgreSQL returned R1 dated October 4 as current and
first latest ahead of R99 dated October 3 with later updatedAt. Client Chrome 154, an exclusive profile,
real Expo SQLite OPFS and a prepared shell verified R1 on first offline opening/search and after full
browser close/reopen with both local services stopped. This exercises the active October 4 date, not
all historical offline scopes or mutations. Production Error finalizing statement remains unexplained.
Fixture/profiles/processes cleaned; client STATUS and OFFLINE_FIRST_AUDIT hold full provenance/limits.

Technical closeout 2026-10-04: the unchanged implementation and regression blobs are
`864f4cd0f41bd9171b6c525733a207159a7e6095` and `2ff9572ccc3e219f5ff75c8e77ec5474e7dc5b14`.
Full `npm run test`: 111 files passed, 2 skipped; 1112 tests passed, 16 skipped. The skipped files
are opt-in PostgreSQL integration suites for record PATCH and PANEL; their flags were not enabled
and no new fixtures were created. `npm run build` passed compilation, TypeScript and 20 static pages.
Prior standalone typecheck/lint and browser evidence are reused against identical source/test content.
No additional runtime change or browser run. Build outputs remain ignored and excluded from the lot;
no deploy occurred. Exact publication scopes and unrelated Client pending work are in Client STATUS.

## Conflicts

Without overwrite, an existing current record produces:

- `UNCHANGED` only when every requested state and every requested extra value match after normalization.
- `CONFLICT` when any requested state or requested extra value differs.

For state fields, a missing, `null`, or blank current value is treated as no state yet and the first requested valid value is accepted. For `SELECT`, a non-blank current value that cannot be resolved to an active option remains conservative and produces `CONFLICT` instead of silently replacing potentially corrupt or legacy data.

Conflict differences use this conceptual shape:

```json
{
  "fieldId": "field_id",
  "kind": "state",
  "currentValue": "current_option_id",
  "requestedValue": "requested_option_id"
}
```

For state fields, responses also keep option id/label fields for compatibility. Relation extras compare target record ids, not display names. Select extras compare canonical option values. Date and time extras compare canonical date/time values.

Conflict responses may include `conflictReason`, currently `CURRENT_VALUE_DIFFERS` or `EXPECTED_UPDATED_AT_MISMATCH`, as additive diagnostic metadata.

## Overwrite

Overwrite requires `overwrite: true` and an `expectedUpdatedAt` equal to the current record version. If the current record changed since the client saw the conflict, the engine returns a fresh `CONFLICT` and does not write. Accepted overwrite updates only submitted states and submitted extra fields; omitted extras are preserved.

A conflict response and its resolution are different semantic commands. Retrying the original conflict probe uses the original `clientRequestId`; confirming overwrite must use a new `clientRequestId`. Reusing the original key with `overwrite: true` or any other changed payload returns `IDEMPOTENCY_KEY_REUSED`. A new key for the overwrite is valid and is not blocked by the earlier persisted `CONFLICT`.

## Idempotency

`ApiIdempotencyKey` has a unique key on:

```text
externalAppId + operation + clientRequestId
```

For state-update, `operation` includes contract, AppView, and adapter. The database unique key is still scoped to `ExternalApp + operation + clientRequestId`, so clients should treat `clientRequestId` as unique per ExternalApp operation. The request fingerprint also includes the authenticated user, so the same database key cannot be replayed across users; a different user with the same key receives `IDEMPOTENCY_KEY_REUSED`.

New requests reserve the key before mutation. Successful handling stores a minimal durable response, affected `entityRecordId` when available, and `completedAt`. Replays with the same fingerprint return that stored response and do not run engine writes or audit again. Replays with a different fingerprint return `IDEMPOTENCY_KEY_REUSED`.

`CREATED` and `UPDATED` persist the idempotency response inside the same transaction as `EntityRecord`, values, relations, audit event, and audit changes. `UNCHANGED`, `CONFLICT`, and functional `ERROR` results are also persisted for deterministic replay even though they do not mutate records. The stored response is minimal: AppView identity and the result object. It does not store the original request payload; conflict details store normalized differences needed by the API response.

Rows created by older code may not have a durable response. They are not guessed or re-executed as a replay; callers receive `IDEMPOTENCY_RESULT_UNAVAILABLE`.

If a process stops after reserving a key but before completing a response, retries wait briefly for a concurrent request to finish. If no durable response appears, the retry returns `IDEMPOTENCY_RESULT_UNAVAILABLE` and does not rerun the mutation. This avoids duplicate records and duplicate audit. Manual recovery can inspect the key and related records, but runtime never invents a response or deletes historical keys.

If a stored `responseBody` has an unknown shape, unknown result, missing `recordId`, or invalid `updatedAt`, replay fails with `IDEMPOTENCY_RESULT_UNAVAILABLE` and does not execute a new write.

## UpdatedAt

`CREATED`, `UPDATED`, and `UNCHANGED` include the real persisted remote `updatedAt`.

- `CREATED`: timestamp from the inserted `EntityRecord`.
- `UPDATED`: timestamp from the updated `EntityRecord`.
- `UNCHANGED`: current timestamp already persisted on the existing record, without a write.
- Replay: original stored timestamp.
- `CONFLICT`: current `existing.updatedAt`.

## Official Invariants

1. Same `clientRequestId` plus same semantic payload returns the same result.
2. Same `clientRequestId` plus a different semantic payload is rejected.
3. Append retries do not duplicate records.
4. `extraValues` are part of the intention.
5. Omitted fields are preserved.
6. Explicit `null` clears when valid.
7. No overwrite occurs without explicit confirmation and matching `expectedUpdatedAt`.
8. `updatedAt` comes from PostgreSQL/Prisma.
9. Attendance uses the same state-update engine semantics.
10. Audit occurs once per effective mutation.

## Deployment

The state-update idempotency migration is additive: it adds nullable `responseBody` and `completedAt` columns plus an index. Existing code can run against the new schema. New code requires the migration first because it reads and writes the new columns.

Recommended order:

1. Run a backup following `docs/OPERATIONS.md`.
2. Apply migrations with `prisma migrate deploy`.
3. Deploy the application code.
4. Verify `/api/v1/ready`.
5. Smoke test idempotency: same key/same payload replays, same key/different payload returns `IDEMPOTENCY_KEY_REUSED`, append retry does not duplicate records.


## Composite report identity — stage 1, LOCAL ONLY — 2026-10-18

Implemented `uniqueness.mode="subject-date-fields"` only with `historyMode="update-current"`.
The editor chooses one or more active simple SELECT fields, distinct from subject/date/state/extra
roles. Identity is required independently of generic field.required. No append conversion, schedule
calculation, deletion workflow or adoption of populated target entities is implemented. Existing modes
and Attendance remain unchanged.

`registerCompositeDefinition` locks the target EntityType and registers immutable field roles only
on an empty target without previous workflows. AppViews sharing that target must reuse exactly the
same definition. Definition version1 and stable FieldOption IDs form identity; EntityValue content
still uses FieldOption.value through existing validation. Labels do not identify reports. Inactive
identity options remain readable for existing reports; new combinations cannot use them.

Additive migration `20261018000100_state_update_composite_identity`: two tables,
StateUpdateIdentityDefinition (one governing definition per target), StateUpdateIdentitySlot
(canonical subject/date/context tuple, hash, unique reservation, nullable reference to existing
EntityRecord). No duplicate content, audit, idempotency or event tables. The full tuple is checked
alongside SHA256; a collision is rejected. Row locking plus existing transactional audit/idempotency
protect concurrent creation/replacement across AppViews. Slot/record/content/audit/idempotent outcome
commit together. SQL DATE uses a literal date cast, avoiding session-timezone truncation.

Database guards block generic EntityRecord/Value/Relation writes and deletion only for governed
targets unless the composite workflow transaction has claimed its identity. This includes generic API,
RECORDS, web edits/deletion, imports and bulk paths. Identity-field semantic changes and option value
changes/deletion are blocked; labels may change. Shared EntityType locks fence opt-in activation
against in-flight legacy writes without serializing unrelated legacy writers exclusively. A governed
report cannot currently be moved or deleted; deletion support is deferred, not simulated with an
annulled state. Contract/entity deletion is also constrained while the governing definition exists.

GET requires explicit logical DATE and complete identity to read reports. Without identity it returns
configuration metadata/contextRequired and no guessed current. With identity it returns one
subjects[].reports[] entry per requested subject (current can be explicit null), plus latest/summary
for that context. POST validates the full identity before creating an idempotency key or content;
old callers cannot create incomplete reports. POST echoes identity. New-mode conflicts include full
configured remote stateValues/extraValues and exact updatedAt in addition to differences, enabling
Client's existing Use Opco restoration without inventing missing values. Legacy conflict DTOs remain
unchanged. Reusing a request key with another context/content is rejected.

Local evidence: .env.local DATABASE_URL explicitly validated as 127.0.0.1:5432/opco_development,
role opco_dev and passed to child processes. The one new local migration was applied and its own
guard functions refined during development. After cleaning its fixtures, only that own empty experimental
migration was reapplied from the final SQL:23 applied/zero failed, final checksum verified and digest
of all22 previous migration entries unchanged. No production or old migration content changes.
Nine integration cases use real PostgreSQL and actual editor/configuration/workflow/generic writer
functions: invalid combinations, missing identity, concurrent creation, separate contexts/shared
AppViews, discarded-response replay, exact stale-version conflict, protected generic writes/deletion,
rollback/option immutability, concurrent idempotent replay and controlled generic API rejection.
Existing focused workflow/Attendance/editor/API-write tests also run. No full suite or production test.

Chrome/OPFS evidence is documented in Client docs/STATE_UPDATE.md (same stage): explicit preparation,
creation/edit offline, durable confirmation after full browser reopen, real HTTP ACK on one remote
row, later remote change retained as conflict and exact-context restoration. The published Client
serializer at 1b4bdaab92d120dc42198256a3b65a8aa53e04a3 was exercised against local HTTP Core:
it omits identity and gets 400 COMPOSITE_IDENTITY_REQUIRED without a write. This is a server write
fence, not proof of full old/new Client coexistence or preservation of delivery status by old code.
SQLite v10/epoch2 stays unchanged. V11 paused; historical production incidents remain uncorrelated.


Stage validation:200 focused tests across workflow/Attendance/editor/generic API writers, including
nine real PostgreSQL integration cases, maxWorkers2. Those nine rerun after clean final migration
application and fixture cleanup. Core typecheck, full lint (zero warnings) and diff-check pass.
Client264 focused tests, typecheck/lint/diff-check pass (two lint warnings already in Client HEAD).
Full workflow browser bundle entry-4fa1cfed7a91b8872d4bf9f7dba0fd41.js retains epoch2. Context switching
isolates conflicts, unverified null cannot create offline, explicit preparation enables a verified-null
creation, and syncing another context preserves the original conflict. No full suite, deploy or
production evidence. Own fixtures/profile/processes removed; unrelated local record identity/version
digest preserved. See Client's stage inventory for exact source/documentation hunks and limits.


Final role validation: a real-editor regression first failed because the new mode allowed its DATE
identity field as an editable state. Stage1 now rejects subject/date as state roles in both editor
and runtime, so content cannot override the reserved tuple. Legacy workflows (including date among
Versionado state fields) are unchanged. The same nine PostgreSQL cases, legacy affected tests,
typecheck/lint/diff-check were repeated; valid browser fixture configuration did not change.


Client final scoped-lookup follow-up: date and identity are checked on direct snapshot/pending
lookups as well. A failing-before SQLite regression now passes; focused Client total264. That boundary
was also exercised with real runtime functions and OPFS across browser reopen in bundle
entry-aa67ade897355755cfe604791b321382.js, using a synthetic store fixture, without claiming another
HTTP sync. Valid Core workflow paths previously exercised remain unchanged by that read rejection.


Final Client test limitation: 264 focused cases complete with CLI testTimeout20000 and maxWorkers2,
without editing tests/configuration. The default5000 run had21 timeouts/EPIPE and an isolated repeat
had14 timeouts; no cause is established and no default-budget PASS is claimed. Core200 focused cases,
typecheck/lint remain PASS. Client's final real-Core date-transition check hides prior-date results
immediately and its central indicator settles; selecting an unchanged context/date is noop. These
visual changes do not change Core/report identity or writing rules. Publication/technical close and
the general audit remain open.

### Publication preparation — 2026-10-19 (NOT AUTHORIZED TO DEPLOY)

The consolidated candidate adds only the two complementary real-PostgreSQL evidence tests and
this operational documentation to the previously validated runtime. No runtime/Prisma/migration
change. The previous full suite (1112 PASS/25 gated skips), build and lint remain evidence for the
identical runtime. Nine composite PostgreSQL cases are reused; two extra PG cases passed separately:
persisted concurrent winner, and failure after actual audit insertion with rollback of reservation,
record, values, relations, audit and idempotency. Missing/incomplete requests mutate none of those
counts; exact retry/replay has one effect. The new test additions pass focused lint and typecheck.
There are now 11 composite gated cases (27 total across the three integration files); no claim that
a new full suite was run. Prior 25 skips belong to the earlier full-suite candidate.

Read-only Railway verification: Operational Core project de6601db-ed83-40cd-9901-9d9053604c81,
production environment 99a3a8db-cfcf-4446-9c37-920acf2bf56b, OPCO Web v1 service
80248983-cb83-4270-bb02-e31bfd79f59e serves web.opco.cl from strabagdev/operational-core.
Its DATABASE_URL matches the private reference of Postgres service
c64c2271-f68d-44e6-b6c1-93a64b19404f; public endpoint credentials/database were compared in memory.
Session and transaction READ ONLY queried only connection metadata and _prisma_migrations:
22 applied, zero failed/rolled-back, all checksums match. The sole pending migration is
prisma/migrations/20261018000100_state_update_composite_identity/migration.sql.
No migrate command, backup creation or schema/application mutation was executed.

Backup gate OPEN: Railway PITR is disabled and bucketWired=false; volume backup schedule list is
empty. The only listed manual backup was created 2026-08-22 and has expiresAt=2026-09-21, so it is
not accepted as a current pre-migration recovery point. CLI/API expose volume backup creation and
restoration; neither mutation nor restore success was tested. PostgreSQL pg_dump/pg_restore 18.6 are
installed, matching server major18. Existing scripts/db-backup.sh makes custom dump + checksum +
pg_restore --list; scripts/db-restore.sh allows only isolated staging/development and rejects
production. No fresh backup, approved production restoration execution or restore drill is accredited.
Before authorization to migrate, require a fresh verified backup, its ID/time/retention, and a confirmed
recovery procedure/operator; restoration to production is a separate explicit decision, never automatic.

Future sequence, not executed: (1) satisfy backup gate and re-read refs/migration checksums; publish Core
only. Preserve railway.json's existing preDeployCommand=["npm run db:migrate:deploy"] unchanged; it
must apply only the above additive migration. (2) Verify Railway SUCCESS for the exact Core commit,
23 migrations/zero failed and checksum match, /api/v1/health and /api/v1/ready HTTP200. (3) Publish Client
only, then verify exact deployment SHA, public bundle/service-worker reference, API=https://web.opco.cl,
no local API destinations and unchanged opco-client-v10-epoch2.db. Stop before Client if Core checks fail.

Deployment does NOT opt in any entity: SQL is additive DDL with empty Definition/Slot tables; no
AppView config update or seed. registerCompositeDefinition is called only from explicit editor
create/update validation when subject-date-fields is selected. SQL guards act only on governed
entities. Client reads assigned definitions and cannot activate server configuration. Creating an
empty target/configuring the new mode is outside this publication. Existing AppViews are not converted.

Rollback before activation may retain additive schema while assessing a previous runtime; no down
migration is planned. Once a governed definition/report/intention exists, rollback is limited to Core
AND Client builds supporting this identity and durable authorization/idempotency. Never drop guards,
slots, definitions or reinterpret pending work as a rollback. Incomplete older writes are rejected;
that fence does not certify old Client manipulation of new local intentions. V11/general audit open.

## Extras SELECT: metadata y valores de lectura — 2026-10-24

Corrección local genérica: extraFields SELECT usa serializeApiEntityField para publicar opciones
(id, value, label, active, order), multiple y configuración. Estados mantienen su contrato optionId.
serializeRecordExtraValues entrega el textValue canónico del SELECT, separado de la normalización
usada para comparar estados/extras. current y conflictos incluyen extras cuando hay SELECT extras,
también fuera del modo compuesto; latest conserva todos los configurados. Diferencias SELECT extra
exponen valores canónicos sin cambiar la decisión de conflicto ni autorizar sobrescrituras.
Lecturas nuevas identifican extraValuesFormat="field-value" para evitar ambigüedad con IDs antiguos.

Dos RED archivados fallaron antes (opciones ausentes; opt_alpha en lugar de ALPHA) y pasan después.
75 pruebas afectadas/3 archivos, typecheck, lint y diff-check PASS. Se mantiene la prueba de conflicto
por contenido, actualizando únicamente su expectativa de representación al valor canónico.
Integración con PostgreSQL local validado: Client crea/edita y sincroniza SELECT, conserva estado
optionId, replay único, cambio remoto posterior→conflicto con comando original conservado y «Usar
Opco». HTTP de ensayo invoca funciones reales Core; no acredita autenticación de rutas Next ni
Chrome/OPFS. Sin cambios de esquema, configuración ni datos productivos. Fixtures propios limpiados.
MULTISELECT continúa no admitido como extra; RELATION y horarios fuera de este lote, V11 pausado.

### Cierre y compatibilidad SELECT extras — 2026-10-24

75 pruebas/typecheck/lint reutilizados por identidad funcional; reconstrucción/hashes/diff-check
PASS. Build producción Webpack (`npm run build -- --webpack`) PASS. Turbopack habitual no acreditado:
enlace node_modules externo inválido, luego descarga de fuentes bloqueada; con dependencias físicas
y red habilitada, EPERM en el puerto interno PostCSS. Es el límite local ya documentado; no se
modifica configuración ni se presenta como un build habitual aprobado.

Orden Core → Client, comprobado con dominio/Prisma/PostgreSQL locales y adaptadores Client reales.
Client publicado c67b9ea entiende labels/canónicos nuevos, conserva optionId de estados y sus comandos
fieldId/valor siguen dando UNCHANGED. El formulario publicado con key equivocado falla cerrado con
UNKNOWN_EXTRA_FIELD/400, sin mutar. El inverso es inseguro: Core anterior58a2a2a omite extras de
current; Client nuevo construye null para un SELECT opcional y Core anterior acepta el reemplazo
confirmado, borrando sólo el valor sintético del ensayo. No desplegar Client antes de verificar
Core corregido, ni revertir Core anterior mientras se ejecute Client nuevo. Se puede mantener Core
corregido al revertir Client. No hubo cambios de registros reales, contratos ni migraciones.

Renderer real revisado con respuesta capturada del fixture local y sesión/caché sintéticas: opciones,
current/latest por label y selección correctas, sin guardado. No se repite SQLite/sync; su evidencia
previa corresponde a idéntico código. Respaldo final y límites en
`/home/dannysilver/dev2026/backups/state-update-select-extras-close/2026-10-24/`.

## Extras tipados y precisión — candidato local 2026-10-25

MULTISELECT es ahora un extra configurable en editor/validadores/runtime, nunca un estado o campo
adicional de identidad. Wire por fieldId y valores canónicos FieldOption.value[]; estados SELECT
conservan optionId. El constructor de FormData admite el arreglo y reutiliza validación, auditoría,
idempotencia y conflictos. Metadata de extras usa el serializer genérico completo.

RELATION extra entrega target/cardinalidad y current/latest/conflicto con ID + displayName (arreglo
para MANY). Las relaciones del sujeto se identifican por sourceFieldId, no por posición. Lectura de
catálogo conserva autorización/contrato y paginación de la API existente. Null sólo representa vacío
en una lectura compatible; no se infiere un catálogo ni se rellena un label inexistente.

DECIMAL admite config.validation.decimalPlaces opcional, entero 0–6, validado en el editor y las
puertas genéricas que reutilizan validateEntityValues. Máximo de decimales, sin redondeo ni mutación
retroactiva; valores existentes de mayor precisión permanecen visibles. Presentación completa ceros
sólo si el valor es compatible. Transporte conserva número/string decimal admitidos; Client nuevo
usa string exacto al configurar precisión. No cambia DECIMAL(20,6), no hay migración ni reglas de dominio.

PostgreSQL local validado desde .env.local: metadata, arreglo persistido, relación ID/label en
current/latest, replay único, rechazo de precisión excesiva sin mutación y usuario ajeno rechazado.
Core suite final: 1120 PASS / 28 omitidas opt-in y 12 PASS PostgreSQL locales, typecheck/lint/build habitual Turbopack PASS.
Primer run tuvo seis fallos Attendance porque su fixture omitía sourceFieldId; se completó esa
proyección real sin cambiar aserciones. No regresión de dominio ni bypass de sus confirmaciones.

Horarios no integrados: consumidor publicado Client403be589 sigue perdiendo metadata propuesta;
5 caracterizaciones PASS y 2 RED de conservación. Borrado remoto no implementado: usuario confirmó
sólo administradores, auditoría y recreación explícita nueva. Slots actuales carecen de generación/
tombstone; no es seguro borrar/liberar recordId porque un envío anterior podría reclamar la clave.
Hace falta protocolo de generación y replay, más acción de auditoría de eliminación. No se abre una
puerta DELETE, no se añade anulación, no se cambia el schema ni se activa ningún modo nuevo.
Publicación eventual: Core primero y Client después; activar campos nuevos sólo tras actualizar Client.

Precisión de extra compuesto: regresión RED PostgreSQL devolvía excepción sin mapear; ahora se
mapean sólo errores conocidos después del rollback a HTTP400 INVALID_FIELD_VALUE, sin reserva/fila/
idempotencia parcial. La corrección con el mismo request rechazado puede crear posteriormente.
Errores inesperados no se convierten en éxito. El fixture de concurrencia de la integración completa
se aisló por fecha y verifica todas las filas previas intactas; no se eliminó ninguna aserción.
Dos AppViews compuestas con MULTISELECT/RELATION/DECIMAL: un ganador concurrente, otra combinación
independiente, replay único, invalidación antigua incompleta sin mutación y rollback de precisión.


## Precisión del editor — 2026-10-25, LOCAL SIN PUBLICAR

El parser de entity-config.entityFieldSchema.validation ahora conserva decimalPlaces opcional,
entero de 0 a 6. El formulario ya emitía validationDecimalPlaces, pero Zod lo eliminaba. No se
agregan valores predeterminados, redondeos, cambios de valores ni activaciones automáticas.
Se reutiliza el dominio de validación existente.

Regresión RED en Core79034ef: seis casos del parser y dos integraciones PostgreSQL pierden la regla.
GREEN tras añadir la propiedad: control real SSR, Request/FormData multipart, parser,
create/update con permisos, PostgreSQL y lectura del editor/API. Se valida un decimal y se conserva
el valor anterior 12.34 al editar sólo la configuración, sin redondearlo. Aplicar esa regla a
INTEGER se rechaza antes de mutar. Los fixtures propios de PostgreSQL local se eliminan al terminar.

Validación: 101 pruebas focalizadas y 2 integraciones PostgreSQL locales, un worker; typecheck,
lint afectado y diff-check PASS. Conexión cargada explícitamente desde .env.local, restringida a
127.0.0.1:5432/opco_development como opco_dev. No sesión Next autenticada ni navegador nuevos;
no suite completa, build, configuración productiva, commit, push o deploy.

La transición SELECT→MULTISELECT queda cancelada por instrucción del usuario: Operador continúa
SELECT simple. Este lote no cambia opciones, valores, outbox ni el soporte MULTISELECT publicado.
Horarios, 402 exclusiones y pendientes ajenos permanecen intactos. V11 pausado.


## Schedule compatibility boundary — local, disabled — 2026-10-25

This release does not implement a schedule catalogue, policy, editor or application. The shared
STATE_UPDATE parser rejects own top-level schedule or scheduleApplication properties (including null)
with HTTP400 SCHEDULE_NOT_SUPPORTED before idempotency lookup/reservation, transactions or content/
audit writes. Unsupported metadata is never acknowledged after being silently stripped. Authentication
and workflow access still run first. Valid commands without schedules, Attendance, hashes/replays,
authorization and conflicts retain their existing behavior. No schema/migration/configuration changes.

77 focused tests pass (shared engine plus Attendance), worker1/default timeouts; typecheck/affected
lint/diff-check pass. Six new cases cover the explicit rejection and its replay with no mutation calls;
Prisma is mocked, so this is not PostgreSQL acceptance/integration. Client companion uses real file
SQLite with controlled transport/ACK. No new browser/OPFS or complete catalogue claim.

Order if later authorized: Core guard then Client compatibility, schedules still disabled. Complete
catalogue/application/preparation separately; activation requires excluding pre-bridge runtimes, not
merely updating SW. Preserve reference/snapshot/authorization/idempotency; future rollback only to
compatible builds. V11 remains paused. Durable inventory/patches:
/home/dannysilver/dev2026/backups/schedule-runtime-compatibility-bridge/2026-10-25/.

## Horarios genéricos opt-in — implementación exclusivamente local, 2026-10-25

Primera etapa sobre STATE_UPDATE compuesto/update-current, posterior al puente. Catálogo único
por contrato, zona IANA configurada al crearlo; códigos y revisiones en dos entidades REFERENCE
con EAV/relaciones/auditoría existentes. `EntityType.scheduleConfig` guarda roles y política
compartida del destino; `EntityRecord.scheduleApplication` conserva el snapshot aplicado.
Editor: sección «Horarios y jornadas» al editar una AppView compuesta. Crear catálogo → publicar
revisiones explícitas → vincular opciones SELECT de identidad → confirmar activación con fecha.
No se activa al guardar la AppView ni al desplegar; producción no se consulta ni modifica aquí.

Revisiones publicadas inmutables; secuencia y vigencia serializadas por lock del catálogo.
Primera vigencia y activación explícitas, admitiendo fecha pasada para altas tardías sin completar
reportes anteriores. Revisiones posteriores futuras y posteriores a la última, sin empates. Retiro
no retrospectivo e irreversible en esta etapa; permite publicar revisiones anteriores al corte
futuro, rechazando las que comiencen en o después del retiro. No desactiva SELECT ni borra revisiones. Resolución
por DATE operacional del inicio; duración = offset×1440 + fin − inicio (positiva, offset 0/1),
independiente de DST/UTC. No expresa horas trabajadas. Política/vinculaciones inmutables tras
activar; no incluye herramientas de reorganización del catálogo o cambio retrospectivo de zona.

GET devuelve política/resolución del contexto para nuevas altas y snapshot individual en
current/latest. Referencias usan binding/revision/digest; las opciones e identidad compuesta no
cambian. Core valida y construye la aplicación canónica. Ediciones conservan la aplicación
anterior; registros previos sin snapshot se leen como legacy explícito y no se completan.
Nuevas altas legacy se rechazan. Sin revisión aplicable no se crea un reporte.

Dentro de la transacción compuesta: lock del destino → reserva exacta/replay → lock del catálogo
para resolver altas → contenido+aplicación+auditoría+resultado idempotente. Replay completado
se conserva aunque cambie el catálogo. Una revisión offline aún válida se acepta; si dejó de
corresponder, SCHEDULE_REVISION_CHANGED sin reservas/escrituras/recibos parciales. Cliente antiguo
sin referencia: SCHEDULE_CLIENT_UPDATE_REQUIRED sin mutación (salvo replay ya completado).
Si otro escritor aplicó otro horario, conflicto explícito; no se cambia esa aplicación ni siquiera
con overwrite. Las comprobaciones de contenido/base/conflicto sin horarios permanecen intactas.

Guardas SQL adicionales bloquean escrituras genéricas, importación/borrado y cambios de estructura
en catálogo/revisiones, así como puertas antiguas sobre consumidores activados. Las funciones
administradas usan flags transaccionales propios; las puertas genéricas no los emiten. No cambia
el contrato de entidades no activadas. La API genérica traduce el rechazo de las guardas nuevas
a SCHEDULE_WRITE_REQUIRES_EDITOR. La publicación revalida ADMIN con capabilities del contrato. El parser del formulario exige el
desplazamiento explícito 0/1; una política sin vinculaciones válidas se rechaza antes de persistir.

Migraciones locales, ninguna productiva:
- `20261025000100_state_update_schedules`: dos columnas JSONB nullable, sin backfill, y guardas.
- `20261025000200_schedule_value_guard`: permite reemplazo EAV autorizado sin permitir DELETE
  de reporte, y compara snapshots mediante JSON para soportar los tres tipos de trigger. Corrige
  dos errores detectados en la primera integración real; no se reescriben migraciones aplicadas.
Las 23 anteriores permanecen sin cambios. Destino validado desde `.env.local`, pasado explícito:
127.0.0.1:5432/opco_development, opco_dev. Sin reseteos ni modificación de registros existentes.

Evidencia: 149 pruebas focalizadas Core (dos suites PostgreSQL habilitadas), sin omisiones;
contraste adicional Intl/IANA de noches Santiago de 11/13 h transcurridas frente a 12 h nominales
(sólo en pruebas; no hay cálculo de instantes en runtime);
concurrencia, dos AppViews, rollback tras auditoría, replay, referencia alterada, cliente antiguo,
retiro, revisión futura, conflicto de aplicación y controles Attendance/compuesto sin horario.
Editor Next real y API/Auth reales en Chrome/OPFS con fixture propio; sincronización actualiza una
sola fila y conserva horario. Core no usa ACK simulado para acreditar aceptación. Resoluciones
SQLite/late responses se acreditan separadamente en Client. Sin suite completa ni build de cierre.

Respaldo: `backups/schedule-catalog-local-integration/2026-10-25/` fuera de los repositorios.
Activación/publicación bloqueadas por coexistencia con JS previo al puente: no se ha excluido.
Orden futuro Core compatible+migraciones → Client compatible → exclusión verificada de runtimes
anteriores → activación revisada, nunca automática. Rollback sólo compatible después de activar;
no hay reversión destructiva. Sin horarios productivos, V11 pausado y auditoría general abierta.

## Horarios — compatibilidad de publicación desactivada — evaluación 2026-10-26

La coexistencia con Client anterior bloquea producir metadata nueva, **no publicar el soporte sin
activar políticas consumer**. Orden recomendado Core + las dos migraciones aditivas ya inventariadas
→ SUCCESS/health/readiness → Client, manteniendo horarios desactivados. Sin backfill/default nuevo;
guardas inertes para scheduleConfig NULL. La activación sigue siendo una acción administrativa explícita.

Nueva prueba local complementaria: Core publicado e3a0a995 y Prisma6.19.3 generado desde su esquema
exacto anterior, confirmado SIN scheduleConfig/scheduleApplication en DMMF; ambas columnas existen en
PostgreSQL local, nullable y sin default. 13 PASS/2 archivos: comprobación de las25 migraciones/checksums
más12 integraciones compuestas del HEAD publicado, sin política activa (concurrencia, confirmación,
replay, rollback y puertas genéricas). Sin nuevas migraciones ni fallos; sólo fixture propio, retirado.
Reutilizados149 PASS del candidato y evidencia Client sin horario, sin suite/build/navegador repetidos.

Activar requiere adopción verificada del Client compatible en todos los perfiles usados, ausencia de
instancias antiguas y sincronizar/resolver explícitamente intenciones sin horario del destino antes
del cambio. Un Client anterior omite la referencia al enviar y puede perderla durablemente al editar:
Core rechaza sin crear otro efecto (o IDEMPOTENCY_KEY_REUSED si hay recibo de otro hash), pero no evita
esa pérdida local. No existe exclusión automática demostrada por SW/OPFS. Para el único usuario el
procedimiento de cierre/verificación es la condición mínima; si no puede acreditarse, no activar.

Rollback antes de activar, sin datos nuevos de horarios, puede conservar las dos migraciones. Después
de activar, sólo builds compatibles; no revertir destructivamente datos/migraciones. El preflight y
respaldo productivo quedan para una publicación autorizada; este ensayo no los acredita ni ejecuta.
Parche/candidato original intacto; documentación complementaria y tiempos en
`backups/schedule-publication-evaluation/2026-10-26/`. Sin producción, commit/push/deploy; V11 pausado.

## Horarios — cierre técnico desactivado — 2026-10-26

Candidato final Core16 archivos/46 hunks, combinado con puente e integración, sin cambios funcionales.
Reutiliza149 PASS del candidato y13 comprobaciones Core/Prisma publicados sobre ambas migraciones
locales; contenido y tests idénticos por hash. Build normal Next/Turbopack final PASS (incluido TypeScript),
con URL exclusivamente local validada. Primer intento rechazado por symlink de dependencias fuera de
raíz aislada; otro comenzó antes de confirmar la copia y reportó módulos ausentes. Repetición con copia
completa PASS; no se cambió bundler/configuración/dependencias ni se atribuye fallo al runtime.
Sin nuevas suites/navegador; lint previo por hash y diff-check/reconstrucción finales PASS.

20261025000100_state_update_schedules y20261025000200_schedule_value_guard: aditivas, nullable,
sin default/backfill ni activación. Compatibilidad desactivada con Client publicado acreditada.
Orden posterior Core+migraciones→SUCCESS/health/readiness→Client, sin activar. Activación requiere
adopción verificada de runtimes compatibles y resolver/sincronizar previamente las intenciones sin
horario del destino. No vaciar colas ni cambiar namespace. Rollback tras activar sólo compatible.

Bloqueado para publicar hasta acreditar respaldo productivo actualizado: copia lógica19-10 intacta
por SHA256,22 migraciones y restauración local entonces, no copia actual. Sin acceso productivo ni
nuevo respaldo en este cierre. Detalle, inventario y tiempos en
`backups/schedule-technical-close/2026-10-26/`. Sin código adicional, commit/push/deploy/activación;
pendientes ajenos preservados, V11 pausado, lectura de códigos no iniciada.
