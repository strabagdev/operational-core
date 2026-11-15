# Generic verified coverage reuse — local, 15-11-2026

V2 storage policy 3 adds `genericReuse={version:1,policy:verified-coverage-runtime-v1,enabled,views:[{appViewId,kinds}]}`.
Independent opt-in: `OPCO_OFFLINE_GENERIC_REUSE_POLICY=verified-coverage-runtime-v1`; absent/malformed is off.
Only authenticated assigned valid views and tracked dependencies receive offers. No contract/name conditions.
Core grants coverage families, never certifies a local snapshot. Existing V1 and V2 policies 1/2 retain their shape.
Policy 3 also retains the independent Attendance concession, with its existing month/contract gate unchanged.
No new migration, writer, read representation, permissions, business rules, TTL or synchronization changes.
Client must verify current authorization/epoch/vector/definition and complete exact local content under its existing inspection transaction.
Unsupported or incompatible coverage downloads normally; 401/403 remain denials.
All new gates are off by default. This lot is local only; no rollout or production configuration is authorized.

Selected STATE_UPDATE contexts use the existing `state-update-current` family with exact Client identity/date proof;
no separate workflow or coverage state is introduced. The contract-wide read vector is retained. Relations, deletions,
permissions, definitions or epoch changes require ordinary fallback whenever the existing vector no longer matches.
This implementation does not narrow writer tracking or introduce another revision mechanism/migration.
