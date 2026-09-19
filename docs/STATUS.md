# Current Status

Verify code and Git before acting; Git remains the exact history.

## Local Stabilization

- PostgreSQL is running at `127.0.0.1:55432/opco_development` as `opco_dev`; the configured target
  and a real read-only connection agree.
- Core is available at `http://localhost:3000`: health and readiness return 200, and the Client
  preflight from `http://localhost:8081` returns 204 with the expected credentialed CORS headers.
- The synthetic external login returns 200 and its authenticated `/me` returns 200. A separate
  synthetic Auth.js session loaded an existing AppView editor with 200 and rendered its form.
  Credentials, cookies and tokens stayed in memory and were not printed.
- Client is available at `http://localhost:8081` and its effective private API target is
  `http://localhost:3000`. Both repositories ignore `.env.local`.
- The editor uses browser-safe runtime options; Prisma and `DATABASE_URL` remain server-only. Core's
  browser artifact contains no database variable, local database destination or guardrail code.
- Production still reads its explicit `DATABASE_URL`; the exact-target assertion runs only in
  development. Client accepts an explicit production API URL outside local mode, while local mode
  rejects missing, hosted or wrong-port targets instead of falling back.

Routine startup, when a service is stopped:

```bash
cd /home/dannysilver/dev2026/operational-core
npm run db:local:start
npm run dev

cd /home/dannysilver/dev2026/opco-client
npm run web -- --clear
```

## Unpublished Groups

- Environment separation (`OPCO-ENV-024`): local PostgreSQL scripts/guards, env precedence,
  synthetic fixture updates, Client local-target guard and development documentation.
- Session recovery (`OPCO-AUTH-025`): project-owned cookie validation and narrow invalid-session
  recovery. It depends on ENV-024 only for a stable local `AUTH_SECRET`.
- AppView editor boundary: client-safe editor options plus the Prisma `server-only` boundary. It
  depends on the ENV-024 development guard whose accidental client evaluation exposed the issue.
- SQLite coordination: Client-only shared-connection serialization and regression coverage. It is
  code-independent from the Core groups; its final workflow check needs the local API and fixture.

No group is committed or published.

## Manual Validation

The user confirmed the remaining browser interactions:

1. An existing Core experience editor opens and remains usable.
2. Client Attendance opens and works after the SQLite diagnostics persistence repair.
3. The corrected offline-preparation notice no longer presents historical `running` as active work.

No seed, migration, reset, storage deletion, production access, Chromium or Playwright was used in
this closing pass. Commits remain local and unpublished; Client's date-scoped Attendance wording is
tracked in the Client repository.
