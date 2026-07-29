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
- `listOrder`: optionally orders list columns, falling back to `EntityField.sortOrder`.

Only one active field should be primary for each `EntityType`. The server unmarks any previous primary field when a new one is saved. If no primary field is configured, records keep the legacy display-name fallback: first required `TEXT`, then first `TEXT`, then `Registro sin nombre`.

Supported validation rules are constrained by field type:

- text-like fields: required, minimum length, maximum length, regex, default value;
- numeric fields: required, minimum, maximum, default value;
- boolean, date, datetime, select, and multiselect fields: required and default value;
- relation fields: required, with relation targets stored in `EntityRelation`.

Validation is centralized in the server-side dynamic field validation layer. Server Actions treat submitted values as untrusted, re-read field definitions through authorized contract/entity helpers, normalize form input, apply defaults only during creation, and then validate before any record/value/relation/audit write occurs.

## Dynamic Records

`EntityRecord` stores the operational record identity, status, display name, timestamps, and archive timestamp.

`EntityRecord.displayName` remains the common visible identity used by lists, relation selectors, breadcrumbs, activity, and audit summaries. List screens use it as the first column and do not repeat the primary field among dynamic columns.

`EntityValue` stores dynamic values using typed columns. Relations are not stored in `EntityValue`.

Supported value columns are text, integer, decimal, boolean, date, and JSON. `MULTISELECT` uses JSON. `FILE` and `IMAGE` are not implemented beyond disabled form placeholders.

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

## Application Boundaries

The current Core does not implement:

- workflows or approvals;
- business process states beyond `ACTIVE`, `INACTIVE`, and `ARCHIVED`;
- granular permissions;
- public APIs;
- real file storage;
- comments;
- labels or favorites;
- global search;
- shared catalogs.
- conditional validations or a rules engine.

These boundaries keep the Core focused on data integrity, isolation, dynamic structure, relations, and auditability.
