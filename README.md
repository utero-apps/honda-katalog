# Honda Dealer & Workshop Management System

Next.js 16 modular monolith dengan backend Route Handler milik sendiri, PostgreSQL, session opaque, RBAC, dan forced RLS.

## Quick Start

1. Salin `.env.example` menjadi `.env.local`, lalu isi semua password minimal.
2. Jalankan `docker compose up -d postgres`.
3. Jalankan `npm ci`, `npm run db:migrate`, `npm run db:seed`, dan `npm run db:verify`.
4. Jalankan `npm run dev` untuk development atau `docker compose up -d catalog-product` untuk runtime container.

## Quality Gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm audit --omit=dev`, dan `npm run db:verify`.

## Operasional

- Backup: `npm run db:backup`
- Restore: `npm run db:restore -- backups/<file>.dump`
- Runbook: `docs/RUNBOOK.md`
- Architecture: `docs/ARCHITECTURE.md`
- Delivery TODO: `docs/TODO.md`
