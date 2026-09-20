# Operational Core

Operational Core is a Next.js application for structured operational data. It stores configurable entity types, fields, records, values, relations, and audit history while isolating data by organization and contract.

It is not an ERP and does not implement workflows, approvals, notifications, granular permissions, or process engines.

## Operational Core MVP

The MVP is closed for controlled real use. It includes:

- authentication;
- multi-company isolation;
- contract administration;
- configurable entities;
- configurable fields;
- configurable validations;
- SELECT and MULTISELECT option fields;
- configurable MONEY fields;
- DATE fields with calendar-date semantics;
- presentation and field ordering;
- operational records;
- record relations;
- record search;
- pagination with 25, 50, and 100 row page sizes;
- multi-selection and bulk record deletion;
- transactional audit history;
- Excel template generation;
- all-or-nothing Excel import.

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

Local development is isolated from production. Follow [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
to install and initialize PostgreSQL, create private `.env.local` values, prepare the synthetic
database, and start Core plus Client. The supported procedure currently requires WSL/Linux.

After the environment is prepared, routine Core startup is:

```bash
npm run db:local:start
npm run dev
```

Useful checks:

```bash
npx prisma validate
npx prisma generate
npm run lint
npm run build
```

See `docs/STATUS.md` for the current handoff and `docs/ARCHITECTURE.md` for the application architecture.
