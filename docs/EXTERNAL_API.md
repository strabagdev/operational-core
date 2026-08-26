# External API

Operational Core exposes an external JSON API under `/api/v1`.

The API is versioned from the first route so future incompatible changes can live under a new prefix without changing existing clients. Business endpoints under `/api/v1` return JSON envelopes:

Success:

```json
{
  "ok": true,
  "data": {}
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

Temporary infrastructure failures use a stable 503 response:

```json
{
  "ok": false,
  "error": {
    "code": "DB_UNAVAILABLE",
    "message": "Servicio temporalmente no disponible."
  }
}
```

Operational Core may retry read-only Prisma/PostgreSQL validations once when a transient connection error is detected. Writes are not retried automatically; clients must rely on documented idempotency keys or submit a new explicit request.

## Web Auth And API Auth

The existing web login uses Auth.js with the Credentials Provider and JWT sessions stored in Operational Core/Auth.js cookies. That behavior remains separate from the external API.

External API clients do not use Auth.js cookies. They authenticate with `Authorization: Bearer <token>` and tokens signed with `API_AUTH_SECRET`.

`API_AUTH_SECRET` is intentionally separate from `AUTH_SECRET`. Do not reuse `AUTH_SECRET` for external API bearer tokens.

External API sessions use two token types:

- Access token: JWT bearer token, 1 hour.
- Refresh token: opaque random token, 30 days, rotated on every use and stored server-side only as a hash.

Web clients receive the refresh token in an HttpOnly cookie so JavaScript cannot read it. Native clients identify transport with `X-Opco-Client-Platform: native` and receive the refresh token in JSON for storage in the platform secure store.

## Environment

Required for external API authentication:

```bash
API_AUTH_SECRET="set-a-stable-generated-secret"
```

Required for browser clients that call `/api/v1` from a different origin:

```bash
API_ALLOWED_ORIGINS="http://localhost:8081,http://localhost:19006,http://localhost:19102"
```

`API_ALLOWED_ORIGINS` is a comma-separated allowlist of exact origins. Opco does not use `Access-Control-Allow-Origin: *`. When a request includes an `Origin` header that exactly matches one of the configured values, `/api/v1` responses include:

```http
Access-Control-Allow-Origin: <authorized-origin>
Access-Control-Allow-Credentials: true
Vary: Origin
Access-Control-Allow-Methods: GET,POST,PATCH,OPTIONS
Access-Control-Allow-Headers: Authorization,Content-Type,X-Opco-Client-Platform
Access-Control-Max-Age: 600
```

Unauthorized origins still receive the normal API response or preflight status, but without `Access-Control-Allow-Origin`, so browsers block access. Native mobile clients are not governed by browser CORS, but Expo Web is.

Cookie-based refresh and logout additionally reject Web requests whose `Origin` is not present in `API_ALLOWED_ORIGINS`. This protects cross-origin cookie endpoints from CSRF instead of relying only on `SameSite=None`.

Do not commit real secret values.

## POST /api/v1/auth/login

Authenticates a user with the same email/password credentials used by the web Credentials Provider. Email is trimmed and lowercased before lookup. Password validation uses bcrypt against the stored `User.passwordHash`.

Request:

```json
{
  "email": "usuario@dominio.cl",
  "password": "password",
  "clientId": "opco_app_..."
}
```

`clientId` is required. This is a breaking change in `/api/v1` because the API is still in development and has no production clients yet.

Success response:

```json
{
  "ok": true,
  "data": {
    "accessToken": "...",
    "tokenType": "Bearer",
    "expiresIn": 3600
  }
}
```

For Web or absent platform headers, the response also sets this cookie and does not include `refreshToken` in JSON:

```http
Set-Cookie: opco_api_refresh_token=<opaque-token>; HttpOnly; Secure; SameSite=None; Path=/api/v1/auth; Max-Age=2592000
```

For Native requests:

```http
X-Opco-Client-Platform: native
```

the success body includes `refreshToken` and no refresh cookie is set:

```json
{
  "ok": true,
  "data": {
    "accessToken": "...",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "refreshToken": "opco_rt_..."
  }
}
```

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_JSON` | Request body is not valid JSON. |
| 400 | `INVALID_LOGIN_BODY` | Request body does not match the expected email/password/clientId shape. |
| 401 | `INVALID_CREDENTIALS` | Email or password is invalid. The response does not reveal which one failed. |
| 401 | `INVALID_CLIENT` | The application is unknown or is not available to the user's organization. |
| 403 | `CLIENT_INACTIVE` | The application exists for the user's organization but is inactive. |
| 409 | `MULTIPLE_ORGANIZATIONS_NOT_SUPPORTED` | The authenticated user has memberships in more than one organization. |
| 500 | `API_AUTH_SECRET_MISSING` | `API_AUTH_SECRET` is not configured at runtime. |

## Access Token

Access tokens are JWTs signed with `jose`.

Algorithm:

```text
HS256
```

Lifetime:

```text
3600 seconds
```

Payload:

```json
{
  "sub": "user_id",
  "email": "usuario@dominio.cl",
  "appId": "external_app_id",
  "clientId": "opco_app_...",
  "type": "access",
  "iat": 1234567890,
  "exp": 1234571490
}
```

The `iat` and `exp` claims are generated by the JWT signer.

`organizationId` is not included in the token. Authorization derives the user's organization and app ownership from the database on every protected request.

## Refresh Token

Refresh tokens are opaque random strings with the `opco_rt_` prefix. They are not JWTs and do not carry claims. Operational Core stores only an HMAC-SHA256 hash of the refresh token using `API_AUTH_SECRET`; the plain token is only returned to the client once.

Lifetime:

```text
2592000 seconds
```

Every successful refresh:

- validates that the token exists, is not expired, and is not revoked;
- verifies `User.active`, `ExternalApp.active`, and current organization membership;
- revokes the used token;
- creates a replacement token in the same `familyId`;
- returns a new 1 hour access token.

If an already-rotated refresh token is reused, Operational Core revokes every active token in that family and rejects the request with `REFRESH_TOKEN_REUSED`.

Expired refresh token rows can be deleted later by a maintenance task. No cron is required for runtime correctness.

## POST /api/v1/auth/refresh

Web request:

```http
POST /api/v1/auth/refresh
Origin: https://client.opco.cl
Cookie: opco_api_refresh_token=...
```

Native request:

```http
POST /api/v1/auth/refresh
X-Opco-Client-Platform: native
Content-Type: application/json
```

```json
{
  "refreshToken": "opco_rt_..."
}
```

Success response:

```json
{
  "ok": true,
  "data": {
    "accessToken": "...",
    "tokenType": "Bearer",
    "expiresIn": 3600
  }
}
```

Native responses include the rotated `refreshToken` in `data`; Web responses rotate the HttpOnly cookie and never expose the refresh token in JSON.

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_JSON` | Native request body is not valid JSON. |
| 400 | `INVALID_REFRESH_BODY` | Native request body does not include a refresh token. |
| 401 | `REFRESH_TOKEN_MISSING` | No refresh token was provided. |
| 401 | `REFRESH_TOKEN_INVALID` | Refresh token hash was not found. |
| 401 | `REFRESH_TOKEN_EXPIRED` | Refresh token expired. |
| 401 | `REFRESH_TOKEN_REVOKED` | Refresh token was manually revoked. |
| 401 | `REFRESH_TOKEN_REUSED` | A previously rotated token was reused; the token family was revoked. |
| 401 | `REFRESH_USER_NOT_FOUND` | User no longer exists. |
| 401 | `REFRESH_USER_INACTIVE` | User is inactive. |
| 401 | `REFRESH_APP_INVALID` | App was deleted or no longer belongs to the user's organization. |
| 403 | `REFRESH_APP_INACTIVE` | App is inactive. |
| 403 | `REFRESH_ORIGIN_INVALID` | Cookie refresh request came from an unauthorized origin. |
| 409 | `MULTIPLE_ORGANIZATIONS_NOT_SUPPORTED` | The user has memberships in more than one organization. |
| 500 | `API_AUTH_SECRET_MISSING` | `API_AUTH_SECRET` is not configured at runtime. |

## POST /api/v1/auth/logout

Logout revokes the current refresh token/session and is idempotent.

Web uses the HttpOnly cookie and clears it:

```http
Set-Cookie: opco_api_refresh_token=; HttpOnly; Secure; SameSite=None; Path=/api/v1/auth; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT
```

Native can provide the refresh token in JSON:

```json
{
  "refreshToken": "opco_rt_..."
}
```

Success response:

```json
{
  "ok": true,
  "data": {
    "revoked": true
  }
}
```

## GET /api/v1/me

Returns the authenticated API user.

Required header:

```http
Authorization: Bearer <accessToken>
```

Success response:

```json
{
  "ok": true,
  "data": {
    "app": {
      "id": "external_app_id",
      "clientId": "opco_app_...",
      "name": "Bodega",
      "slug": "bodega"
    },
    "user": {
      "id": "user_id",
      "email": "usuario@dominio.cl",
      "name": "Nombre"
    }
  }
}
```

`name` can be `null` because the Prisma `User.name` field is nullable.

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | `TOKEN_MISSING` | Authorization header is missing. |
| 401 | `INVALID_AUTHORIZATION_SCHEME` | Authorization header is not exactly a Bearer token. |
| 401 | `TOKEN_INVALID` | Token cannot be verified or does not contain the expected access-token claims. |
| 401 | `TOKEN_EXPIRED` | Token expiration has passed. |
| 401 | `TOKEN_USER_NOT_FOUND` | Token is valid, but the referenced user no longer exists. |
| 401 | `TOKEN_APP_INVALID` | Token app was deleted, no longer matches its `clientId`, or no longer belongs to the user's organization. |
| 403 | `TOKEN_APP_INACTIVE` | Token app is inactive. |
| 409 | `MULTIPLE_ORGANIZATIONS_NOT_SUPPORTED` | The authenticated user has memberships in more than one organization. |
| 500 | `API_AUTH_SECRET_MISSING` | `API_AUTH_SECRET` is not configured at runtime. |

## GET /api/v1/context

Returns the authenticated user's operational context: the single organization currently supported by the product rules and the active contracts available inside that organization.

Required header:

```http
Authorization: Bearer <accessToken>
```

Success response:

```json
{
  "ok": true,
  "data": {
    "organization": {
      "id": "org_id",
      "name": "Organizacion"
    },
    "contracts": [
      {
        "id": "contract_id",
        "name": "Contrato",
        "role": "ADMIN"
      }
    ]
  }
}
```

`organization` is the organization reached through the authenticated user's `Membership`. `contracts` contains only active contracts from that organization. The `role` value is the effective membership role for that organization and is currently either `ADMIN` or `MEMBER`.

If the user belongs to an organization that has no active contracts, `contracts` is an empty array.

The active contract is not persisted in the API session or token. API clients remain responsible for selecting a contract from this response and sending that `contractId` to contract-scoped endpoints.

The request is authenticated as user plus external application. The app is not duplicated in `/context`; use `/me` to inspect the authenticated app identity.

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | `TOKEN_MISSING` | Authorization header is missing. |
| 401 | `INVALID_AUTHORIZATION_SCHEME` | Authorization header is not exactly a Bearer token. |
| 401 | `TOKEN_INVALID` | Token cannot be verified or does not contain the expected access-token claims. |
| 401 | `TOKEN_EXPIRED` | Token expiration has passed. |
| 401 | `TOKEN_USER_NOT_FOUND` | Token is valid, but the referenced user no longer exists. |
| 401 | `TOKEN_APP_INVALID` | Token app was deleted, no longer matches its `clientId`, or no longer belongs to the user's organization. |
| 403 | `TOKEN_APP_INACTIVE` | Token app is inactive. Existing tokens stop working after the app is disabled. |
| 404 | `OPERATIONAL_CONTEXT_NOT_FOUND` | The authenticated user has no membership and therefore no organization context. |
| 409 | `MULTIPLE_ORGANIZATIONS_NOT_SUPPORTED` | The authenticated user has memberships in more than one organization. |
| 500 | `API_AUTH_SECRET_MISSING` | `API_AUTH_SECRET` is not configured at runtime. |

## Contract Authorization

Reusable API helpers authenticate the Bearer token, load the real user, validate the token app still exists and is active, load the requested active contract, and verify server-side that the user has a membership in the contract's organization.

Clients cannot provide `organizationId` or `role`; both are derived server-side.

Status policy:

| Status | Meaning |
| --- | --- |
| 401 | The request is not authenticated, the token is invalid/expired, the token user no longer exists, or the token app is invalid/cross-tenant/deleted. |
| 403 | The user and app are authenticated, but the app is inactive, or the active contract exists but belongs to an organization where the user has no membership. |
| 404 | The requested active contract does not exist. Inactive contracts are treated as unavailable. |
| 503 | Operational Core cannot validate the database-backed auth or contract context because PostgreSQL is temporarily unavailable. The response code is `DB_UNAVAILABLE`, not a token or permission error. |

This preserves organization isolation: changing a `contractId` cannot grant access to another organization's contract.

## Client Views

### GET /api/v1/contracts/:contractId/views

Returns the active AppViews assigned to the authenticated user inside the requested contract. This endpoint powers Opco Client navigation and experience discovery.

Required header:

```http
Authorization: Bearer <accessToken>
```

Success response:

```json
{
  "ok": true,
  "data": {
    "views": [
      {
        "id": "view_id",
        "name": "Maestro de Materiales",
        "slug": "maestro-materiales",
        "icon": "package",
        "type": "RECORDS",
        "config": {
          "entityTypeId": "entity_type_id"
        },
        "sortOrder": 10
      }
    ]
  }
}
```

Only views that match all of these conditions are returned:

- belong to the requested active contract;
- are assigned to the authenticated user through `UserAppViewAccess`;
- have `active = true`;
- have a valid server-parseable config.

If the user has contract access but no assigned active views, the endpoint returns:

```json
{
  "ok": true,
  "data": {
    "views": []
  }
}
```

Views are ordered by `sortOrder`, then `name`.

Config shapes by `type`:

```json
{
  "RECORDS": {
    "entityTypeId": "entity_type_id"
  },
  "WORKFLOW attendance": {
    "workflowKey": "attendance",
    "sourceEntityTypeId": "source_entity_type_id",
    "targetEntityTypeId": "target_entity_type_id",
    "personFieldId": "person_relation_field_id",
    "dateFieldId": "date_field_id",
    "statusFieldId": "status_select_field_id",
    "defaultCheckInOptionId": "field_option_id_for_default_check_in",
    "observationFieldId": "optional_textarea_field_id"
  },
  "WORKFLOW state-update": {
    "workflowKey": "state-update",
    "sourceEntityTypeId": "source_entity_type_id",
    "targetEntityTypeId": "target_entity_type_id",
    "subjectFieldId": "subject_relation_field_id",
    "stateFields": [
      {
        "fieldId": "state_select_field_id",
        "required": true,
        "defaultOptionId": "optional_field_option_id"
      }
    ],
    "extraFieldIds": ["optional_extra_field_id"],
    "dateFieldId": "optional_date_field_id",
    "uniqueness": {
      "mode": "subject-date"
    },
    "historyMode": "update-current"
  },
  "BOARD": {
    "entityTypeId": "entity_type_id",
    "groupByFieldKey": "estado"
  },
  "DASHBOARD": {
    "entityTypeIds": ["entity_type_id"]
  }
}
```

The response does not include `createdAt`, `updatedAt`, assignment ids, users, or administrative metadata.

If a stored AppView has invalid config, Opco omits that view from the response and logs a server-side diagnostic with the view id. This prevents one corrupted view from breaking the whole client navigation payload.

Important: AppView access controls which experience appears to the user. It is not a full data-permission boundary. Entity and record endpoints continue to perform their own server-side authorization. In this stage, data access is still based on contract membership because granular entity permissions do not exist yet.

### GET /api/v1/contracts/:contractId/views/:appViewId/workflow/state-update

Returns the configured generic state-update workflow. The AppView must be active, assigned to the authenticated user, belong to the contract, and use a workflow registered as compatible with the state-update engine. Current compatible keys are `state-update` and the `attendance` preset.

Query:

```http
?date=YYYY-MM-DD&search=excavadora&subjectRecordId=optional_source_record_id
```

`search` returns a limited set of matching source records, currently 20. It searches `displayName` and searchable fields of the source EntityType. `subjectRecordId` returns one selected source record. Without `search` or `subjectRecordId`, `subjects` is empty so clients do not accidentally fetch a full roster/catalog.

The response includes workflow metadata, source/target entity metadata, configured state fields, active options, extra field definitions, current state per returned subject when uniqueness applies, latest events, and summary counts.

State field option ids are `FieldOption.id` values. Clients should cache definitions/options for offline use, but POST must still send option ids, not labels or persisted option values.

### POST /api/v1/contracts/:contractId/views/:appViewId/workflow/state-update

Creates a state-update event or updates the current matching target record according to the AppView config. Compatibility presets such as `attendance` keep their stored `workflowKey` but are normalized internally to the state-update config shape for this endpoint.

Request:

```json
{
  "clientRequestId": "device-request-id",
  "subjectRecordId": "source_record_id",
  "date": "2026-08-22",
  "states": {
    "state_field_id": "field_option_id"
  },
  "extraValues": {
    "extra_field_id": "Optional note"
  },
  "overwrite": false,
  "expectedUpdatedAt": "2026-08-22T12:00:00.000Z"
}
```

Only field ids configured on the AppView are accepted. `stateFields` must be single `SELECT` fields and the submitted option id must belong to the same field and be active. `extraValues` may include supported normal target fields: `TEXT`, `TEXTAREA`, `INTEGER`, `DECIMAL`, `MONEY`, `BOOLEAN`, `DATE`, `TIME`, `DATETIME`, `SELECT`, and `RELATION`.

Results use `CREATED`, `UNCHANGED`, `UPDATED`, `CONFLICT`, and `ERROR`. When `historyMode = "update-current"` finds an existing record and any requested state differs, the result is `CONFLICT` and includes the existing `recordId`, `updatedAt`, requested states, and per-field differences. Overwriting requires `overwrite: true` plus an `expectedUpdatedAt` that still matches the current record.

`clientRequestId` is optional but recommended for offline/retryable clients. It is scoped to the external app, workflow operation, and AppView. Reusing the same id with a different payload returns `IDEMPOTENCY_CONFLICT`.

### GET /api/v1/contracts/:contractId/views/:appViewId/workflow/attendance

Returns the configured attendance workflow state for one date. The AppView must be active, assigned to the authenticated user, belong to the contract, and use `workflowKey = "attendance"`. Attendance statuses are the active `FieldOption` rows of the configured Estado field. Attendance remains a compatibility adapter over the generic state-update engine and keeps its existing request/response shape.

Query:

```http
?date=YYYY-MM-DD&search=ana&personRecordId=optional_person_record_id
```

`search` returns a limited set of matching people, currently 20. It searches `displayName` and searchable fields of the source EntityType. `personRecordId` returns one selected person. Without `search` or `personRecordId`, `items` is empty so the client can render the checking screen without loading the full roster.

Success response:

```json
{
  "ok": true,
  "data": {
    "appView": {
      "id": "app_view_id",
      "name": "Tomar asistencia",
      "slug": "tomar-asistencia"
    },
    "date": "2026-08-22",
    "statuses": [
      {
        "optionId": "present_option_id",
        "label": "Presente",
        "isDefaultCheckIn": true
      },
      {
        "optionId": "late_option_id",
        "label": "Atraso",
        "isDefaultCheckIn": false
      }
    ],
    "summary": {
      "totalRegistered": 18
    },
    "latest": [
      {
        "attendanceRecordId": "attendance_record_id",
        "person": {
          "id": "person_record_id",
          "displayName": "Ana Pérez"
        },
        "statusOptionId": "present_option_id",
        "statusLabel": "Presente",
        "updatedAt": "2026-08-22T12:00:00.000Z"
      }
    ],
    "sourceEntityType": {
      "id": "people_entity_type_id",
      "name": "Personas"
    },
    "targetEntityType": {
      "id": "attendance_entity_type_id",
      "name": "Asistencias"
    },
    "items": [
      {
        "person": {
          "id": "person_record_id",
          "displayName": "Ana Pérez"
        },
        "attendance": {
          "recordId": "attendance_record_id",
          "statusOptionId": "present_option_id",
          "statusLabel": "Presente",
          "observation": null,
          "updatedAt": "2026-08-22T12:00:00.000Z"
        }
      },
      {
        "person": {
          "id": "person_without_attendance_id",
          "displayName": "Juan Soto"
        },
        "attendance": null
      }
    ]
  }
}
```

### POST /api/v1/contracts/:contractId/views/:appViewId/workflow/attendance

Creates or confirms attendance entries for one date. `clientRequestId` is optional but recommended for retryable clients. The workflow is functionally idempotent for the same Persona + Fecha + status: retries do not create duplicate attendance records.

The API uses `statusOptionId` from the GET `statuses` list. Internally, Operational Core persists the selected option's real `FieldOption.value`. The client does not send or depend on the internal value.

Request:

```json
{
  "clientRequestId": "device-request-id",
  "date": "2026-08-22",
  "entries": [
    {
      "personRecordId": "person_record_id",
      "statusOptionId": "present_option_id",
      "observation": "Opcional"
    }
  ]
}
```

Per-entry result values:

- `CREATED`: no attendance existed for Persona + Fecha and a record was created.
- `UNCHANGED`: an attendance existed with the same status; no write was performed.
- `CONFLICT`: an attendance existed with a different status; no write was performed.
- `UPDATED`: an explicit overwrite was accepted and audited.
- `ERROR`: the entry is invalid, for example the person does not belong to the configured source EntityType.

Conflict response inside a successful batch:

```json
{
  "personRecordId": "person_record_id",
  "result": "CONFLICT",
  "existing": {
    "recordId": "attendance_record_id",
    "statusOptionId": "present_option_id",
    "statusLabel": "Presente",
    "updatedAt": "2026-08-22T12:00:00.000Z"
  },
  "requested": {
    "statusOptionId": "late_option_id",
    "statusLabel": "Atraso"
  }
}
```

To overwrite, resend that entry with `overwrite: true` and `expectedUpdatedAt` from the conflict. If the existing attendance changed again before confirmation, the API returns a fresh `CONFLICT` instead of overwriting blindly.

## Dynamic Entities

All dynamic entity endpoints require:

```http
Authorization: Bearer <accessToken>
```

The Bearer token must identify a valid user and an active `ExternalApp`. The requested `contractId` must be an active contract in the authenticated user's organization.

### GET /api/v1/contracts/:contractId/entities

Lists active dynamic entity types available in a contract.

Success response:

```json
{
  "ok": true,
  "data": {
    "entities": [
      {
        "id": "entity_type_id",
        "name": "Equipos",
        "slug": "equipos",
        "icon": "warehouse",
        "nature": "MASTER",
        "active": true
      }
    ]
  }
}
```

Only active `EntityType` rows are returned. Inactive entity types remain stored in Opco but are not exposed by this normal external API view.

### GET /api/v1/contracts/:contractId/entities/:entityTypeId

Returns the active entity definition needed by a generic external client.

Success response:

```json
{
  "ok": true,
  "data": {
    "entity": {
      "id": "entity_type_id",
      "name": "Equipos",
      "slug": "equipos",
      "icon": "warehouse",
      "nature": "MASTER",
      "active": true,
      "fields": [
        {
          "id": "field_id",
          "key": "codigo",
          "name": "Código",
          "type": "TEXT",
          "required": true,
          "unique": false,
          "searchable": true,
          "multiple": false,
          "active": true,
          "order": 1,
          "config": {
            "validation": {},
            "display": {}
          }
        }
      ]
    }
  }
}
```

The entity DTO uses `icon` as a nullable stable key from Opco's controlled entity-icon catalog. It is never SVG, HTML, or a React component name. Clients can map keys such as `warehouse` to their own local icon library. Entities without a configured icon return `icon: null`.

The entity DTO uses `nature` as a required stable enum string. Current values are `MASTER`, `TRANSACTION`, and `REFERENCE`. This classifies the semantic nature of the entity type itself; it is not a view type and does not define client navigation, permissions, or workflows.

The field DTO uses `EntityField.key` as the stable external key. Record DTOs use the same key inside `values`.

Only active `EntityField` rows are included. Historical values for inactive fields remain stored in Opco but are not returned by this normal external API view.

For `SELECT` and `MULTISELECT`, fields include options:

```json
{
  "options": [
    {
      "id": "option_id",
      "label": "Activo",
      "value": "activo",
      "active": true,
      "order": 1
    }
  ]
}
```

For `RELATION`, fields include relation metadata inside `config.relation`:

```json
{
  "config": {
    "relation": {
      "targetEntityTypeId": "target_entity_type_id",
      "relationKind": "MANY"
    },
    "validation": {},
    "display": {}
  }
}
```

Entity definitions do not include related records.

### GET /api/v1/contracts/:contractId/entities/:entityTypeId/records

Lists records for an active entity type.

Query params:

| Param | Default | Meaning |
| --- | --- | --- |
| `page` | `1` | Positive page number. |
| `pageSize` | `50` | Positive page size, maximum `100`. |
| `search` | none | Text search using the current Opco searchable-field rules. |
| `sort` | `createdAt DESC, id DESC` | `displayName`, `updatedAt`, or `field:<fieldKey>`. |
| `direction` | `desc` | `asc` or `desc`. Used only with explicit `sort`. |

Success response:

```json
{
  "ok": true,
  "data": {
    "records": [
      {
        "id": "record_id",
        "displayName": "EQ-001",
        "updatedAt": "2026-08-19T18:32:10.123Z",
        "values": {
          "codigo": "EQ-001",
          "monto": "123.45"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 50,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

Records are never returned as raw `EntityRecord`/`EntityValue` Prisma objects. `values` is keyed by `EntityField.key`.

`updatedAt` is an ISO 8601 UTC string generated by the server/database from `EntityRecord.updatedAt`, for example `2026-08-19T18:32:10.123Z`. It represents the last server-side modification of the record and can be used by clients as the remote version observed for optimistic offline conflict detection. It is observable only in this stage; record write endpoints do not yet enforce it as a server-side precondition.

### POST /api/v1/contracts/:contractId/entities/:entityTypeId/records

Creates one record in an active entity type.

Request:

```json
{
  "clientRequestId": "external-system-request-123",
  "displayName": "Nombre opcional",
  "values": {
    "codigo": "EQ-001",
    "monto": "123.45"
  }
}
```

`clientRequestId` is mandatory and is used for persistent idempotency. It must be unique per external app, operation, and entity type. Repeating the same `clientRequestId` with the same payload returns the existing created record. Repeating it with a different payload returns `409 IDEMPOTENCY_CONFLICT`.

`values` must be a JSON object keyed by `EntityField.key`. Only active fields can be written. Inactive fields remain stored historically but are rejected for new API writes.

Success response:

```json
{
  "ok": true,
  "data": {
    "record": {
      "id": "record_id",
      "displayName": "EQ-001",
      "updatedAt": "2026-08-19T18:32:10.123Z",
      "values": {
        "codigo": "EQ-001",
        "monto": "123.45"
      }
    }
  }
}
```

New writes return status `201`. Idempotent replays of the same request return status `200` and do not create a second record or audit event.

### GET /api/v1/contracts/:contractId/entities/:entityTypeId/records/:recordId

Returns one record from an active entity type.

Success response:

```json
{
  "ok": true,
  "data": {
    "record": {
      "id": "record_id",
      "displayName": "EQ-001",
      "updatedAt": "2026-08-19T18:32:10.123Z",
      "values": {
        "codigo": "EQ-001"
      }
    }
  }
}
```

The record must belong to the requested `entityTypeId`, and the entity type must belong to the requested `contractId`.

### PATCH /api/v1/contracts/:contractId/entities/:entityTypeId/records/:recordId

Updates one existing record in an active entity type.

Request:

```json
{
  "displayName": "Nombre visible opcional",
  "values": {
    "monto": null,
    "estado": "vigente"
  }
}
```

PATCH is partial:

- omitted fields are left unchanged;
- `null` clears the value when the field validation allows it;
- `displayName` changes only when the request includes it;
- active field validation, unique checks, option validation, relation validation, and cross-contract isolation use the same server-side domain helpers as the web UI.

Success response:

```json
{
  "ok": true,
  "data": {
    "record": {
      "id": "record_id",
      "displayName": "Nombre visible opcional",
      "updatedAt": "2026-08-19T18:32:10.123Z",
      "values": {
        "monto": null,
        "estado": "vigente"
      }
    }
  }
}
```

PATCH does not currently use `clientRequestId`; it is not idempotent in this stage.

### Record Value Serialization

| EntityField type | JSON value |
| --- | --- |
| `TEXT`, `TEXTAREA`, `EMAIL`, `PHONE`, `URL`, `SELECT` | `string` or `null` from `textValue`. |
| `INTEGER` | `number` or `null`. |
| `DECIMAL`, `MONEY` | `string` or `null` to avoid silent precision loss. |
| `BOOLEAN` | `boolean` or `null`. |
| `DATE` | `YYYY-MM-DD` string or `null`. |
| `DATETIME` | ISO 8601 timestamp string or `null`. |
| `TIME` | `HH:mm` string or `null`. |
| `MULTISELECT` | JSON array. Missing values return `[]`. |
| `RELATION` | A clean record reference, an array of references for `MANY`, or `null`. |
| `FILE`, `IMAGE` | Stored JSON value or `null`. Upload/storage behavior is not implemented by these read endpoints. |

Relation values are serialized as:

```json
{
  "id": "target_record_id",
  "displayName": "Persona 1",
  "entityTypeId": "target_entity_type_id"
}
```

### Record Write Value Input

| EntityField type | JSON input |
| --- | --- |
| `TEXT`, `TEXTAREA`, `EMAIL`, `PHONE`, `URL`, `DATE`, `DATETIME`, `TIME`, `SELECT` | `string` or `null`. |
| `INTEGER` | integer `number` or `null`. |
| `DECIMAL`, `MONEY` | decimal `string` or `number`, or `null`. |
| `BOOLEAN` | `boolean` or `null`. |
| `MULTISELECT` | array of option-value strings, or `null` to clear. |
| `RELATION` | target record id string, array of target record ids, or `null` to clear. |
| `FILE`, `IMAGE` | Not writable through the JSON API in this stage because upload/storage behavior is not implemented. |

All relation target ids are validated server-side. The target record must belong to the configured target entity type inside the same contract.

`TIME` values represent a local time of day without date or timezone. API clients must send canonical `HH:mm`, for example:

```json
{
  "values": {
    "hora_inicio": "08:30"
  }
}
```

Invalid hours, full dates, timestamps, and free text are rejected with the standard `INVALID_FIELD_VALUE` response. Opco clients should render `TIME` as a time picker/input and preserve the `HH:mm` contract.

### Dynamic Entity Errors

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_JSON` | Request body is not valid JSON. |
| 400 | `INVALID_RECORD_BODY` | Request body shape is invalid. |
| 400 | `UNKNOWN_FIELD` | A value key does not match an entity field. |
| 400 | `INACTIVE_FIELD` | A value key matches an inactive field and cannot be written. |
| 400 | `INVALID_FIELD_VALUE` | A field value fails type or configured validation. |
| 400 | `INVALID_RELATION` | Relation input points to an invalid, incompatible, cross-contract, or self-referential record. |
| 400 | `UNIQUE_CONSTRAINT` | A unique field value conflicts with an existing record. |
| 400 | `INVALID_PAGINATION` | `page` or `pageSize` is invalid, or `pageSize` exceeds `100`. |
| 400 | `INVALID_SORT` | `sort` or `direction` is invalid. |
| 401 | API auth codes | Missing, invalid, expired, or stale Bearer token. |
| 403 | `CONTRACT_FORBIDDEN` / `TOKEN_APP_INACTIVE` | Authenticated caller cannot access the contract, or the app is inactive. |
| 409 | `IDEMPOTENCY_CONFLICT` | POST reused `clientRequestId` with a different payload. |
| 404 | `CONTRACT_NOT_FOUND` | Active contract does not exist. |
| 404 | `ENTITY_NOT_FOUND` | Active entity type does not exist in the contract. |
| 404 | `RECORD_NOT_FOUND` | Record does not exist inside the requested entity type. |

## Multiple Memberships

The current product flow prevents adding a user who already belongs to another organization, so Operational Core behaves as a one-user, one-organization product. The Prisma schema still permits multiple memberships.

The external API does not silently choose between multiple organizations. When `/api/v1/context` detects memberships in more than one organization, it returns `409 MULTIPLE_ORGANIZATIONS_NOT_SUPPORTED`.

## External Applications

Operational Core can register external applications for an organization. An `ExternalApp` represents an application that may consume Opco through the external API in later stages, such as Bodega, Mensuras, Maquinaria, or Relaciones Laborales.

Current model:

```text
Organization 1 -> N ExternalApp
```

Fields implemented:

| Field | Meaning |
| --- | --- |
| `id` | Internal application identifier. |
| `organizationId` | Owning organization. It is assigned server-side. |
| `clientId` | Public, non-secret client identifier generated server-side. |
| `name` | Human-readable application name. |
| `slug` | Normalized application identifier, unique within the organization. |
| `active` | General enabled/disabled switch for the application. |
| `createdAt` | Creation timestamp. |
| `updatedAt` | Update timestamp. |

`clientId` identifies the external application during `/api/v1/auth/login`. It is not a secret and can be displayed/copied from administration. Do not use `clientId` as proof of trust by itself.

`active = true` means the application is enabled. `active = false` means the application is disabled but its configuration remains stored. Inactive apps cannot log in. If an app is disabled after an access token has been issued, subsequent protected API calls reject that token with `TOKEN_APP_INACTIVE`.

Administration is available in the web app at `/app/settings/apps` for organization `ADMIN` users. `MEMBER` users cannot administer external applications. The organization is always derived from the authenticated admin user; forms do not decide `organizationId`.

This stage does not expose public `/api/v1/apps` endpoints.

The current migration backfills existing apps with `opco_app_` plus a random PostgreSQL `gen_random_uuid()` value. New apps use the same `opco_app_` prefix with server-side Node crypto randomness. Both values are non-secret identifiers and are not based on the app slug.

Current limitations:

- No client credentials or client secrets exist yet.
- No scopes exist yet.
- No contracts are restricted by application yet.
- Audit events for external applications are not implemented because the current audit model is contract-centered through `AuditEvent.contractId`.

## API Idempotency

`POST /api/v1/contracts/:contractId/entities/:entityTypeId/records` persists idempotency keys in `ApiIdempotencyKey`.

The unique key is:

```text
externalAppId + operation + clientRequestId
```

The operation currently includes the contract id and entity type id for record creation. The persisted request hash is a SHA-256 hash of a stable JSON representation of the accepted create payload. The table stores the created `entityRecordId` after the record write succeeds.

This model makes retries safe after network failures and protects concurrent duplicate POSTs. Replays with the same payload return the original record. Replays with a different payload are rejected with `409 IDEMPOTENCY_CONFLICT`.

`clientRequestId`, request hashes, and `entityRecordId` are not secrets, but logs should still avoid dumping full request bodies from external systems.

## Health

`GET /api/v1/health` is public liveness only. It does not query PostgreSQL and returns:

```json
{
  "ok": true,
  "data": {
    "service": "opco-api",
    "version": "v1"
  }
}
```

`GET /api/v1/ready` is public readiness. It performs a minimal PostgreSQL check through Prisma.

Ready:

```json
{
  "status": "ready"
}
```

Database unavailable:

```json
{
  "status": "not_ready",
  "reason": "database"
}
```

Readiness never runs migrations or modifies data.

## Current Limitations

- No refresh tokens.
- Organization and contract context is available only through `GET /api/v1/context`.
- No batch endpoints for external dynamic records yet.
- No delete endpoints for external dynamic records yet.
- PATCH is not idempotent yet.
- `FILE` and `IMAGE` fields are not writable through JSON API.
- No granular permission model for external API endpoints yet.
- No API-specific CORS policy yet.
- No API keys.
- No OAuth.
