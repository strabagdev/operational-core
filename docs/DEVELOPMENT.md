# Operational Core Development

## Requirements

- WSL/Linux. The provided lifecycle script uses Bash, Linux paths and PostgreSQL 16 binaries under
  `/usr/lib/postgresql/16/bin`; this procedure is not portable to native Windows or macOS.
- Node.js compatible with Next.js 16.
- npm.
- PostgreSQL 16 client and server packages installed inside WSL/Linux.
- Both repositories checked out on `dev/local-environment`. These branches are based on published
  `main`, contain local-only tooling, and are not application release branches.

## Installation

Install dependencies:

```bash
npm install
```

## One-Time PostgreSQL Setup

The scripts use a persistent cluster under `~/.local/share/opco/postgresql-16`, listening only on
`127.0.0.1:55432`. After installing PostgreSQL 16, initialize it once as your WSL user:

```bash
mkdir -p "$HOME/.local/share/opco/postgresql-16/data"
/usr/lib/postgresql/16/bin/initdb \
  -D "$HOME/.local/share/opco/postgresql-16/data" \
  --auth-local=scram-sha-256 --auth-host=scram-sha-256 --pwprompt
npm run db:local:start
/usr/lib/postgresql/16/bin/createuser -h 127.0.0.1 -p 55432 -U "$USER" --login --pwprompt opco_dev
/usr/lib/postgresql/16/bin/createdb -h 127.0.0.1 -p 55432 -U "$USER" --owner=opco_dev opco_development
```

Use the PostgreSQL superuser password chosen by `initdb` when prompted. Choose a different new
password for `opco_dev`; the same value goes only in the private Core `.env.local`. If the cluster
already exists, do not run `initdb`, `createuser`, or `createdb` again.

Start, inspect, and stop only this local cluster with:

```bash
npm run db:local:start
npm run db:local:status
npm run db:local:stop
```

## Environment Variables

Create `.env.local` from `.env.example`, replace every placeholder, and keep it untracked:

```bash
cp .env.example .env.local
```

Required values describe this shape:

```dotenv
DATABASE_URL="postgresql://opco_dev:NEW_LOCAL_DB_PASSWORD@127.0.0.1:55432/opco_development?schema=public"
OPCO_DEV_SEED_PASSWORD="NEW_SYNTHETIC_LOGIN_PASSWORD_12_CHARS_MINIMUM"
AUTH_SECRET="NEW_GENERATED_LOCAL_AUTH_SECRET"
API_AUTH_SECRET="NEW_SEPARATE_LOCAL_API_SECRET"
API_ALLOWED_ORIGINS="http://localhost:8081"
AUTH_URL="http://localhost:3000"
```

Generate new values for each workstation, for example with `openssl rand -base64 32`; never reuse
production, shared-development, or another developer's secrets. `AUTH_SECRET`, `API_AUTH_SECRET`,
the seed login password, and the PostgreSQL password must be distinct. Do not define a competing
`NEXTAUTH_SECRET`.

Next reads `DATABASE_URL` through its normal `.env*` loading. Prisma config loads `.env.local`
before `.env` without overriding shell variables. Guarded database commands deliberately reload
`.env.local` and validate `DATABASE_URL`, plus `DIRECT_URL` or
`PANEL_PG_INTEGRATION_DATABASE_URL` when present, before any write.

The only accepted database target is `127.0.0.1:55432/opco_development` as `opco_dev`.
`DATABASE_URL` is server-only: never add a `NEXT_PUBLIC_` prefix or import it through a Client
Component. In production, explicit provider variables remain authoritative because the runtime
assertion runs only when `NODE_ENV=development`; local development has no production fallback.

The real database URL, passwords, auth secrets, and production allowed-origin list belong only in
local or deployment environment variables; do not commit them.

External API access tokens last 1 hour. Refresh tokens last 30 days and are rotated on every refresh. Web clients use the HttpOnly `opco_api_refresh_token` cookie under `/api/v1/auth`; native clients identify transport with `X-Opco-Client-Platform: native` and should store the returned refresh token in SecureStore. Refresh/logout Web calls require an authorized `Origin`, and browser clients must send credentials. Expired refresh-token rows do not affect correctness and can be cleaned later by a maintenance job; no local cron is required.

`AUTH_URL` must be present in the runtime environment used by `next start` and production deployments. Without it, Auth.js can reject local or deployed requests with `UntrustedHost` before credentials/session handling runs.

## Prisma

Validate the schema:

```bash
npx prisma validate
```

Format the schema:

```bash
npx prisma format
```

Generate Prisma Client:

```bash
npx prisma generate
```

Apply the repository's existing migrations only after the exact-target guard succeeds:

```bash
npm run db:local:migrate
```

Load the synthetic dataset only when intentionally preparing a fresh local environment:

```bash
npm run db:local:seed
```

For a brand-new local database, the combined command is:

```bash
npm run db:local:prepare
```

The wrapper prints only verified host, port, database, and role. It rejects `localhost`, hosted
destinations, another port/database/role, and mismatched auxiliary database URLs. Do not bypass it
with direct Prisma mutation commands. The seed asserts the target again before constructing Prisma,
uses the private `OPCO_DEV_SEED_PASSWORD`, and idempotently creates only synthetic users,
organization, contract, records, relations, audit events, and AppViews. It never runs as part of a
production deploy.

## Initial Production Setup

New production installations do not require demo seed data.

Use this flow for an empty database:

1. Deploy the app.
2. Run `npx prisma migrate deploy`.
3. Open the deployed domain.
4. Complete `/setup` with the first user and organization.
5. Sign in from `/login`.
6. Create the first contract from `/app/settings/contracts`.

The first setup creates the initial `User`, `Organization`, and `Membership` with role `ADMIN` in a single transaction. Once an organization has an ADMIN membership, `/setup` closes and redirects authenticated users to `/app` or unauthenticated users to `/login`.

Un usuario pertenece a una única organización. Una organización puede contener múltiples usuarios y contratos. El rol `ADMIN`/`MEMBER` pertenece a la `Membership`.

User administration lives at `/app/settings/users` and is available only to organization ADMIN memberships. This first version supports local password creation, attaching an existing user only when the user has no organization membership, role changes between `ADMIN` and `MEMBER`, and removing a user from an organization without deleting the global `User`. Operational Core prevents demoting or removing the last organization ADMIN.

Audit events are currently contract-scoped. User administration actions should move to organization-level audit when that model exists; this version does not force user changes into contract audit records.

## Configurable Validations

Field validation rules live in `EntityField.config`:

```json
{
  "validation": {
    "required": true,
    "minLength": 3,
    "maxLength": 120,
    "regex": {
      "pattern": "^[A-Z0-9-]+$",
      "message": "Use solo mayúsculas, números y guiones"
    }
  },
  "defaultValue": "ABC-001"
}
```

Relation fields may also include:

```json
{
  "targetEntityTypeId": "entity-type-id",
  "relationKind": "ONE",
  "validation": {
    "required": true
  }
}
```

Existing records are not migrated automatically when a new validation is configured. Rules apply on the next create or edit. Defaults apply only during record creation when the submitted value is empty; they do not overwrite existing values during edit.

## Record Display Configuration

Record-list presentation rules also live in `EntityField.config`, separate from validation:

```json
{
  "validation": {},
  "display": {
    "primary": true,
    "showInList": true
  }
}
```

`display.primary` identifies the field used to calculate `EntityRecord.displayName`. The persisted `displayName` remains the shared label for list first columns, relation selectors, activity, breadcrumbs, and audit summaries. When a new primary field is saved, the previous primary field for the same entity type is unmarked.

Compatible primary field types are `TEXT`, `EMAIL`, `PHONE`, `URL`, `INTEGER`, `SELECT`, and `RELATION` only when the relation is `ONE` and has a configured target entity type. `SELECT` primary fields use the option label for `displayName`. `RELATION ONE` primary fields use the target record's persisted `displayName`; raw target record ids must never become the visible record identity. `RELATION MANY` is not supported as a primary field, and composite identities are not implemented yet.

`display.showInList` controls dynamic list columns. It is intentionally separate from `searchable`, which controls record search. `RELATION` fields marked searchable match through related records' persisted `displayName` for both `ONE` and `MANY` relations; searches never match raw target record ids. `EntityField.sortOrder` is the single official order across configuration, record forms, record-list dynamic columns, Excel templates, and Excel imports. Existing `display.listOrder` values are preserved as legacy compatibility data but are not used for ordering.

Existing records are recalculated when the primary display field configuration changes. If a record's `displayName` derives from a `RELATION ONE` target and that target is renamed later, dependent records are not propagated automatically yet (`STALE_DERIVED_DISPLAY_NAME`). If no primary field is configured, the legacy fallback remains: first required `TEXT`, then first `TEXT`, then `Registro sin nombre`.

`EntityRecord` does not have a technical status. A record exists until it is permanently deleted. Business states such as Vigente, Finiquitado, Operativo, or Vencido must be modeled with dynamic fields, usually `SELECT` fields owned by the `EntityType`.

Field settings screens summarize fields with compact rows and badges before exposing the full edit form. Use the list filters to find fields by name, type, state, or usage. Create/edit forms are intentionally collapsed until the drawer-based editor planned for the next UX package.

Field creation and editing open in a right-side Sheet controlled by `createField=1` and `editField=<fieldId>`. Closing the Sheet preserves list filters and removes only the editor parameter. The Sheet uses `@radix-ui/react-dialog` through the local `src/components/ui/sheet.tsx` primitive for focus trap, Escape, scroll lock, overlay, and focus restoration.

The field editor is a client form with progressive type-specific sections. `SELECT` and `MULTISELECT` fields can be created with up to 500 options in one submit, and `RELATION` fields can be created with target entity and cardinality in the same submit. The shared `MAX_FIELD_OPTIONS` constant keeps client and server limits aligned. Editor Server Actions return structured field errors on failure and redirect with inline notices on success.

Field editor redirects must use internal `/app/` paths only. Use `safeAppRedirectPath` for hidden `returnTo` and `successTo` values so absolute URLs, protocol-relative URLs, and non-app routes cannot become open redirects.

The final PCORE-008.2 acceptance pass is documented in `docs/PCORE-008.2D-field-configuration-acceptance.md`. Manual mutating acceptance requires a local/test PostgreSQL database or disposable contract; do not run those flows against shared Railway demo data.

As of the acceptance pass, Next.js is pinned to `16.2.12`. `npm audit` still reports findings in Next's bundled `postcss`/`sharp` and ESLint's minimatch chain; the available automated fixes require breaking or incoherent major changes and are tracked as dependency debt.

## Routine Startup And Verification

Routine startup does not rerun migrations or seed. In the Core checkout:

```bash
npm run db:local:check
npm run db:local:start
npm run dev
```

In a separate terminal, from the sibling `opco-client` checkout on `dev/local-environment`:

```bash
npm install
npm start -- --clear
```

Core must listen at `http://localhost:3000`; Expo Web normally listens at
`http://localhost:8081`. Verify availability and credentialed CORS without sending credentials:

```bash
curl -fsS http://localhost:3000/api/v1/health
curl -fsS http://localhost:3000/api/v1/ready
curl -i -X OPTIONS http://localhost:3000/api/v1/auth/login \
  -H 'Origin: http://localhost:8081' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

`db:local:check` prints only host, port, database, and role. The Client guard rejects any local-mode
API except loopback port 3000. A successful HTTP response verifies transport, not browser behavior.

Synthetic login:

- email: `admin@operational-core.local`
- password: the private `OPCO_DEV_SEED_PASSWORD` in Core `.env.local`.

Stop only the dedicated PostgreSQL cluster with `npm run db:local:stop`. Stop Core and Expo in their
own terminals. Do not kill unrelated Node or PostgreSQL processes.

## Persistence And Independent Backups

PostgreSQL data persists under `~/.local/share/opco/postgresql-16/data`; it is not stored in Git or
recreated by switching branches. Back it up independently with PostgreSQL tools to a private path
outside either repository. A dump contains application data and must never be committed.

Client SQLite/OPFS, cookies, SecureStore and pending operations live in the browser/device profile.
They are not covered by a PostgreSQL dump or Git. Preserve that profile separately and never treat
reinstalling dependencies, reseeding Core, or recreating `.env.local` as a Client storage backup.

## Updating The Development Branches

Fetch and merge `origin/main` into each `dev/local-environment` branch, resolve documentation or
tooling conflicts there, and rerun the repository checks. Do not merge the development branch back
into `main` wholesale. Functional publication must select, review and validate only the intended
commits without local destinations, seeds, scripts, or example credentials.

## JWTSessionError Recovery

`JWTSessionError` with cause `no matching decryption secret` means Auth.js could not decrypt an existing session cookie with the current `AUTH_SECRET`.

`JWTSessionError` can also wrap errors thrown from the Auth.js JWT callback after the token was already decrypted. Operational Core keeps the callback free of per-request database reads so transient database connection exhaustion does not get reported as a broken JWT session.

Operational Core uses a project-specific session cookie in development:

- `operational-core.session-token` on non-secure local HTTP;
- `__Secure-operational-core.session-token` when secure cookies are required.

This avoids collisions with other Auth.js apps running on `localhost`. Browsers share `localhost` cookies across ports, so a cookie created by another project with the default `authjs.session-token` name can be sent to Operational Core and fail JWT decryption.

Check these in order:

- `.env.local` has a non-empty `AUTH_SECRET`.
- the value is stable across restarts and deployments;
- no `NEXTAUTH_SECRET` is set with a different value;
- the dev server was restarted after changing `.env.local`;
- the browser cookie `operational-core.session-token` or `__Secure-operational-core.session-token` is cleared once after changing the secret.

Clearing the cookie is recovery only. The durable fix is keeping `AUTH_SECRET` fixed.

If a local browser still has old default Auth.js cookies from a previous setup, clear `authjs.session-token` and `__Secure-authjs.session-token` as cleanup. They are ignored by Operational Core after the cookie-name isolation, but removing them avoids confusion while debugging other local apps.

## Quality Checks

Run lint:

```bash
npm run lint
```

Run production build:

```bash
npm run build
```

Run unit tests:

```bash
npm run test
```

## Basic Excel Import

PCORE-010 uses `exceljs` to generate and parse `.xlsx` templates for record imports.

The record list for an entity type exposes:

- `Descargar plantilla`, which streams a server-generated workbook;
- `Importar Excel`, which opens a Sheet for upload, validation, and all-or-nothing import.

Supported import field types are `TEXT`, `TEXTAREA`, `EMAIL`, `PHONE`, `URL`, `INTEGER`, `DECIMAL`, `MONEY`, `BOOLEAN`, `DATE`, `DATETIME`, `TIME`, `SELECT`, `MULTISELECT`, and `RELATION`.

`FILE` and `IMAGE` are excluded from the workbook. If an active excluded field is required, the basic import is blocked instead of creating invalid records.

Use semicolons for `MULTISELECT` labels, for example:

```text
Seguridad; Operaciones; Mantención
```

Use target record `displayName` values for `RELATION`. Multiple relation values use ` | `, for example:

```text
Oficina Técnica | Minería | Bodega
```

Text dates should use `YYYY-MM-DD`; date-time values should use ISO-style text; time-of-day values should use `HH:mm`.

`DATE` values are calendar dates, not instants. Keep date-only parsing and display aligned with the architecture rule in `docs/ARCHITECTURE.md`; use the shared helper in `src/lib/date-only.ts` instead of ad hoc timezone-sensitive formatting.

See `docs/PCORE-010-basic-excel-import.md` for the detailed contract.

## Contract Administration

Contracts are managed from `/app/settings/contracts` by organization admins. The administration view lists active, inactive, archived, or all contracts; supports create/edit/archive/restore; and keeps archived contracts out of the normal operational selector.

Archiving replaces deletion in this stage. Physical deletion is future debt and should only be considered for empty contracts or through an advanced administrative flow.

## Manual Verification

Use browser or curl-based checks. Do not use Playwright for this project.

Verify:

- login and logout;
- unauthenticated route redirects;
- contract selection at `/app`;
- contract summary at `/app/contracts/[contractId]`;
- entity type and field configuration;
- field options for select fields;
- record list, creation, edition, search, pagination, and permanent deletion;
- relation fields with `ONE` and `MANY`;
- inverse relation display;
- record audit history;
- contract activity at `/app/contracts/[contractId]/activity`;
- nonexistent or unauthorized resources return no protected data.
