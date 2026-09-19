# Current Status

## Review Candidate: AppView Editor Boundary

This branch contains the AppView editor client/server import separation from stabilization commit
`6d1bec3`, based on `origin/main`. It also extracts only the `server-only` Prisma boundary and
its test alias from environment commit `b4f4e66`; no local database guard, destination, script,
seed, or environment configuration is included.

The browser-facing editor imports static options from a client-safe module. Prisma and private
database environment access remain server-only.

Publication is not authorized. Do not push, merge, or deploy this branch without explicit approval.
Validated with the editor/AppView regressions (101 tests), TypeScript, lint and a production build.
The build used webpack because Turbopack rejects the review worktree's external `node_modules`
symlink before compilation. It required network access for the existing Google-hosted Geist fonts.
The user already confirmed the editor in the full local stabilization environment; this isolated
candidate was not revalidated through a browser.
