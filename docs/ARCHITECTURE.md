# Operational Core Architecture

Operational Core is the technical foundation for an official operational data source. It stores configurable operational records, validates their values, relates records, audits changes, and isolates information by organization and contract.

It is not an ERP. The Core should not own workflows, approvals, generic business processes, notifications, or broad business-state engines.

## Tenancy And Context

`Organization` is the tenant boundary. Users gain access through `Membership`; the current roles are `ADMIN` and `MEMBER`.

`Contract` is the operational context. Authenticated app routes use the contract id in the URL, but server-side helpers always validate the session, membership, contract status, and resource ownership before returning data.

## User Administration

`User.active` is the account-level access switch. Active users can authenticate through the Auth.js credentials flow and through `/api/v1/auth/login`; inactive users remain in the database for history and administration but cannot obtain a new login session or API token. Protected API requests also re-read the user on every Bearer token validation, so an already-issued API token stops working after the user becomes inactive.

Disabling a user is the normal offboarding operation. It updates only `User.active = false` and preserves `User`, `Membership`, `AuditEvent`, and `UserAppViewAccess` rows. This keeps operational history and assigned configuration visible.

Permanent deletion is intentionally narrow. A user can be physically deleted only when server-side `canDeleteUser` confirms that the user belongs to the administrator's organization and has no organization-scoped audit history. Administrative rows such as `Membership`, Auth.js sessions/accounts, and `UserAppViewAccess` may be removed through database cascades as part of deleting a history-free user. Operational history must never be deleted merely to make a user deletable.

User creation and editing derive organization server-side from the authenticated ADMIN context. Client-submitted `organizationId`, `userId`, or `role` values are never trusted without re-reading membership and organization ownership. Email is normalized to lowercase, must be unique, and passwords are always stored as bcrypt hashes. Editing a user does not require a password; an empty password field preserves the existing hash.

The organization must always keep at least one active `ADMIN`. Demotion, deactivation, and permanent deletion of an ADMIN all check for another active ADMIN before mutating data.

User experience assignment reuses `UserAppViewAccess`. The user detail screen lists AppViews by contract and lets administrators assign or remove active views that belong to the same organization. It does not create a parallel permission system.

## Configurable Models

`EntityType` defines a record category inside one contract, such as Personas, Equipos, Empresas, or Documentos.

`EntityType.icon` is optional and stores only a stable key from Opco's controlled Lucide-based catalog, such as `warehouse`. It is nullable for existing or unbranded entities. The database does not store SVG, HTML, or React component names.

`EntityType.nature` is a required semantic classification with the stable enum values `MASTER`, `TRANSACTION`, and `REFERENCE`. Existing and newly created entity types default to `MASTER` unless an administrator explicitly chooses another value. Opco does not infer this value from the entity name, fields, icon, or records.

`EntityField` defines active fields for an entity type. Field definitions include type, required, unique, searchable, multiple, sort order, optional JSON config, and active state.

`FieldOption` stores active options for `SELECT` and `MULTISELECT` fields.

Configurable validations are stored inside `EntityField.config.validation`, alongside relation configuration when the field type is `RELATION`. This keeps validation rules versionable without adding schema columns for every rule.

Record presentation is stored inside `EntityField.config.display`:

- `primary`: marks the field used to calculate the persisted `EntityRecord.displayName`;
- `showInList`: marks a dynamic field as a visible record-list column;
- `listOrder`: legacy compatibility data only; official field order is `EntityField.sortOrder`.

`EntityField.sortOrder` is the single official order for field configuration, record forms, record-list dynamic columns, Excel templates, and Excel imports. `display.listOrder` must not create a different order.

Dynamic fields support two different lifecycle operations:

- deactivation keeps the `EntityField` row and preserves all historical data while removing the field from new operational use;
- permanent deletion removes the `EntityField` only when it has never been used.

Permanent deletion is intentionally conservative. A field is not deletable when any `EntityValue`, `EntityRelation`, or `AuditChange` references it. This includes inactive fields and values that may look empty at presentation time but still exist as persisted rows. `FieldOption` rows for unused `SELECT` or `MULTISELECT` fields are configuration only and do not block deletion; they are deleted together with the field. Operational Core does not currently implement destructive deletion of fields with history, nor does the audit enum include a dedicated configuration-deletion event for this operation.

Only one active field should be primary for each `EntityType`. The server unmarks any previous primary field when a new one is saved. If no primary field is configured, records keep the legacy display-name fallback: first required `TEXT`, then first `TEXT`, then `Registro sin nombre`.

Supported validation rules are constrained by field type:

- text-like fields: required, minimum length, maximum length, regex, default value;
- numeric fields: required, minimum, maximum, default value;
- boolean, date, datetime, select, and multiselect fields: required and default value;
- relation fields: required, with relation targets stored in `EntityRelation`.

Validation is centralized in the server-side dynamic field validation layer. Server Actions treat submitted values as untrusted, re-read field definitions through authorized contract/entity helpers, normalize form input, apply defaults only during creation, and then validate before any record/value/relation/audit write occurs.

## Dynamic Records

`EntityRecord` stores the operational record identity, display name, and timestamps. It has no technical status, archive state, or soft-delete flag.

`EntityRecord.displayName` remains the common visible identity used by lists, relation selectors, breadcrumbs, activity, and audit summaries. List screens use it as the first column and do not repeat the primary field among dynamic columns.

Business states are modeled with dynamic fields owned by the entity, usually `SELECT` or `MULTISELECT`. For example, a Persona can define Estado = Vigente / Finiquitado, and an Equipo can define Estado = Operativo / Mantención / Fuera de servicio. Operational Core does not impose that semantic on every record.

`EntityValue` stores dynamic values using typed columns. Relations are not stored in `EntityValue`.

Supported value columns are text, integer, decimal, boolean, date, and JSON. `MULTISELECT` uses JSON. `FILE` and `IMAGE` are not implemented beyond disabled form placeholders.

`MONEY` represents a monetary value or financial unit. Its canonical value is numeric and is stored in the same decimal value channel used for numeric precision; symbols, currency labels, and unit suffixes are presentation only. The presentation currency/unit is defined by `EntityField.config.money.currency`, currently `CLP`, `USD`, `EUR`, or `UF`, with `CLP` as the fallback for existing fields without money config.

`TIME` represents a local time of day without date or timezone. It is stored in the EAV `textValue` channel as canonical `HH:mm` because the current value model has no dedicated time column and adding one would not improve the field semantics for this architecture. Server-side validation always treats it as `TIME`, not generic `TEXT`; no fake dates are introduced. With canonical `HH:mm`, lexicographic sort matches time-of-day order.

Changing `config.money.currency` does not convert existing values. It only changes how those numeric values are interpreted and displayed. Future APIs must expose the numeric value as data and the currency/unit through the field definition, not only a formatted string. Keep this rule separate from `INTEGER` and `DECIMAL`: they may share infrastructure, but `MONEY` has currency/unit presentation semantics.

## Semántica de fechas

### DATE

`DATE` representa una fecha de calendario, no un instante temporal.

Reglas:

- No aplica conversión de zona horaria.
- Debe conservar exactamente año, mes y día ingresados.
- Internamente debe normalizarse como `YYYY-MM-DD` cuando corresponda.
- La presentación puede usar `DD-MM-YYYY`.
- No usar `new Date("YYYY-MM-DD")` para presentación si eso introduce conversión UTC/local.
- Listados, detalle, formularios, Excel, API futura y cualquier otra interfaz deben respetar esta semántica.

Ejemplo:

Entrada:

```text
2026-01-21
```

Debe seguir representando:

```text
2026-01-21
```

independientemente de que el usuario esté en UTC-4, UTC, UTC+10, etc.

### DATETIME

`DATETIME` representa fecha y hora.

Reglas:

- Mantiene una semántica temporal distinta de DATE.
- Puede involucrar timezone según el contexto.
- No reutilizar helpers de DATE si eso elimina o altera información horaria.

### Principio arquitectónico

Nunca tratar DATE y DATETIME como equivalentes.

La infraestructura común puede compartirse, pero su semántica debe permanecer separada.

## Relations

`EntityRelation` stores real links between records for `EntityField` definitions of type `RELATION`.

The source field config defines the target entity type and relation kind:

- `ONE` allows one selected target.
- `MANY` allows multiple selected targets.

Server-side validation ensures source and target records belong to the same contract and compatible entity types. Inverse relations are queried from `EntityRelation`; inverse fields are not created automatically.

## Audit

`AuditEvent` records who changed a resource, what action occurred, the contract, optional entity type and record, summary, metadata, and timestamp.

`AuditChange` records concrete field-level changes with old and new JSON values. Decimal and money values are serialized as strings. Date and datetime values are serialized as ISO strings. Relation changes store referenced ids and display names.

Record mutations and audit writes run in the same Prisma transaction where applicable.

Historical audit actions such as `RECORD_STATUS_CHANGED` and `RECORD_ARCHIVED` may remain in the `AuditAction` enum for legacy events, but new EntityRecord mutations no longer generate technical status audit events.

## External API

The external API lives under `/api/v1` and uses JSON response envelopes. It is separate from the Auth.js web session flow: API clients authenticate with Bearer JWT access tokens signed by `API_AUTH_SECRET`, not with web cookies or `AUTH_SECRET`.

Contract-scoped API access derives organization, app, contract, and membership from the database on every protected request. Clients cannot choose organization or role through request payloads.

Dynamic entity definitions and records are exposed through `/api/v1/contracts/:contractId/entities`. Record write endpoints reuse the same server-side validation layer used by the web UI instead of maintaining a parallel validation engine. `EntityField.key` is the external JSON key for record values.

Client experiences are exposed through `/api/v1/contracts/:contractId/views`. The endpoint returns only active `AppView` rows assigned to the authenticated user through `UserAppViewAccess`.

External record creation is persistently idempotent through `ApiIdempotencyKey`. The unique boundary is external app, operation, and `clientRequestId`; matching payload replays return the original record, while different payloads are rejected as conflicts. The idempotency row points back to the created `EntityRecord` after a successful transaction.

## Entity Nature And Future Views

`EntityType.nature` classifies what the data model represents inside the Core. It is metadata on the entity definition itself and is available to web administration screens and external API entity DTOs.

`AppView.type` classifies how Opco Client should present or use data. It is separate from `EntityType.nature`: the same `MASTER` entity can appear in multiple app views, and a workflow view can combine a master entity with a transactional entity.

`AppView` is scoped to a `Contract` and stores name, slug, optional icon, type, active state, JSON config, sort order, and timestamps. Slugs are unique inside a contract. `sortOrder` is a simple numeric order for future client navigation.

`UserAppViewAccess` assigns one `User` to one `AppView` inside one `Contract`. Its unique boundary is `userId`, `contractId`, and `appViewId`. The database enforces that the assigned `AppView` belongs to the same contract through a composite relation, and domain helpers verify the user belongs to the contract organization before creating assignments.

The intended client flow is:

```text
User -> Contract -> UserAppViewAccess -> AppView -> renderer in Opco Client
```

An AppView assignment means the experience is visible/available to the user. It is not a complete data-permission boundary. Data authorization remains a separate concept: in this stage entity and record API access is still authorized by contract membership because granular entity permissions do not exist yet.

Current `AppView.type` values:

- `RECORDS`: generic listing/detail/edit experience for one `EntityType`; config stores `entityTypeId`.
- `WORKFLOW`: specialized operation that can read one entity and write another; config stores `sourceEntityTypeId`, `targetEntityTypeId`, and a controlled `workflow` value. The only current workflow value is `attendance` (`Asistencia`). The attendance renderer is not implemented yet.
- `BOARD`: grouped board for one `EntityType`; config stores `entityTypeId` and `groupByFieldKey`.
- `DASHBOARD`: summary view over multiple entity types; config stores `entityTypeIds`.

Although `AppView.config` is stored as JSON, it is not treated as arbitrary JSON. Server-side validators check the required shape for each type, verify every referenced `EntityType` belongs to the same contract, and for `BOARD` verify the grouping field exists and is active in that entity type.

Example:

- `Personas`: `nature = MASTER`
- `Asistencias`: `nature = TRANSACTION`
- `Directorio Personas`: `type = RECORDS`, `entityTypeId = Personas`
- `Tomar asistencia`: `type = WORKFLOW`, `sourceEntityTypeId = Personas`, `targetEntityTypeId = Asistencias`, `workflow = attendance`

The current audit system does not yet include dedicated actions for AppView configuration changes. AppView administration reuses contract authorization but does not write audit events in this stage.

## Application Boundaries

The current Core does not implement:

- workflows or approvals;
- business process states; model them as dynamic entity fields instead;
- granular permissions;
- real file storage;
- comments;
- labels or favorites;
- global search;
- shared catalogs.
- conditional validations or a rules engine.

These boundaries keep the Core focused on data integrity, isolation, dynamic structure, relations, and auditability.
