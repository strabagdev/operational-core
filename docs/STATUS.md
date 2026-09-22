# Current Status

## PANEL Related Fields (local, unpublished)

- Work in `feature/panel-related-fields-2026-09-22`: direct one-hop fields from multiple source relations for RECORDS and LATEST_BY_RELATION, with TABLE columns, interactive filters, and metric conditions. MANY stays one source row; the response/config revision changes with selected fields. No production data or AppViews changed.
- Synthetic runtime tests cover two independent relations, MANY, pagination, filters, metrics, and both transformations. Core lint, typecheck, full Vitest (1086 passed, 8 existing skips), and habitual Turbopack build pass. Manual UI/offline validation and publication remain pending; do not publish this branch yet.

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
