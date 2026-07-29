# Operational Core

Operational Core is a Next.js application for structured operational data. It stores configurable entity types, fields, records, values, relations, and audit history while isolating data by organization and contract.

It is not an ERP and does not implement workflows, approvals, notifications, granular permissions, or process engines.

## Stack

- Next.js 16
- React 19
- TypeScript
- Prisma
- PostgreSQL
- Auth.js v5
- Tailwind CSS
- shadcn/ui primitives

## Local Development

Configure environment variables from `.env.example`, then run:

```bash
npm install
npm run dev
```

Useful checks:

```bash
npx prisma validate
npx prisma generate
npm run lint
npm run build
```

See `docs/ARCHITECTURE.md` and `docs/DEVELOPMENT.md` for the current architecture, environment variables, Prisma workflow, and manual verification checklist.
