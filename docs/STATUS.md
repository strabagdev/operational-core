# Current Status

## PANEL Release Gate 2026-09-22

- Publication of PANEL filters, composed KPI, and AppView save feedback is **not started**. No
  release SHA exists for this scope; Core and Client remain on their development worktrees.
- Core candidate: lint, typecheck, and full Vitest suite pass (1081 passed, 8 skipped). The habitual
  `npm run build` remains blocked before application compilation: Turbopack's PostCSS worker cannot
  bind an internal port (`Operation not permitted`), including an escalated retry with a synthetic
  process-only `AUTH_SECRET` and verified local database URL. Do not publish until this check passes.
- An escalated `npm run build -- --webpack` completed successfully with the same process-only
  synthetic credentials and local database target. This validates the candidate under Webpack,
  but does not establish Railway's effective builder: versioned `package.json` has
  `build = next build` and `railway.json` has no `buildCommand` (only a pre-deploy command).
  Turbopack validation or an authoritative Railway build-command check remains pending.
- Client candidate checks are recorded in its STATUS. Manual save-feedback confirmation from the
  bottom of the editor is still pending; no manual validation is claimed.
- Once validated, publish Core before Client. If rollback is required after both are active, revert
  Client first, then Core; do not expose composed KPI configurations to older Client builds.

## AppView Editor Save Feedback 2026-09-21

- Editing an experience now returns a server-confirmed action result instead of redirecting with
  a `notice` URL parameter. The editor has one sticky bottom save action, pending/duplicate-submit
  protection, and a viewport-visible success/error notice. PANEL validation still opens the affected
  section; edits made while saving remain unsaved. No AppView data was changed.
- Focused form/action/page tests, typecheck and lint pass. Manual verification from the bottom of
  an open editor remains pending. Core build is blocked by Turbopack's internal port bind
  (`Operation not permitted`) in this execution environment, including an escalated attempt.

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
  open browser draft remains pending. The habitual build is blocked in this execution environment
  by Turbopack's internal port bind (`Operation not permitted`), including an escalated retry.
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
