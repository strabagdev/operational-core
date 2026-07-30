# PCORE-008.2D Field Configuration Acceptance

## Scope

PCORE-008.2D is the final acceptance pass for the field configuration work delivered in PCORE-008.2A, PCORE-008.2B, and PCORE-008.2C. No Prisma schema changes, migrations, commits, or pushes were made.

## Diff Review

The accumulated diff was reviewed for:

- client/server boundaries;
- Server Action signatures;
- multitenant validation paths;
- transactions;
- structured errors;
- URL query state;
- unused drawer/form code;
- dependency changes.

The manual visual drawer from PCORE-008.2B was removed before this pass. The current editor uses the Radix-based Sheet and client form only.

## Safe Test Environment

The local `.env` points to a shared Railway PostgreSQL database.

No local PostgreSQL or separate test database was detected. Because the configured database is Railway demo/staging data, mutating browser flows were not executed. Read-only Prisma migration status was executed and confirmed the schema is up to date.

## Functional Coverage

Direct mutating acceptance flows against a real database remain blocked by the lack of a safe mutable database. The following non-mutating and domain-level checks were added or executed:

- field editor payload parsing for simple fields;
- SELECT/MULTISELECT option payload parsing;
- duplicate option validation;
- option payload size limit;
- RELATION target requirement in form parsing;
- URL navigation preservation;
- `returnTo`/`successTo` open-redirect protection;
- key/default helper coverage;
- production build/typecheck.

## Atomicity

`createEntityFieldWithOptions` creates the field and options in one Prisma transaction. Invalid option payloads are rejected before entering the transaction. Invalid relation targets are checked before creation. If the transaction fails, Prisma rolls back the field and options together.

The transactional behavior itself was reviewed in code but not exercised against a mutable database because no safe database was available.

## Visual Review

No browser automation tool was available and Playwright installation was explicitly out of scope. A static UI review was performed against:

- field listing cards;
- filters;
- Sheet structure;
- form section order;
- dirty confirmation;
- primary deactivation confirmation;
- mobile/desktop responsive classes.

The form follows the requested order:

1. Información básica
2. Configuración del tipo
3. Comportamiento
4. Presentación
5. Validaciones avanzadas

## Accessibility Review

The Sheet and confirmation dialogs use Radix Dialog primitives, providing focus trap, Escape handling, focus restoration, modal behavior, overlay behavior, and title/description semantics. Labels remain visible text labels, not technical field names.

Manual keyboard/browser verification is still pending until a safe manual test session is available.

## Security Review

Server actions still require authenticated users through `requireAuthenticatedUser`. Entity and field writes continue through authorized helpers that scope access to contract, entity type, field, option, and relation target.

`returnTo` and `successTo` are now sanitized by `safeAppRedirectPath`, allowing only internal `/app/` paths and rejecting absolute URLs, protocol-relative URLs, and non-app paths.

Option payloads are capped at 100 rows per submit.

## Dependency Audit

`@radix-ui/react-dialog` was the only new UI dependency and did not appear in vulnerable paths.

`next` was updated from `16.2.10` to `16.2.12` because npm reported multiple high advisories fixed by a non-major patch. After the patch, npm audit still reports vulnerabilities in Next's bundled `postcss` and `sharp`; npm's suggested fix is a breaking/incoherent downgrade to `next@9.3.3`, so no further automated fix was applied.

| Package | Severity | Direct | Environment | Fix Available | Decision |
| --- | --- | --- | --- | --- | --- |
| `next` via bundled `postcss`/`sharp` | high | yes | production/build | npm suggests breaking `next@9.3.3` | documented debt; do not downgrade |
| `next-auth` via `next` | moderate | yes | production | npm suggests breaking `next-auth@3.29.10` | documented debt; do not downgrade |
| `eslint` / `minimatch` / `brace-expansion` | high | yes/transitive | development tooling | `eslint@10.8.0` major | documented debt; avoid unrelated major |
| `eslint-config-next` plugin chain | high | yes/transitive | development tooling | npm suggests major/incoherent version | documented debt |

## Verification Results

- `npx prisma format`: OK, no schema diff.
- `npx prisma validate`: OK.
- `npx prisma generate`: OK.
- `npx prisma migrate status`: OK with network permission; database schema is up to date.
- `npm run lint`: OK.
- `npm run test`: OK, 6 files and 39 tests.
- `npm run build`: OK on Next 16.2.12.
- `npm audit`: 13 remaining findings, documented above.

## Remaining Debt

- Manual mutating acceptance needs a local/test PostgreSQL database or disposable contract.
- Manual responsive and keyboard verification needs a browser session/tooling.
- npm audit retains vulnerabilities that require upstream/breaking remediation.
- Physical deletion of field options remains out of scope.

## Closure

PCORE-008.2 is ready for commit with documented debt, provided the team accepts that real mutating browser acceptance is blocked until a safe mutable database is available.
