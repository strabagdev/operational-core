# State Update

`state-update` is the official workflow primitive for updating operational state in a configurable target `EntityType`. It supports a source subject record, one or more state fields, optional extra fields, optional date semantics, uniqueness rules, append history, current-record updates, conflicts, audit, and offline-safe idempotency.

## Config

State-update AppViews use `type = WORKFLOW` and `workflowKey = state-update`. The config references only records and fields owned by the same contract:

- `sourceEntityTypeId`: subject entity.
- `targetEntityTypeId`: entity where events/current state are persisted.
- `subjectFieldId`: target `RELATION` field pointing to the source entity.
- `stateFields`: single `SELECT` fields with required/default option metadata.
- `extraFieldIds`: supported target fields captured with the state update.
- `dateFieldId`: optional target `DATE` field.
- `uniqueness.mode`: `none`, `subject`, or `subject-date`.
- `historyMode`: `append` or `update-current`.

`attendance` remains a compatibility preset. Its AppView keeps `workflowKey = attendance`, while the backend maps Persona, Fecha, Estado, and Observacion into this engine with `subject-date` uniqueness and `update-current` history.

## Online/Offline Contract

Clients POST this wire format:

```json
{
  "clientRequestId": "stable-device-request-id",
  "subjectRecordId": "source_record_id",
  "date": "2026-08-22",
  "states": {
    "state_field_id": "field_option_id"
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

## Conflicts

Without overwrite, an existing current record produces:

- `UNCHANGED` only when every requested state and every requested extra value match after normalization.
- `CONFLICT` when any requested state or requested extra value differs.

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
