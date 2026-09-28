# Project Structure

## Runtime

- `src/app/`: halaman App Router dan Route Handler.
- `src/components/`: komponen UI bersama.
- `src/features/`: domain feature dan validasi.
- `src/server/`: autentikasi, database, HTTP, audit, log, dan rate limit.

## Database

- `db/migrations/`: migration PostgreSQL aktif dan berurutan.
- `db/legacy/supabase/`: SQL Supabase lama untuk referensi historis.

## Operations

- `scripts/`: script database, migrasi katalog, E2E API, dan security test.
- `data/catalog/`: sumber CSV katalog.
- `docs/`: dokumen produk, desain, arsitektur, audit, runbook, bug, dan TODO.
- `.github/workflows/`: pipeline CI.

## Root Configuration

File root dibatasi untuk konfigurasi yang dicari langsung oleh framework atau tooling: npm, Next.js, TypeScript, PostCSS, ESLint, Vitest, Docker Compose, Dockerfile, Git, environment template, agent instructions, dan README.
