# Offline manifest negotiation — local shadow protocol, 13-11-2026

This opt-in Core lot extends the existing authenticated manifest. It does not modify Client,
writers, migrations, business reads, download policy, OPFS or synchronization. All reuse and
read-omission permissions remain unconditionally false. Compatibility is not local coverage,
freshness for all time, or authorization to omit a read.

## Request

`GET /api/v1/contracts/:contractId/offline/manifest?version=2` uses the existing Bearer and
contract authorization. The same read-only REPEATABLE READ builder rechecks user, app,
organization, contract, membership and assigned active views. Every response on this route,
including authentication, parsing and availability errors, is `Cache-Control: no-store`.

Required single parameters:

| Parameter | Contract |
| --- | --- |
| `nonce` | 16–128 URL-safe ASCII letters/digits/underscore/hyphen. New random value per caller event. Not an auth credential. |
| `readRepresentationVersion` | Positive canonical integer <=65535; supported version 1. |
| `receiptVersion` | Same bounds; supported representation 1. |
| `storagePolicyVersion` | Same bounds; diagnostic policy 1, described below. |

Existing `date`, `month` and repeated `appViewId` retain their bounds and validation. No period
or selection is inferred. Optional single expectations are `expectedScopeFingerprint`,
`expectedManifestVectorRevision`, `expectedEpoch` and `expectedDefinitionsRevision`.
Fingerprints/revisions are lowercase SHA-256; epoch is 1–128 URL-safe characters. Unknown,
duplicate, missing, malformed or ambiguous inputs return 400. Bounded unsupported protocol
versions return a successful manifest with an explicit `incompatible` descriptor, never permission.

## Response and meaning

V2 returns the existing manifest shape with `version=2`, plus `negotiation`:

- `version=1` versions the negotiation descriptor independently of the manifest envelope.
- `nonce` echoes the request; `requestFingerprint` hashes authenticated scope plus the entire
  canonical request: nonce, requested/expected versions, dates/month and sorted requested view IDs.
- `requestedVersions` and `supportedVersions` state the protocol agreement explicitly.
- `bindings` contains current `scopeFingerprint`, `manifestVectorRevision`, `epoch` and
  `definitionsRevision`, all computed from the same authorized snapshot as the manifest.
- `comparison` distinguishes `not-requested`, `match` and `mismatch` for each optional expectation.
  `compatible` with absent expectations does not assert that a previous local receipt matches.
- `status` is `compatible`, `incompatible` or `unavailable`; `issues` enumerates version,
  scope, revision, epoch or definition mismatches, or unavailable tracking/dependencies.
- `compatibilityOnly=true`; `reuseAllowed`, `clientMaySkipReads`, `coverageCertified`,
  `localReceiptVerified` and `storageIdentityVerified` are always false. Root shadow/false flags
  are unchanged. Incomplete tracking never yields `compatible`; missing tracking errors remain 503.

The conservative read vector still covers all bounded contract definitions and data, including
relations. It is independent of nonce and request period/selection; requestFingerprint and the
explicit context/experience metadata bind those separately. The stable manifestRevision hashes
manifest state, including envelope version, and excludes the nonce, negotiation and snapshot clock.
Do not compare v1/v2 manifestRevision as if they used the same envelope; their read vector remains
directly comparable for unchanged scope/data. No business response representation is upgraded.

The nonce is a caller freshness/correlation mechanism, not a server-issued grant. Core is stateless:
it does not keep a replay registry or prohibit a caller from reusing a nonce. A future Client must
verify nonce, request fingerprint, versions and active scope/generation before consuming the result.
It must reject late replies and never infer compatibility from a bundle number. Client integration
and those response guards are not implemented in this Core-only lot.

## Storage policy boundary

Policy 1 describes a conservative first Client pilot: a receipt must be materialized and verified
after a normal full download in the current runtime, with the same singleton handle, namespace,
scope, exact period/context/definition and intact complete content. Reopen/replacement/recovery or
identity changes require ordinary download before eligibility. Core recognizes this policy's
protocol identifier; it cannot verify the Client's handle or receipt. The Client gate is still pending.

A UUID stored in a database/profile is copied by a full restore. This protocol does not detect a
physical clone, supply a durable external witness, rotate epoch, or recover pending operations absent
from an externally restored copy. Remote restores/tracking gaps still require the separately reviewed
epoch procedure. Cross-runtime omission is not accredited. Existing pending/conflict data is untouched.

## Compatibility and rollback

Implicit/explicit v1 retains its JSON shape and canonical state/hash; no `negotiation` key is emitted.
The only header hardening is `no-store` on previously uncached-by-default authentication denials.
V1 revision-bound reads always request v1 and remain unchanged. Existing Client keeps downloading.
V2 requested against older Core is unsupported (400): future Client must continue its normal
authorized downloads and must not accredit compatibility using a legacy response or missing seal.
401/403 remain authorization failures, not permission for broader downloads; a 409 in business
pagination still aborts that sequence without mixing pages or entering retry loops.

Rollback removes only this Core delta; no migration or local receipt rewrite is needed. Do not
remove prior revision tracking tables or restore production. Future omission activation would need
its own rollout/rollback gate; it is not authorized or enabled by this work.

## Verification

Query regressions and isolated PostgreSQL tests cover v1 parity, exact context/nonce binding,
versions, optional comparisons, remote changes/rollback, concurrent metadata/data/permission changes,
scope isolation, new epoch, incomplete tracking and actual Bearer-route authentication. Existing
revision-read and Prisma-snapshot tests protect the legacy integration. Test data and resources are
synthetic/local only. No production migration, rotation, repair or publication is included.
