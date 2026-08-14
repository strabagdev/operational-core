# Operational Core Development

## Requirements

- Node.js compatible with Next.js 16.
- npm.
- PostgreSQL database. The active development/staging database is provided through Railway via `DATABASE_URL`.

## Installation

Install dependencies:

```bash
npm install
```

## Environment Variables

Create `.env` from `.env.example` and configure:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
AUTH_SECRET="replace-with-a-secure-secret"
API_AUTH_SECRET="replace-with-a-separate-secure-secret"
API_ALLOWED_ORIGINS="http://localhost:8081,http://localhost:19006,http://localhost:19102"
AUTH_URL="http://localhost:3000"
```

`DATABASE_URL` is the only database connection source used by Prisma. In Railway, use the database URL provided by the environment instead of hard-coding local credentials. `AUTH_SECRET` is required and must be a stable generated value; the app fails at startup/build if it is missing or empty. `API_AUTH_SECRET` is required by the external `/api/v1` bearer-token endpoints and must be a separate stable generated value. Do not rely on generated or fallback secrets. `API_ALLOWED_ORIGINS` is a comma-separated list of exact browser origins allowed to call `/api/v1` with CORS; include the real Expo Web origin shown by the browser, for example `http://localhost:8081`, and any deployed web client origins.

Auth.js v5 reads `AUTH_SECRET` and `AUTH_URL`. Do not define a competing `NEXTAUTH_SECRET`. If a legacy `NEXTAUTH_URL` exists locally, replace it with `AUTH_URL` when touching the file.

The real database URL, auth secret, API auth secret, and production allowed-origin list belong only in local or deployment environment variables; do not commit secret values.

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

Create and apply a local migration:

```bash
npx prisma migrate dev --name migration_name
```

Before applying migrations or running any write script, confirm which database is active without printing credentials:

```bash
node -e 'require("dotenv").config(); const u = new URL(process.env.DATABASE_URL); console.log({ host: u.hostname, port: u.port, database: u.pathname.slice(1), railway: /railway|rlwy/i.test(u.hostname) })'
```

Do not run mutating Prisma commands against Railway/shared development data unless that is the explicit deployment task. For local validation, override `DATABASE_URL` per command instead of editing the Railway `.env` value:

```bash
DATABASE_URL="postgresql://USER@127.0.0.1:55432/opco_local?schema=public" npx prisma migrate deploy
```

One safe local option is a disposable PostgreSQL cluster under `/tmp`:

```bash
/usr/lib/postgresql/16/bin/initdb -D /tmp/opco-pg --auth=trust --no-instructions
printf "\nlisten_addresses = '127.0.0.1'\nport = 55432\nunix_socket_directories = '/tmp'\n" >> /tmp/opco-pg/postgresql.conf
/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/opco-pg -l /tmp/opco-pg.log start
createdb -h 127.0.0.1 -p 55432 -U "$USER" opco_local
DATABASE_URL="postgresql://$USER@127.0.0.1:55432/opco_local?schema=public" npx prisma migrate deploy
```

If Docker PostgreSQL is available, it is also acceptable, as long as the active `DATABASE_URL` host is local and the command includes an explicit guard before mutating:

```bash
DATABASE_URL="postgresql://USER@127.0.0.1:55432/opco_local?schema=public" node -e 'const u = new URL(process.env.DATABASE_URL); if (!["127.0.0.1", "localhost"].includes(u.hostname) || /railway|rlwy/i.test(u.hostname)) process.exit(1)'
```

Seed demo data:

```bash
npm run db:seed
```

The seed is optional development/demo data. It creates the administrator user, demo organization, demo contract, entity types, fields, options, records, relations, and non-duplicated audit events. Do not run it automatically in production deploys.

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

Compatible primary field types are `TEXT`, `EMAIL`, `PHONE`, `URL`, `INTEGER`, and `SELECT`. `SELECT` primary fields use the option label for `displayName`.

`display.showInList` controls dynamic list columns. It is intentionally separate from `searchable`, which only controls text search. `EntityField.sortOrder` is the single official order across configuration, record forms, record-list dynamic columns, Excel templates, and Excel imports. Existing `display.listOrder` values are preserved as legacy compatibility data but are not used for ordering.

Existing records are not recalculated in bulk. They keep their current `displayName` until they are edited or recreated by seed/demo data. If no primary field is configured, the legacy fallback remains: first required `TEXT`, then first `TEXT`, then `Registro sin nombre`.

`EntityRecord` does not have a technical status. A record exists until it is permanently deleted. Business states such as Vigente, Finiquitado, Operativo, or Vencido must be modeled with dynamic fields, usually `SELECT` fields owned by the `EntityType`.

Field settings screens summarize fields with compact rows and badges before exposing the full edit form. Use the list filters to find fields by name, type, state, or usage. Create/edit forms are intentionally collapsed until the drawer-based editor planned for the next UX package.

Field creation and editing open in a right-side Sheet controlled by `createField=1` and `editField=<fieldId>`. Closing the Sheet preserves list filters and removes only the editor parameter. The Sheet uses `@radix-ui/react-dialog` through the local `src/components/ui/sheet.tsx` primitive for focus trap, Escape, scroll lock, overlay, and focus restoration.

The field editor is a client form with progressive type-specific sections. `SELECT` and `MULTISELECT` fields can be created with up to 500 options in one submit, and `RELATION` fields can be created with target entity and cardinality in the same submit. The shared `MAX_FIELD_OPTIONS` constant keeps client and server limits aligned. Editor Server Actions return structured field errors on failure and redirect with inline notices on success.

Field editor redirects must use internal `/app/` paths only. Use `safeAppRedirectPath` for hidden `returnTo` and `successTo` values so absolute URLs, protocol-relative URLs, and non-app routes cannot become open redirects.

The final PCORE-008.2 acceptance pass is documented in `docs/PCORE-008.2D-field-configuration-acceptance.md`. Manual mutating acceptance requires a local/test PostgreSQL database or disposable contract; do not run those flows against shared Railway demo data.

As of the acceptance pass, Next.js is pinned to `16.2.12`. `npm audit` still reports findings in Next's bundled `postcss`/`sharp` and ESLint's minimatch chain; the available automated fixes require breaking or incoherent major changes and are tracked as dependency debt.

## Running The App

Start the development server:

```bash
npm run dev
```

Demo login:

- email: `admin@operational-core.local`
- password: `admin123456`

## JWTSessionError Recovery

`JWTSessionError` with cause `no matching decryption secret` means Auth.js could not decrypt an existing session cookie with the current `AUTH_SECRET`.

`JWTSessionError` can also wrap errors thrown from the Auth.js JWT callback after the token was already decrypted. Operational Core keeps the callback free of per-request database reads so transient database connection exhaustion does not get reported as a broken JWT session.

Operational Core uses a project-specific session cookie in development:

- `operational-core.session-token` on non-secure local HTTP;
- `__Secure-operational-core.session-token` when secure cookies are required.

This avoids collisions with other Auth.js apps running on `localhost`. Browsers share `localhost` cookies across ports, so a cookie created by another project with the default `authjs.session-token` name can be sent to Operational Core and fail JWT decryption.

Check these in order:

- `.env` has a non-empty `AUTH_SECRET`.
- the value is stable across restarts and deployments;
- no `NEXTAUTH_SECRET` is set with a different value;
- the dev server was restarted after changing `.env`;
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

Supported import field types are `TEXT`, `TEXTAREA`, `EMAIL`, `PHONE`, `URL`, `INTEGER`, `DECIMAL`, `MONEY`, `BOOLEAN`, `DATE`, `DATETIME`, `SELECT`, and `MULTISELECT`.

`RELATION`, `FILE`, and `IMAGE` are excluded from the workbook. If an active excluded field is required, the basic import is blocked instead of creating invalid records.

Use semicolons for `MULTISELECT` labels, for example:

```text
Seguridad; Operaciones; Mantención
```

Text dates should use `YYYY-MM-DD`; date-time values should use ISO-style text.

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
