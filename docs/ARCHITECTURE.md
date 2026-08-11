# Operational Core Architecture

Operational Core is the technical foundation for an official operational data source. It stores configurable operational records, validates their values, relates records, audits changes, and isolates information by organization and contract.

It is not an ERP. The Core should not own workflows, approvals, generic business processes, notifications, or broad business-state engines.

## Tenancy And Context

`Organization` is the tenant boundary. Users gain access through `Membership`; the current roles are `ADMIN` and `MEMBER`.

`Contract` is the operational context. Authenticated app routes use the contract id in the URL, but server-side helpers always validate the session, membership, contract status, and resource ownership before returning data.

## Configurable Models

`EntityType` defines a record category inside one contract, such as Personas, Equipos, Empresas, or Documentos.

`EntityField` defines active fields for an entity type. Field definitions include type, required, unique, searchable, multiple, sort order, optional JSON config, and active state.

`FieldOption` stores active options for `SELECT` and `MULTISELECT` fields.

Configurable validations are stored inside `EntityField.config.validation`, alongside relation configuration when the field type is `RELATION`. This keeps validation rules versionable without adding schema columns for every rule.

Record presentation is stored inside `EntityField.config.display`:

- `primary`: marks the field used to calculate the persisted `EntityRecord.displayName`;
- `showInList`: marks a dynamic field as a visible record-list column;
- `listOrder`: legacy compatibility data only; official field order is `EntityField.sortOrder`.

`EntityField.sortOrder` is the single official order for field configuration, record forms, record-list dynamic columns, Excel templates, and Excel imports. `display.listOrder` must not create a different order.

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

## Application Boundaries

The current Core does not implement:

- workflows or approvals;
- business process states; model them as dynamic entity fields instead;
- granular permissions;
- public APIs;
- real file storage;
- comments;
- labels or favorites;
- global search;
- shared catalogs.
- conditional validations or a rules engine.

These boundaries keep the Core focused on data integrity, isolation, dynamic structure, relations, and auditability.
