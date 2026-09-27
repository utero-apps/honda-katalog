# Bug Log

## BUG-20260926-001 - Konflik dependency Vitest

- Tanggal: 26 September 2026
- Status: Fixed and verified
- Area: Tooling test
- Severity: Medium

### Gejala

`npm install -D @types/pg vitest@5.0.2` gagal dengan `ERESOLVE`.

### Sumber

`vitest@5.0.2` mendeklarasikan peer optional `@types/node` versi `^22.0.0 || >=24.0.0`, sedangkan proyek memakai `@types/node@^20`. Docker runtime sudah memakai Node 22.

### Dampak

Tooling test tidak dapat ditambahkan; quality gate belum dapat dijalankan.

### Perbaikan

Naikkan `@types/node` menjadi `^22`, lalu install `@types/pg` dan `vitest@5.0.2` tanpa `--force` atau `--legacy-peer-deps`.

### Verifikasi

- Dependency tree harus resolve tanpa peer conflict.
- `npm run test` dan `npx tsc --noEmit` dijalankan setelah konfigurasi test tersedia.

## BUG-20260926-002 - Katalog masih memakai Supabase yang sudah dihapus

- Tanggal: 26 September 2026
- Status: Fixed and verified
- Area: Catalog frontend dan import CSV
- Severity: Critical

### Gejala

`npm run lint` gagal karena `src/app/actions.ts`, `src/lib/supabase.ts`, dan `import-csv.js` masih mengimpor `@supabase/supabase-js` setelah dependency dihapus. UI katalog juga masih melakukan mutasi melalui Server Action lama.

### Sumber

Migrasi dependency tidak diikuti penggantian jalur data frontend dan importer lama.

### Dampak

Build tidak dapat lolos quality gate. Aplikasi tidak memenuhi keputusan arsitektur backend milik sendiri dengan PostgreSQL dan RLS.

### Perbaikan

Ganti Server Action dan client Supabase dengan Route Handler `/api/v1/catalog/*`, service PostgreSQL bertransaksi actor, serta importer PostgreSQL milik aplikasi. Hapus file Supabase lama.

### Verifikasi

- Tidak ada referensi `supabase` pada source aplikasi atau `package.json`.
- CRUD katalog melewati permission dan transaksi actor.
- `npm run lint`, `npm run typecheck`, dan test API lolos.

## BUG-20260926-003 - Permission check tidak type-safe

- Tanggal: 26 September 2026
- Status: Fixed and verified
- Area: Authorization backend
- Severity: High

### Gejala

`npm run typecheck` gagal pada `src/server/auth/permissions.ts`: `result.rowCount` dapat bernilai `null` pada tipe `pg`.

### Sumber

Permission check membandingkan `rowCount` langsung tanpa fallback eksplisit.

### Dampak

Quality gate TypeScript gagal; akses izin tidak memiliki kontrak hasil yang eksplisit.

### Perbaikan

Gunakan `(result.rowCount ?? 0) > 0`.

### Verifikasi

`npm run typecheck` selesai tanpa error pada permission check.

## BUG-20260926-004 - Regresi typecheck dan lint setelah migrasi katalog

- Tanggal: 26 September 2026
- Status: Fixed and verified
- Area: Next.js Route Handler dan frontend
- Severity: High

### Gejala

Quality gate menemukan `RouteContext` belum tersedia saat `tsc --noEmit`, fixture `src/data/spareparts.ts` masih mengimpor tipe yang telah dihapus, dan bootstrap client dipanggil sinkron dari effect sehingga melanggar aturan React 19.

### Sumber

Refactor awal masih mengandalkan global type hasil Next type generation, menyisakan fixture UI lama, dan memanggil fungsi pemutakhiran state langsung dari effect.

### Dampak

`npm run typecheck` dan `npm run lint` gagal.

### Perbaikan

Gunakan kontrak context eksplisit `{ params: Promise<{ id: string }> }`, hapus fixture usang, dan jadwalkan bootstrap pada callback timer dengan cleanup.

### Verifikasi

`npm run typecheck` dan `npm run lint` harus selesai tanpa error.

## BUG-20260926-005 - Konfigurasi rilis belum memiliki PostgreSQL mandiri

- Tanggal: 26 September 2026
- Status: Fixed and verified
- Area: Docker Compose dan environment
- Severity: Critical

### Gejala

`docker-compose.yml` hanya menjalankan aplikasi, sedangkan `.env.example` dan `.env.local` masih mendefinisikan variabel Supabase. Backend baru membutuhkan PostgreSQL serta kredensial runtime terpisah.

### Sumber

Konfigurasi deployment lama belum dimigrasikan bersama aplikasi.

### Dampak

Container production tidak dapat menjalankan backend PostgreSQL milik sendiri.

### Perbaikan

Tambahkan service PostgreSQL, health check, volume persisten, jaringan internal, dan contoh environment non-rahasia untuk owner migration serta runtime aplikasi.

### Verifikasi

Compose tervalidasi, migrasi berjalan terhadap PostgreSQL disposable, dan runtime role tidak memiliki superuser atau `BYPASSRLS`.

## BUG-20260926-006 - Port PostgreSQL audit tidak tersedia

- Tanggal: 26 September 2026
- Status: Fixed and verified
- Area: Database integration test
- Severity: Low

### Gejala

Docker menolak container PostgreSQL disposable pada `127.0.0.1:55432`: port tidak tersedia.

### Sumber

Port audit statis bertabrakan dengan proses atau kebijakan host.

### Dampak

Migrasi dan bukti RLS belum dapat dijalankan pada percobaan pertama.

### Perbaikan

Biarkan Docker memilih port host dinamis, baca binding aktual, lalu teruskan port tersebut ke migration runner.

### Verifikasi

Container sehat, semua migrasi dan seed selesai, dan query audit role/RLS menghasilkan bukti yang diharapkan.

## BUG-20260926-007 - Vitest tidak me-resolve alias TypeScript

- Tanggal: 26 September 2026
- Status: Fixed and verified
- Area: Tooling test
- Severity: Medium

### Gejala

`npm test` gagal memuat `@/features/catalog/schemas` dan `@/server/auth/password`.

### Sumber

`tsconfig.json` mendefinisikan alias `@/*`, tetapi Vitest belum memiliki resolver alias yang setara.

### Dampak

Unit test backend tidak dapat berjalan.

### Perbaikan

Tambahkan `vitest.config.ts` yang memetakan `@` ke direktori `src`.

### Verifikasi

`npm test` menjalankan dan meluluskan seluruh test unit.

## BUG-20260926-008 - Advisory dependency `baseline-browser-mapping`

- Tanggal: 26 September 2026
- Status: Fixed and verified
- Area: Dependency security
- Severity: Moderate

### Gejala

`npm audit --omit=dev` melaporkan advisory `GHSA-w5vr-8v7q-w6rv` pada `baseline-browser-mapping`.

### Sumber

Versi transitif dependency berada pada rentang terdampak.

### Dampak

Input tidak valid dapat memicu denial of service pada dependency terdampak.

### Perbaikan

Jalankan `npm audit fix`, lalu validasi ulang build dan test.

### Verifikasi

`npm audit --omit=dev` tidak lagi melaporkan advisory tersebut.

## BUG-20260926-009 - Format konfigurasi Vitest memicu warning ESM

- Tanggal: 26 September 2026
- Status: Fixed and verified
- Area: Tooling test
- Severity: Low

### Gejala

Vitest memperingatkan sintaks ESM pada `vitest.config.ts` yang dimuat sebagai CommonJS.

### Sumber

Ekstensi file konfigurasi tidak menyatakan module format secara eksplisit.

### Dampak

Konfigurasi berpotensi tidak kompatibel saat native config loader menjadi default.

### Perbaikan

Gunakan ekstensi `vitest.config.mts`.

### Verifikasi

`npm test` selesai tanpa warning config loader.

## BUG-20260927-010 - Lifecycle scanner melanggar aturan React 19

- Tanggal: 27 September 2026
- Status: Fixed and verified
- Area: Catalog scanner
- Severity: Medium

### Gejala

`npm run lint` menolak mutasi ref saat render dan penggunaan nama lokal `module` pada dynamic import scanner.

### Sumber

Callback scanner distabilkan dengan menulis `ref.current` di fase render, sedangkan aturan React 19 melarang akses ref tersebut. Nama `module` juga dicadangkan aturan Next.js.

### Dampak

Quality gate gagal dan lifecycle kamera berisiko memakai callback usang.

### Perbaikan

Gunakan callback stabil melalui `useCallback`, masukkan callback ke dependency effect scanner, dan ganti nama hasil import menjadi `scannerLibrary`.

### Verifikasi

`npm run lint`, typecheck, dan test selesai tanpa error scanner.

## BUG-20260927-011 - Environment E2E hilang setelah container audit dihentikan

- Tanggal: 27 September 2026
- Status: Fixed and verified
- Area: E2E database
- Severity: Low

### Gejala

Container `honda-audit-postgres` tidak ditemukan saat server E2E mencari port database.

### Sumber

Container disposable dijalankan dengan opsi `--rm`, sehingga terhapus ketika audit sebelumnya dihentikan.

### Dampak

E2E API tidak dapat memakai database audit lama.

### Perbaikan

Buat ulang PostgreSQL disposable, jalankan migrasi dan seed, lalu inject environment sebelum server E2E dimulai.

### Verifikasi

Health, login, dan workflow API berhasil terhadap container baru.

## BUG-20260927-012 - Transisi status purchase order menghasilkan HTTP 500

- Tanggal: 27 September 2026
- Status: Fixed and verified
- Area: Purchasing API
- Severity: High

### Gejala

E2E Phase 3 gagal saat `PATCH /api/v1/business/purchase-orders/:id/status` mengubah purchase order dari `draft` ke `submitted`. API mengembalikan HTTP 500 dengan kode aman `INTERNAL_ERROR`.

### Sumber

Parameter PostgreSQL `$1` dipakai sekaligus sebagai nilai kolom enum `app.purchase_status` dan pembanding string pada `CASE`. PostgreSQL tidak dapat mendeduksi satu tipe konsisten untuk parameter tersebut.

### Dampak

Workflow pembelian berhenti sebelum approval, penerimaan barang, posting stok, dan invoice vendor dapat diuji.

### Perbaikan

Cast eksplisit parameter status ke `app.purchase_status` pada assignment dan kedua kondisi `CASE`.

### Verifikasi

Query parameterized direproduksi terhadap PostgreSQL runtime, lalu workflow E2E Phase 1–4 dijalankan ulang setelah build baru.
