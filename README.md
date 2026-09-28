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

## Struktur Proyek

- `src/`: aplikasi, komponen, fitur, API, dan backend.
- `db/migrations/`: migration PostgreSQL aktif.
- `db/legacy/supabase/`: arsip SQL implementasi Supabase lama; bukan runtime aktif.
- `data/catalog/`: sumber data katalog untuk proses import atau migrasi.
- `scripts/`: migration, seed, backup, restore, E2E, dan security tooling.
- `docs/`: PDR, SDD, arsitektur, design system, runbook, audit, dan TODO.
- `public/`: aset statis aplikasi.

File konfigurasi Next.js, TypeScript, npm, ESLint, Vitest, Docker, Git, dan agent tetap berada di root karena toolchain mensyaratkan lokasi atau nama tersebut.
