# Current Status

## Idempotent PATCH Technical Closure 2026-09-28

- The reviewed base is `5e463cb64f9be4e89ff499f4c2a1bcad2ffde79e` on `main`; all PATCH work remains
  uncommitted in this worktree. The final inventory is nine modified files plus the new
  `api-record-writes.postgres.test.ts` and `entity-record-write-lock.ts`.
- The diff is limited to the optional idempotent PATCH contract, shared record-row locking for legacy
  API/Core Web writers, focused tests, and `EXTERNAL_API`/`STATUS` documentation. CREATE and
  STATE_UPDATE behavior remain unchanged. There are no schema, migration, dependency, configuration,
  credential, local-environment, or generated-artifact changes in the publishable diff.
- Final checks passed with `DATABASE_URL` loaded only from `.env.local`, validated as
  `opco_dev@127.0.0.1:5432/opco_development`, and passed explicitly to every Core command:
  `npx tsc --noEmit`, ESLint, 109 test files/1097 tests (2 files/15 tests skipped by opt-in guards),
  production build, and `git diff --check`.
- The previously approved PostgreSQL integration remains applicable because no functional content
  changed afterward: 7/7 tests used independent real local PostgreSQL connections and controlled lock
  barriers. It was not repeated during this closure. Its synthetic data cleanup remained verified.
- Legacy PATCH remains accepted when both optional fields are omitted and remains non-idempotent
  last-writer-wins after row serialization. Core must be published before the pending Client work.
  The local `.next` output is ignored and is not a production or commit artifact.

## Idempotent RECORDS PATCH 2026-09-28

- Operational Core now accepts `clientRequestId` and `expectedUpdatedAt` together on entity-record
  PATCH. The existing `ApiIdempotencyKey` schema stores the immutable success, conflict, or
  functional validation response; retries resolve that response before checking the current record
  version. The reservation is now the first write in the same transaction as record locking, version
  comparison, values, relations, audit, and response finalization. Unexpected failures roll everything
  back, including the reservation.
- Idempotent PATCH consistently acquires the key before the entity-record row. A uniqueness violation
  leaves its transaction and replay is resolved with a fresh query; no query continues in an aborted
  transaction. Legacy API PATCH and the Core web editor retain their shared row lock/re-read path and
  last-writer-wins behavior. CREATE and STATE_UPDATE were not changed.
- Mock-based focused coverage remains for contract branching, malformed replay data, authorization, and
  validation errors. It is distinct from the PostgreSQL integration evidence below.
- Focused mocked tests passed 58/58; `npx tsc --noEmit`, full ESLint, and `git diff --check` also
  passed. This stage intentionally did not run the full suite or build.
- `api-record-writes.postgres.test.ts` passed 7/7 against explicitly supplied local
  `127.0.0.1:5432/opco_development` as `opco_dev`. Row-lock barriers and recursive
  `pg_blocking_pids` observation confirmed independent transactions were blocked before release; timing
  alone was not used to establish ordering.
- Same key/content: both callers received the identical stored response, with one record mutation, one
  `RECORD_UPDATED` audit and one idempotency row. Commit of the first executor made the waiter replay its
  result. Cancelling the first executor while both requests were blocked rolled its reservation back; the
  equal waiter then inserted the key, completed once, and produced one mutation/audit. Reusing the same
  key concurrently with different content returned `IDEMPOTENCY_KEY_REUSED` and did not apply the second
  payload.
- Distinct keys on the same initial version produced one HTTP 200 and one
  `REMOTE_VERSION_CHANGED` 409, with one mutation/audit and two durable results. The accepted response
  carried a changed `updatedAt`, and that version allowed the next update while the earlier version was
  rejected.
- Discarding the first response and retrying returned the original result with one audit. A later command
  changed the value and version; replaying the first command still returned its historical response,
  preserved the later value, and left the audit count at two. The old version then produced 409 without
  another mutation.
- Concurrent legacy PATCH and Core web update both waited on the shared row lock, completed serially,
  produced two audits and no idempotency rows; the final value matched the writer that completed last,
  confirming the documented legacy last-writer-wins behavior.
- Cancelling the real backend while its audit INSERT was blocked, after the transaction had performed its record writes but
  before commit, left zero reservations, mutations, audits, or version changes. An exact later retry completed successfully with one key, one mutation, and one audit. Thus
  new unexpected failures no longer create abandoned PATCH reservations or persist a partial success.
- Preexisting incomplete PATCH rows are intentionally untouched. Their bounded replay remains 11 waits
  of 50 ms before `409 IDEMPOTENCY_RESULT_UNAVAILABLE`; they still require explicit operational review
  because timestamps alone cannot prove that an executor is gone. Clients without the optional pair gain
  no idempotency retroactively.
- Synthetic ids used the exclusive `records_patch_pg_20260928_*` prefix. Teardown was verified with zero
  remaining organizations, records, audits, and idempotency keys. No existing records, production,
  migrations, seeds, reset, browser, full suite, build, deployment, commit, or push were used. The test
  invokes the real domain functions and Prisma/PostgreSQL transactions, not the HTTP transport; response
  loss is modeled by discarding the returned response. No schema, migration, dependency, Client
  implementation, or configuration changed.

## PANEL Existing TABLE Related Columns 2026-09-22

- A related field enabled in an existing dataset was absent from the TABLE editor's available-column list because that list read only source `transformation.fieldIds`. The dataset draft and saved PANEL contract already retained `relatedFields`; runtime support was unchanged.
- The TABLE editor now uses the dataset's shared field list, so related fields appear when the dataset draft is applied, without selecting them or changing existing column order/format. A synthetic existing-TABLE regression covers selection, serialization, and reopening; focused tests pass. Manual browser verification remains pending. No production AppViews or data changed.

## PANEL Related Fields Release 2026-09-22

- Core moved by fast-forward from `8882cd4d9eabcc7d47c9aeb02c2c53583d2f8c1b` to functional SHA `90dd4b909a7a0d83553cf518ec7488d121d00a1b` before Client. Railway reported `success` for that exact SHA on `web.opco.cl`; subsequent `/api/v1/health` and `/api/v1/ready` returned healthy/ready. No new migration or production AppView, entity, or record change was included. The existing `railway.json` pre-deploy command was unchanged and no migration was run manually.
- Direct one-hop fields from multiple source relations work in RECORDS and LATEST_BY_RELATION for TABLE columns, interactive filters, and metric conditions. A related column does not require the RELATION column to be visible. MANY remains one source row. Existing PANEL configs omit `relatedFields` and retain their behavior. Core lint, typecheck, full Vitest (1086 passed, 8 existing skips), and habitual Turbopack build passed for the functional tree; focused tests also passed after the client-safe helper import adjustment.
- Compatible rollback: revert Client to `8805de170aff78ae191e71e6f94a970c67fc3f89` first, then Core to the SHA above using forward commits/redeploys, never force push or database restore. If related fields have since been configured in production AppViews, remove those selections while new Core is active before rolling Core back; old Core does not understand the new config property.
- Manual production verification of related columns, interactive filters, and offline selection remains pending. A local screenshot confirms only selection of a related Categoria field, not those end-to-end behaviors.

## PANEL Release 2026-09-22

- Core moved by fast-forward from `aae812b97907f5b8e8b9754dcfa16b892404d0ab` to
  `a8e08724d62792e29397ca2d0356070167290abe`, then Client was published. Railway reported
  `success` for the Core service on that exact commit; public `/api/v1/health` returned 200 and
  `/api/v1/ready` returned `ready` after activation. The candidate adds no Prisma migration;
  the existing `railway.json` pre-deploy command was not changed or run manually.
- The same Core tree passed lint, typecheck, full Vitest (1081 passed, 8 skipped), and an escalated
  `npm run build -- --webpack`. The user additionally reported a successful final route summary
  from the habitual `npm run build` in WSL; no exit code was supplied or inferred. Local sandbox
  Turbopack builds remained blocked by an internal port bind. Railway's dashboard build-command
  override, if any, has not been inspected.
- Rollback order for this compatible pair: revert Client code to
  `d6142589656d5282be0c6f62f36019d0da5aafe0` first, then Core to the SHA above. Use normal
  forward commits/redeploys, not force push or database restore. Existing KPI/TABLE modules remain
  compatible; older Client displays composed KPI as unavailable. No production AppViews were edited.
- Manual verification of the new save notice from the bottom of the editor, filter controls,
  offline selection, and KPI presentation remains pending; no manual validation is claimed.

## AppView Editor Save Feedback 2026-09-21

- Editing an experience now returns a server-confirmed action result instead of redirecting with
  a `notice` URL parameter. The editor has one sticky bottom save action, pending/duplicate-submit
  protection, and a viewport-visible success/error notice. PANEL validation still opens the affected
  section; edits made while saving remain unsaved. No AppView data was changed.
- Focused form/action/page tests, typecheck and lint pass. Manual verification from the bottom of
  an open editor remains pending. The local sandbox's Turbopack port restriction did not affect
  the user-reported WSL build or the successful Railway deployment status.

## PANEL Metric Composition 2026-09-21

- KPI modules can select one metric or compose numeric metrics A and B using four fixed operations.
  Core returns a per-module result from one request, including a reason for unavailable results;
  cross-dataset B failures do not prevent the primary dataset response.
- Existing filter editor limitations below are unchanged and are not closed by this work. Publish
  Core before Client, then expose composed configurations only after Client is available. An older
  Client ignores `moduleResults` and shows a composed KPI as unavailable (`-`), while existing KPI
  and TABLE modules retain their previous rendering.
- The earlier build restrictions were resolved for validation in an allowed environment using a
  process-only synthetic `AUTH_SECRET`; the habitual build now passes. No production secret or
  configuration was used.
- Manual checks remain for editor selection/scope copy, rapid filter changes, offline compatible
  snapshots, and old KPI/TABLE rendering. No production configuration was changed.

## PANEL Filters And Grouping Review 2026-09-21

- Metric editor optional filters now read the current draft filter bindings, so a newly linked
  filter is selectable before the PANEL is saved. Existing metric `filterIds` are not auto-filled.
  A focused editor/serialization regression and the full suite pass; manual validation in the
  open browser draft remains pending. The local sandbox's Turbopack port restriction is recorded
  above separately from the user-reported WSL build.
- PANEL filters execute when bound to a dataset; table rows use provided optional filters, while
  metrics use required filters plus their selected optional `filterIds`. Filters run before
  `LATEST_BY_RELATION`; metric conditions run after it. Metrics use the full transformed set.
- The editor now selects datasets and a compatible active field for each binding, exposes the
  required switch, and lists affected TABLE/KPI modules. The schema validates internal option
  values and relation targets across bindings; metric conditions remain fixed filters.
- A pending required selection is rejected before querying the dependent dataset. A secondary
  operand with a pending required selection makes only its composed KPI unavailable.
- Validation: typecheck, lint, full suite (1079 passed, 8 skipped) and habitual Next build passed
  in an allowed environment with a process-only synthetic `AUTH_SECRET`. Manual editor and Client
  checks remain pending. No grouping was added.
- No dynamic metric breakdown by field exists in the strict PANEL contract. Any future breakdown
  needs a post-transformation grouped result and a Client presentation, separate from filters.

## Visibility Investigation 2026-09-21

- Case remains open: the user confirmed `showInClient` stays checked after saving, but the field
  is also absent from a person's full Client detail. The earlier `showInClient=false` explanation
  does not account for this observation. Web list behavior has not been confirmed.
- `/api/v1/contracts/:contractId/entities/:entityTypeId` includes all active fields, independent
  of display flags and field type; `/records/:recordId` returns a value keyed by each active field's
  `key`, using `null` (or `[]` for empty MULTISELECT) when no value is stored. Both routes require
  contract access; there is no field-level permission filter or field-count limit in this path.
- The case-specific gap is whether the field appears in `data.entity.fields` and whether its key
  appears with a nonempty value in `data.record.values` from the corresponding record endpoint.
- In a clean worktree based on `origin/main`, field visibility was traced without touching production
  data. The Web record list uses `EntityField.config.display.showInList` only; `showInClient` is
  serialized for external clients and does not affect Web columns.
- The field editor parses checked and unchecked presentation switches as explicit booleans, and
  persistence keeps `showInClient` separate from `showInList`, including explicit `false` values.
- A `RECORDS` AppView selects the entity through `config.entityTypeId`; it does not select explicit
  visible columns. Explicit field selection applies to REPORT/PANEL-style table configs.
- No name-based special case was found for Personas, Estatus, Estado, or internal record status.
  Dynamic status-like fields are treated as ordinary fields according to their configured type.

## Stabilization Closed

Selective stabilization was published to production at
`62e349089ff5faadc39fef74282b4b60387800a6`. It includes the AppView editor client/server boundary
and narrow invalid-session recovery. Production health and database readiness returned `200`, and
the deployed session-recovery behavior was identified through its public invalid-cookie response.

The user completed the remaining production read/navigation checks:

- An existing Core AppView editor opens correctly.
- A Client RECORDS experience loads and supports search.
- Client Attendance shows the list and counter for the selected date.

This closes the stabilization incident. The local environment remains separated on its preserved
local branches and private configuration. ENV-024, local destinations, PostgreSQL development
scripts, seeds, credentials, and development-only guards were not published.

The lack of an automated browser OPFS/WASM concurrency test remains a Client coverage limitation;
it is not evidence of an open production incident. Existing unit/integration checks and the user's
production confirmation remain distinct forms of evidence.

## Unrelated Pending Work

- Add day-based contract activity navigation only when that product scope is approved.
- Finish migrating remaining Web screens that predate the shared visual language.
- Confirm historical retained RECORDS errors on the affected user's device.
- Complete authenticated visual validation for protected Web listings/details beyond the editor
  confirmed during this stabilization.

Operational staging, backup, restore, and deployment hardening remain tracked in
[`OPERATIONS.md`](OPERATIONS.md) and are not started by this closure.
