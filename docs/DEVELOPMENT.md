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
AUTH_URL="http://localhost:3000"
```

`DATABASE_URL` is the only database connection source used by Prisma. In Railway, use the database URL provided by the environment instead of hard-coding local credentials. `AUTH_SECRET` is required and must be a stable generated value; the app fails at startup/build if it is missing or empty. Do not rely on generated or fallback secrets.

Auth.js v5 reads `AUTH_SECRET` and `AUTH_URL`. Do not define a competing `NEXTAUTH_SECRET`. If a legacy `NEXTAUTH_URL` exists locally, replace it with `AUTH_URL` when touching the file.

The real database URL and auth secret belong only in local or deployment environment variables; do not commit them.

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

Seed demo data:

```bash
npm run db:seed
```

The seed creates the administrator user, demo organization, demo contract, entity types, fields, options, records, relations, and non-duplicated audit events.

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
    "showInList": true,
    "listOrder": 10
  }
}
```

`display.primary` identifies the field used to calculate `EntityRecord.displayName`. The persisted `displayName` remains the shared label for list first columns, relation selectors, activity, breadcrumbs, and audit summaries. When a new primary field is saved, the previous primary field for the same entity type is unmarked.

Compatible primary field types are `TEXT`, `EMAIL`, `PHONE`, `URL`, `INTEGER`, and `SELECT`. `SELECT` primary fields use the option label for `displayName`.

`display.showInList` controls dynamic list columns. It is intentionally separate from `searchable`, which only controls text search. `display.listOrder` is optional; when missing, the field `sortOrder` is used.

Existing records are not recalculated in bulk. They keep their current `displayName` until they are edited or recreated by seed/demo data. If no primary field is configured, the legacy fallback remains: first required `TEXT`, then first `TEXT`, then `Registro sin nombre`.

The technical `EntityRecord.status` is not a normal domain field. List screens show it as a contextual badge for inactive/archived records or filters that include non-active records, so a dynamic field named `Estado` can appear without competing with a fixed technical status column.

Field settings screens summarize fields with compact rows and badges before exposing the full edit form. Use the list filters to find fields by name, type, state, or usage. Create/edit forms are intentionally collapsed until the drawer-based editor planned for the next UX package.

Field creation and editing open in a right-side Sheet controlled by `createField=1` and `editField=<fieldId>`. Closing the Sheet preserves list filters and removes only the editor parameter. The Sheet uses `@radix-ui/react-dialog` through the local `src/components/ui/sheet.tsx` primitive for focus trap, Escape, scroll lock, overlay, and focus restoration.

The field editor is a client form with progressive type-specific sections. `SELECT` and `MULTISELECT` fields can be created with options in one submit, and `RELATION` fields can be created with target entity and cardinality in the same submit. Editor Server Actions return structured field errors on failure and redirect with inline notices on success.

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

## Manual Verification

Use browser or curl-based checks. Do not use Playwright for this project.

Verify:

- login and logout;
- unauthenticated route redirects;
- contract selection at `/app`;
- contract summary at `/app/contracts/[contractId]`;
- entity type and field configuration;
- field options for select fields;
- record list, creation, edition, and archive;
- relation fields with `ONE` and `MANY`;
- inverse relation display;
- record audit history;
- contract activity at `/app/contracts/[contractId]/activity`;
- nonexistent or unauthorized resources return no protected data.
