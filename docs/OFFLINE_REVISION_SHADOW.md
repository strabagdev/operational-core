# Offline revision manifest — Core shadow stage, 11-11-2026

Status: local diagnostic implementation. No Client integration, no skipped reads, no new
freshness policy. `mode=shadow`, `reuseAllowed=false`, `clientMaySkipReads=false` and
`revisionBoundBusinessReads=false` are unconditional. A tracking checksum is not permission
or certification of an offline snapshot.

## Architecture

`GET /api/v1/contracts/:contractId/offline/manifest?version=1&date=YYYY-MM-DD&month=YYYY-MM`
uses the existing Bearer/contract access helper. It then re-reads active app/user/organization,
contract, membership and assigned active views inside a read-only REPEATABLE READ transaction.
The builder refuses writable or READ COMMITTED transactions. Metadata, configuration,
authorization and committed data revisions all come from that one snapshot. Existing business
GETs do not gain version stamps in this stage and remain unchanged.

Response: schema/representation version, epoch, user/app/org/contract authorization fingerprint,
views revision, entity definition hashes/data revisions, per-experience dependencies and requested
coverage, tracking attestation, manifest revision and snapshot time. Snapshot time is excluded
from content hashes. Data revisions are decimal strings, never JavaScript numbers. Object keys
are canonicalized; configured arrays retain order. No records, names, values, credentials or
business request payloads are returned by the manifest.

Date/month and repeated appViewId are optional, bounded and validated. A selected view must
be active and assigned. No date/month is inferred. Attendance month enumerates requested days,
not prepared days. Every coverage descriptor has certified=false. Composite identity requires
its context and is not resolved here. RECORDS/REPORT/PANEL and unsupported categories remain
metadata-only; no collection or query is downloaded. Unknown/invalid/missing dependencies are
explicit, never empty/complete. Limits: 100 assigned views and 200 entity definitions; overflow
is an error, not a partial manifest masquerading as complete. Definition reads are bounded.

The dependency closure follows configured entity IDs, active relation targets in historical flat
or nested config, and schedule catalogs/revisions. Cycles are visited once. Related label changes
invalidate via the target entity's data revision; SELECT options and field configuration are
hashed directly, including updates that do not touch a parent updatedAt. Permissions are
re-read, never inferred from showInClient or a cached role. Hashing does not perform a new
business-validation pass for each workflow's configured field roles; malformed definitions
still require the normal workflow validation. Reuse remains forbidden.

## Durable revision migration

Migration `20261111193000_offline_revision_shadow` is additive: three tables, three functions,
25 ALWAYS triggers. It rewrites no EntityRecord/Value/Relation, displayName or historical
identity. It installs/initializes tracking atomically with writers locked. The prior 25 migrations
remain unchanged. No production migration has run.

- OfflineRevisionEpoch: installation epoch, contract version and installed-code checksum.
- OfflineEntityRevision: contract/entity key and BIGINT revision; no business foreign keys so
  tombstones survive entity/contract deletion and administrative moves.
- OfflineRevisionPending: transaction-private bookkeeping, keyed by transaction/contract/entity.
  It is empty after commit and is not an offline queue or a synchronization/outbox mechanism.

Statement-level transition-table triggers cover INSERT/UPDATE/DELETE/TRUNCATE on EntityType,
EntityRecord, EntityValue, EntityRelation, StateUpdateIdentityDefinition and StateUpdateIdentitySlot.
Old and new scopes are included. EntityType and persistent registrations cover deletion cascades
where parents are already invisible. Empty TRUNCATE invalidates conservatively. A no-op SQL
mutation may advance a revision: equality is the only meaningful comparison, not event counts.

Writers enqueue affected keys without locking shared counters during business statements.
The deferred constraint trigger aggregates all keys in stable order at commit, upserts revisions
and removes its private rows. Business changes and revisions commit/rollback together. Further
writes after SET CONSTRAINTS ALL IMMEDIATE are tracked too. Opposite-order disjoint business
writes reproduced a deadlock with immediate counters; deferred commit flush is the GREEN fix.
This does not claim to eliminate arbitrary PostgreSQL/business-lock deadlocks. Forcing early
constraints in custom concurrent SQL is not part of the normal Core writer protocol and needs
separate lock-order validation before future reuse.

Catalog attestation checks installed trigger count/enabled mode and trigger/function definitions.
Missing/disabled/changed tracking reports incomplete and changes the diagnostic fingerprint;
missing migration returns 503. An owner/superuser can bypass bookkeeping or change its history.
Re-enabling tracking cannot prove there was no historical gap: rotate epoch/reaccredit after any
gap, counter reset or database restore. Deployment needs a role/DDL privilege and operational
policy before revision-based reuse. Never use this stage's diagnostics to skip Client reads.

## Writer coverage

| Family | Tracking / validation |
| --- | --- |
| entity-records create/update/permanent delete | Actual service calls; parent/values/relations and tombstones. |
| entity-records syncEntityRelations | Actual service; source-link changes and target-label dependency. |
| api-record-writes create/PATCH | Actual service; replay, invalid relation, no mutation on rejection. |
| entity-import | Actual Excel create/update and its raw/bulk displayName path. |
| entity-config displayName recalculation | Actual field-primary edit and bulk SQL UPDATE of records. |
| STATE_UPDATE / Attendance | Actual writes, context RELATION, UNCHANGED, CONFLICT, overwrite/base, idempotent replay. |
| state-update identity definitions/slots | All data operations, including independent slot updates. |
| state-update-schedules | Catalog/revision creation and retirement through actual services. |
| contract-admin purge | Actual archive/delete and retained revision tombstones. |
| prisma/seed.mjs | Complete seed executed twice on the isolated database; create/update/relation upsert branches. No credentials archived. |
| SQL / Prisma bulk / COPY / TRUNCATE | Actual direct DML, COPY FROM STDIN, rollback and conservative invalidation. |
| Metadata and authorization writers | Fresh snapshot hashes of actual rows, options, membership, active states and assignments. |

No normal data writer service was modified; tracking is at the database boundary, including
nested Prisma mutations, bulk SQL and cascades. `writer-inventory.json` in the backup records
static call sites and mechanism. A new business table/selection dependency must update the
inventory/projection version; diagnostics do not automatically certify future writers.
Audit/idempotency rows are not the change feed. They remain managed by existing services.

## Consistency, compatibility and recovery

The manifest itself is consistent. A counter is deferred until commit, so its builder must not
read its own uncommitted business writes. The transaction guard enforces this. Committed
concurrent changes become visible in the next manifest; an open repeatable-read snapshot keeps
its original metadata, authorization and data revision together.

Existing GET/POST APIs, Client, OPFS, pending operations, conflicts, idempotency, guards and
coverage remain unchanged. The optional new route uses JSON envelopes and no-store, not 304.
A database rollback discards business mutations/private revision work/counter advances together.
Migration rollback removes only new tracking objects; existing API reads still work and the
shadow route returns unavailable. Reapply creates a new epoch. Rollback SQL is manual and
reviewed, not an automatic production recovery or a database restore.

## Validation and limits

See backups/offline-revision-shadow/2026-11-11/ for exact tests, metrics, inventory and patch.
PostgreSQL 16 is an isolated instance on loopback with synthetic data. There is no production,
Railway, device, Client, browser/OPFS or new network deployment evidence in this stage.
Metadata/revision checking is bounded independently of 217/1000 subjects and does not select
business record/value/relation bodies. Trigger internals are included in statement duration,
not counted as separate Prisma query events. Paired bulk-write controls quantify overhead;
no extrapolation to production throughput or guaranteed latency reduction is valid.

Existing migration/schema differences (idempotency index and identity FK update actions) are
identical on HEAD's 25 migrations and this 26-migration candidate; they were not repaired.

## Conditions before Client may reuse

1. Separate approval and completed coverage audit, including administrative bypass/epoch policy.
2. Revisions attached to actual business reads in the same snapshot; pagination cannot mix them.
   Existing GETs are not revision-bound and still prohibit this activation.
3. Client receipt bound to scope, authorization, representation, epoch, revision and verified
   local content/coverage. Complete diagnostics alone cannot substitute for it.
4. Preserve partial/empty/absent distinction, interrupted reads, last available data, scopes,
   invalidations and recovery; pending/conflicts/base versions must stay intact.
5. Validate locks/performance and Core-old/new + Client-old/new compatibility in shadow comparison.

No setting can enable reuse in this implementation. It remains NO-GO for Client read omission.


## Stage 2 local continuation — 11-11-2026

[Optional revision-bound reads](REVISION_BOUND_READS.md) add a shared readBindingVector to
this shadow manifest and seals on explicitly negotiated business GETs. Legacy requests remain
unversioned and generic skip/read-reuse capabilities remain false. The migration and tracking
functions are unchanged; stage 2 is a separate reversible patch with no Client/storage changes.


## Optional compatibility negotiation — local, 13-11-2026

[Manifest v2 negotiation](OFFLINE_MANIFEST_NEGOTIATION.md) binds requested protocol versions, nonce,
period/selection and optional previous expectations to current authorized scope/vector/epoch/definitions.
It remains diagnostic and cannot certify a local receipt or physical storage. V1 and business read
seals remain compatible; no new migration or writer changes. Client integration and storage policy
gates remain pending, and no setting authorizes omission.
