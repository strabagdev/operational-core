# PCORE-008.1 Record Display Configuration

## Objective

PCORE-008.1 formalizes how dynamic records are presented in lists without changing the persisted record identity model. It removes duplicated columns caused by mixing `EntityRecord.displayName` and dynamic fields marked as searchable.

## Model

Presentation configuration is stored in `EntityField.config.display`:

```json
{
  "display": {
    "primary": true,
    "showInList": true
  }
}
```

This section is independent from `config.validation` and relation metadata such as `targetEntityTypeId` and `relationKind`.

## Primary Field

`display.primary` marks the field used to calculate `EntityRecord.displayName` during create and edit. Only one active field should be primary for an `EntityType`; saving a new primary unmarks the previous one.

Supported primary types:

- `TEXT`
- `EMAIL`
- `PHONE`
- `URL`
- `INTEGER`
- `SELECT`

Unsupported primary types include `TEXTAREA`, `DECIMAL`, `MONEY`, `BOOLEAN`, `DATE`, `DATETIME`, `TIME`, `MULTISELECT`, `RELATION`, `JSON`, `FILE`, and `IMAGE`.

If no primary is configured, the legacy fallback is used: first required `TEXT`, then first `TEXT`, then `Registro sin nombre`.

## Display Name

`EntityRecord.displayName` remains persisted and remains the shared identity for:

- record lists;
- relation selectors;
- record detail links;
- activity;
- audit summaries.

For `SELECT` primary fields, the option label is used instead of the stored option value. Existing records are not recalculated in bulk; they refresh on the next edit.

## Visible Columns

Record lists use:

```text
Primary displayName | dynamic fields with showInList | Updated | Actions
```

The primary field is excluded from dynamic columns to avoid duplication. If no field has display configuration yet, the table temporarily falls back to searchable fields, excluding the primary field.

`EntityField.sortOrder` controls visible-column order. Existing `display.listOrder` values are legacy compatibility data only and must not create a second order.

## Record Status

`EntityRecord` has no technical status. A record exists until it is permanently deleted. Business states must be represented with dynamic fields owned by the `EntityType`, so a dynamic field named `Estado` appears as a normal domain column when configured with `showInList`.

## Compatibility

No Prisma migration is required because `EntityField.config` already stores JSON configuration. Existing config sections are preserved when display settings are changed.

The seed is idempotent and configures Personas with:

- Nombre: primary and visible in list;
- RUT: visible in list;
- Cargo: visible in list;
- Estado: visible in list.

## Limitations

- Existing `displayName` values are not recalculated in bulk.
- There is no width or alignment configuration yet.
- Large tables still need future pagination and column-density work.
