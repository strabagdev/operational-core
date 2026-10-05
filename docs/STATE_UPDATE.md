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
