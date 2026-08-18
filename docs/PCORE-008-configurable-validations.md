# PCORE-008 Configurable Validations

## Objective

PCORE-008 adds server-side configurable validations for dynamic fields without changing the dynamic data model. Rules are stored in `EntityField.config` and applied when records are created or edited.

## Scope

Implemented rules:

- required;
- minLength and maxLength;
- minimum and maximum;
- regex pattern and optional custom message;
- defaultValue for compatible field types.

Out of scope:

- conditional required;
- formulas;
- calculated fields;
- workflows;
- JavaScript or executable expressions;
- async validation;
- automatic migration of existing records.

## Model

Validation config is stored in the existing JSON column:

```json
{
  "validation": {
    "required": true,
    "minLength": 3,
    "maxLength": 120,
    "minimum": 0,
    "maximum": 100,
    "regex": {
      "pattern": "^[A-Z0-9-]+$",
      "message": "Use solo mayúsculas, números y guiones"
    }
  },
  "defaultValue": null
}
```

For relation fields, relation metadata remains in the same config object:

```json
{
  "targetEntityTypeId": "entity-type-id",
  "relationKind": "MANY",
  "validation": {
    "required": true
  }
}
```

## Matrix

| Field type | Rules |
| --- | --- |
| TEXT, TEXTAREA | required, minLength, maxLength, regex, defaultValue |
| EMAIL, PHONE, URL | required, minLength, maxLength, regex, defaultValue |
| INTEGER | required, minimum, maximum, defaultValue |
| DECIMAL, MONEY | required, minimum, maximum, defaultValue |
| BOOLEAN | required, defaultValue |
| DATE, DATETIME, TIME | required, defaultValue |
| SELECT | required, defaultValue |
| MULTISELECT | required, defaultValue |
| RELATION | required |
| FILE, IMAGE | required only; input is still not implemented |

## Creation Flow

1. Authorize user, membership, contract, and entity type.
2. Load active fields and active options.
3. Normalize form input.
4. Apply default values only for empty submitted values.
5. Validate required and configured rules.
6. Validate options and relation targets.
7. Persist record, values, relations, and audit event in one transaction.

## Edit Flow

1. Authorize user, contract, entity type, and record.
2. Load current record values and relation state.
3. Normalize submitted final state.
4. Do not apply default values.
5. Validate required and configured rules.
6. Persist changes and audit in one transaction.

## Default Values

Defaults are applied only on creation. They do not replace false, zero, selected values, text entered by the user, or existing values during edit.

## Field Errors

Validation errors are structured by `fieldId` and returned to the record pages through the existing redirect-based Server Action flow. The form renders messages beside each field and keeps a general summary for context.

## Security

Server validation never trusts field IDs, option values, relation target IDs, or contract IDs from the browser. The server re-reads the authorized contract, entity type, fields, options, and record before validation.

## Audit

Record value and relation changes continue to be audited through `AuditEvent` and `AuditChange`. EntityField configuration changes are not audited yet because the current audit model is record-centered; this remains explicit future debt.

## Limitations

- Create-field validation controls are rendered for the initial field type before save; incompatible combinations are rejected on the server.
- Existing records are not bulk-revalidated or modified when rules change.
- SELECT and MULTISELECT defaults require options to exist before they can be configured safely.
