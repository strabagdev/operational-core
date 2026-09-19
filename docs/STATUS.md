# Current Status

## Selective Stabilization Candidate

This local release candidate is based on `origin/main` and contains only the reviewed functional
changes selected from `local/opco-stabilization-2026-09-19`:

- AppView editor client/server import separation from `6d1bec3`/`dcc2fb9`, plus only the
  `server-only` Prisma boundary and test alias extracted from environment commit `b4f4e66`.
- Narrow invalid web-session recovery from `da58cea`/`321ad61`: valid sessions remain valid,
  expected JWT/JWE expiry or decryption failures clear project-owned session cookies, and
  unexpected decode errors continue to propagate.

The candidate excludes ENV-024 database guards, local destinations, PostgreSQL scripts, seeds,
credentials, development configuration, data, and production configuration. The editor imports
browser-safe static options; Prisma and private database environment access remain server-only.

The editor and AUTH repairs have no functional dependency on each other. Their shared STATUS file
was consolidated from review documentation `8d6ee62` and `69a4f66`.

Integrated validation passed: complete suite (108 files passed, 1 skipped; 1,063 tests passed,
8 skipped), TypeScript, lint, `git diff --check`, and the habitual Turbopack production build. The
build ran in a same-filesystem detached validation worktree with ephemeral synthetic `AUTH_SECRET`
and non-operational `DATABASE_URL` process values; no environment file was written and no database
connection was required. The user's existing browser confirmation belongs to the complete local
stabilization branch and was not repeated here.

Publication is not authorized. Do not push, merge, or deploy this branch without explicit approval.
