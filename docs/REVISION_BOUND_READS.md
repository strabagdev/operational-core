# Revision-bound business reads — shadow protocol v1, 11-11-2026

Local stage 2 over OFFLINE_REVISION_SHADOW.md. No Client integration, download omission,
freshness-policy change, storage/outbox change or production migration. Stage 1's migration and
its three functions/25 triggers are byte-identical. This stage adds no schema or migration.

## Negotiation and compatibility

Only GET requests explicitly sending `readRevisionVersion=1` enter the new protocol. Existing
requests invoke their unchanged reader without a new transaction or response member. POST/PATCH,
commands, guards, idempotency, conflicts and audit remain unchanged. The existing global Prisma
instance remains the root outside the explicit read scope; it is never reconfigured or replaced
per request. Native code and Client are not changed.

Supported GETs under `/api/v1/contracts/:contractId`:

| Path | Scope preserved |
| --- | --- |
| `/entities` | Active definition list. |
| `/entities/:entityTypeId` | Dynamic definition and SELECT/RELATION metadata. |
| `/entities/:entityTypeId/records` | Existing search, presence predicate, sort, page and count. |
| `/entities/:entityTypeId/records/:recordId` | Single record and related labels. |
| `/views` | Assigned active definitions. |
| `/views/:appViewId/workflow/attendance` | Date, manual/field search, current, context, latest and summary. |
| `/views/:appViewId/workflow/state-update` | Bootstrap/search, composite context, current and latest pagination; current batches remain explicit event/null/error. |
| `/panels/:appViewId` | Existing dataset, filters, search, metrics, related values and pagination. |
| `/reports/:appViewId` | Existing TABLE/MATRIX/CURRENT_STATUS/LATEST_BY_RELATION and STATE_UPDATE projection. |

No new REPORT query capabilities, pagination or coverage capabilities. BOARD/DASHBOARD unsupported paths,
write responses, unique-validation POST and auth/health endpoints are not revision-sealed.

Success keeps the exact legacy `data` DTO and adds a top-level `readRevision` envelope member:
version, representationVersion, mode=shadow, reuseAllowed=false, clientMaySkipReads=false,
revision, manifestVectorRevision, epoch, authorizationFingerprint, selectionFingerprint,
requestFingerprint, contentHash, snapshot and coverageCertified=false. No ETag/304 or new CORS
headers. The versioned response is no-store. Errors are not success-sealed.

Old Core ignores unknown query parameters and will not return this member. A future Client must
reject a missing/incompatible seal explicitly; no unversioned fallback may accredit a receipt.
Old Client never opts in and keeps downloading normally. Removing this patch returns to stage 1;
there is no new migration to roll back. Stage 1 tracking remains additive and Client remains intact.

## One read-only snapshot

`withPrismaReadSnapshot` opens READ ONLY / REPEATABLE READ with maxWait 5 s / timeout 15 s.
An AsyncLocalStorage scope routes the existing shared Prisma consumers to that transaction,
including authorization, raw SQL, counts, values, relations, schedule resolution, projections and
presentation. It avoids duplicating or changing their business queries. Root writes in unrelated
async contexts remain outside it. Connection/transaction escape and nested scopes are rejected;
PostgreSQL also rejects any write in the read transaction. There is no transaction retry or
fallback on failure. A delayed child retains its closed transaction and cannot fall back to root.

The authorization helper and workflow authorization execute inside that snapshot; the manifest
builder rechecks the same scope there. A revocation committed while a read is already running
is visible to the next snapshot, not retroactively to the first. The response is authorized as of
its snapshot, not a promise that permissions remain valid after it returns or while offline.

The source inventory has one shared runtime Prisma root and no independent cached business-read
results in these paths. A future helper using a separate client/cached promise must participate
in this scope or explicitly lose eligibility. Tests exercise the real handlers and PostgreSQL,
including a negative control where nested reads escape the scope.

## Link with the public manifest

The shadow manifest now includes `readBindingVector` (version, representationVersion,
available, revision) and `readDefinitionsRevision`. Both the manifest and the sealed reads
compute this vector from the same snapshot algorithm:

- app/user/organization/contract and authorization fingerprint;
- epoch and installed-trigger/function attestation;
- all bounded contract entity definitions, options, identity definitions and durable revisions;
- all bounded contract AppView definitions, including inactive/unassigned policy owners and
  workflows referenced by REPORT. Only hashes are exposed; no hidden definitions or record
  bodies are disclosed by the manifest.

The initial read vector is deliberately **conservative at contract scope**. Any tracked entity
mutation or configuration change can invalidate every sealed selection in that contract. It
prevents under-invalidation; this stage does not claim per-experience traffic savings. Scope and
200-definition bounds still apply. Selective dependency vectors require separate accreditation.
The manifest's coverage/dependency descriptions remain per experience and never certify a local
copy. The shared vector ignores date/page/selection; the read token binds those separately.

Dependency traversal now follows `stateUpdateAppViewId` inside REPORT (including a backing
workflow not separately assigned), `relatedEntityTypeId`, relation targets and schedule metadata.
Opted-in data readers also check for stored cross-contract links in one EXISTS query;
normal writers reject them, and historical SQL must not make foreign label changes escape the
contract vector. This check adds relational-query cost and fails conservatively for the contract;
it neither repairs data nor changes legacy responses.
An inaccessible/invalid/missing dependency or incomplete tracking fails the opted-in read
explicitly. Unversioned requests keep their existing behavior.

`readRevision.manifestVectorRevision` equals `manifest.readBindingVector.revision` for the same
committed scope/content, irrespective of a requested manifest date or chosen AppView. The full
`manifestRevision` still hashes the diagnostic request/coverage as well and is not interchangeable.
`revision` hashes that vector, representation and the endpoint's selection/context. `contentHash`
hashes the actual serialized data independently; volatile calculatedAt/capturedAt may change it
without changing the dataset revision. It is not a signature, credential or identity.

## Pagination and batches

For an opted-in page >1, `expectedReadRevision=<64 lowercase hex>` is mandatory. Carry the
previous response's `readRevision.revision`. Core compares inside the snapshot; a different
revision returns 409 READ_REVISION_CHANGED with no page or success seal. Missing expected token
returns 409 READ_REVISION_REQUIRED. Do not combine pages before checking the response/seal.

Selection binds resource IDs, query/filter/search/order/page size and effective date/from/to;
only page is excluded from the shared selection token. Exact request fingerprints also include
page and ordered repeated subject IDs. Omitted/empty/raw equivalent JSON can conservatively
produce different selections; this is safe extra invalidation, not a new query normalization.
Different subject IDs in current batches share the same dataset selection but have different
request fingerprints; callers must carry/compare revision across batches. Per-subject errors
remain errors, never null or complete coverage. Every response has coverageCertified=false.

PostgreSQL snapshots are request-bound, not held across HTTP calls. If a writer commits between
pages, Core does not resurrect a historical snapshot: continuation fails and a future Client
must discard the tentative combined read and restart explicitly while preserving existing local
content. Old clients do not send this protocol; they retain existing pagination semantics and
are not accredited as consistent multi-page downloads by this stage.

## Atomicity, limits and next stage

Stage 1's deferred, ordered revision flush remains in the business transaction. Uncommitted or
rolled-back data and counters are invisible; committed data and counter advances become visible
together. No timestamp/count/audit feed substitutes for revisions. Its privileged-trigger-gap,
epoch rotation, database restore and lock/performance limitations remain in force. Current
attestation cannot prove there was no historical gap after re-enabling tracking.

Manifest mode remains shadow; generic revisionBoundBusinessReads/clientMaySkipReads capabilities
remain false because legacy reads are not negotiated. Explicit opt-in seals do not authorize
Client reuse. No persisted receipts exist. A future Client requires separately approved protocol
validation, scope/authorization/epoch/representation binding (bump representation on query/projection semantics changes), revision-equal pagination/batches,
verified local content/coverage, partial/empty/absent/error distinctions, safe interrupted-read
recovery and preservation of pending/conflicts/base versions. A seal alone is never proof of
complete preparation or freshness at a later instant.

The new route mode adds metadata/vector work and a bounded read transaction, plus in-memory
JSON hashing. Long or too-large reads may fail explicitly; they never become unversioned success.
No production latency, physical device, browser/OPFS, Safari or deployment result is accredited.
See backups/offline-revision-bound-reads/2026-11-11/ for checks, precise coverage and metrics.
