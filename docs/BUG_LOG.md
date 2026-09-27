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

## BUG-20260927-013 - Metrik COGS gagal pada schema invoice aktif

- Tanggal: 27 September 2026
- Status: Fixed and verified
- Area: Intelligence metrics
- Severity: High

### Gejala

E2E mengembalikan HTTP 500 saat memuat `GET /api/v1/intelligence/metrics` setelah metrik revenue/COGS ditambahkan.

### Sumber

Query mereferensikan `customer_invoices.reversed_at`, padahal pembalikan invoice direpresentasikan oleh nilai `status='reversed'`; hanya payment dan expense memiliki kolom `reversed_at`.

### Dampak

Dashboard profit/margin tidak dapat dipakai dan workflow E2E terhenti pada Fase 4.

### Perbaikan

Hilangkan referensi kolom yang tidak ada dan pertahankan filter status invoice posted/partially paid/paid.

### Verifikasi

E2E Phase 1–4 dijalankan ulang setelah build baru; metrik memverifikasi COGS dan gross profit bernilai benar.

## BUG-20260927-014 - Fixture security expiry melanggar constraint session

- Tanggal: 27 September 2026
- Status: Fixed and verified
- Area: Security test
- Severity: Low

### Gejala

`npm run security:api` gagal saat memaksa `expires_at` ke masa lalu karena check constraint session mensyaratkan expiry sesudah waktu pembuatan.

### Sumber

Fixture hanya mengubah `expires_at`, sehingga menghasilkan state database yang memang dilarang schema.

### Dampak

Pengujian penolakan session kedaluwarsa tidak dapat mencapai request HTTP.

### Perbaikan

Geser `created_at` dan `expires_at` bersama-sama ke masa lalu dengan urutan waktu tetap valid.

### Verifikasi

Security API matrix dijalankan ulang dan session kedaluwarsa ditolak HTTP 401.
## BUG-20260927-015 - Docker Compose tidak membaca .env.local otomatis

- Tanggal: 27 September 2026
- Status: Fixed and verified
- Area: Deployment configuration
- Severity: Low

### Gejala

docker compose up menolak konfigurasi karena POSTGRES_PASSWORD dan POSTGRES_RUNTIME_PASSWORD dianggap kosong.

### Sumber

Docker Compose membaca .env secara otomatis, bukan .env.local. Percobaan replace file dalam satu patch juga meninggalkan .env.local terhapus.

### Dampak

Container PostgreSQL dan aplikasi belum dapat dibuat.

### Perbaikan

Buat ulang .env.local dan selalu jalankan Compose dengan --env-file .env.local.

### Verifikasi

Compose berhasil membangun dan menjalankan service PostgreSQL serta aplikasi.

## BUG-20260927-016 - Port PostgreSQL host `55432` tidak tersedia

- Tanggal: 27 September 2026
- Status: Fixed and verified
- Area: Docker networking
- Severity: Low

### Gejala

Docker menolak binding `127.0.0.1:55432` saat service PostgreSQL dimulai.

### Sumber

Port host tidak tersedia untuk Docker Desktop.

### Dampak

Database container belum dapat berjalan.

### Perbaikan

Pindahkan port host PostgreSQL ke `25432`; jaringan internal Docker tetap memakai port `5432`.

### Verifikasi

PostgreSQL berjalan dan dipublikasikan pada `127.0.0.1:25432`.

## BUG-20260927-017 - Container migrasi memakai image aplikasi lama

- Tanggal: 27 September 2026
- Status: Fixed and verified
- Area: Database deployment
- Severity: Low

### Gejala

Container one-off menolak `npm run db:migrate` karena script tidak tersedia.

### Sumber

Service PostgreSQL dijalankan lebih dahulu tanpa membangun ulang image aplikasi; Docker memakai image lama sebelum backend PostgreSQL dibuat.

### Dampak

Migration SQL belum diterapkan.

### Perbaikan

Jalankan migration dan seed dari host terhadap PostgreSQL pada `127.0.0.1:25432`, lalu build image aplikasi terbaru.

### Verifikasi

Seluruh migration tercatat, seed admin berhasil, dan aplikasi baru menjadi healthy.

## BUG-20260927-018 - PostgreSQL host port menolak koneksi setelah startup

- Tanggal: 27 September 2026
- Status: Fixed and verified
- Area: Docker networking
- Severity: High

### Gejala

`npm run db:migrate` mengembalikan `ECONNREFUSED 127.0.0.1:25432`.

### Sumber

Docker menerima `HostConfig.PortBindings`, tetapi `NetworkSettings.Ports` kosong sehingga port tidak benar-benar dipublikasikan oleh Docker Desktop.

### Dampak

Migration, seed, dan startup aplikasi baru tertahan.

### Perbaikan

Hapus publikasi port PostgreSQL dan jalankan migration/seed memakai helper Node pada network internal Compose. Database tetap tidak terekspos ke host.

### Verifikasi

Migration, seed, dan verifier database berhasil melalui network internal; aplikasi terhubung ke service `postgres:5432`.

## BUG-20260927-019 - Image standalone tidak membawa script operasi database

- Tanggal: 27 September 2026
- Status: Fixed and verified
- Area: Docker deployment
- Severity: Low

### Gejala

Container aplikasi production tidak menemukan `scripts/migrate.mjs`.

### Sumber

Dockerfile benar-benar hanya menyalin Next standalone runtime untuk meminimalkan image production.

### Dampak

Migration dan seed tidak dapat dijalankan memakai container aplikasi production.

### Perbaikan

Gunakan helper Node disposable di network internal Docker dengan script dan migration hanya-baca dari workspace.

### Verifikasi

Helper menerapkan migration, membuat admin, dan verifier database lulus sebelum aplikasi production dimulai.

## BUG-20260927-020 - Helper migration gagal mengunduh driver PostgreSQL

- Tanggal: 27 September 2026
- Status: Fixed and verified
- Area: Database deployment
- Severity: Low

### Gejala

Helper Node mengembalikan `EAI_AGAIN` saat mengunduh package `pg` dari npm registry.

### Sumber

DNS sementara dari container helper tidak dapat menjangkau registry eksternal.

### Dampak

Migration belum berjalan meskipun PostgreSQL sudah healthy.

### Perbaikan

Gunakan dependency `pg` yang sudah dibundel dalam image production dan mount hanya folder script/migration.

### Verifikasi

Migration, seed, dan verifier selesai tanpa download dependency tambahan.

## BUG-20260927-021 - Environment helper membaca literal hashtable PowerShell

- Tanggal: 27 September 2026
- Status: Fixed and verified
- Area: Database deployment
- Severity: Low

### Gejala

PostgreSQL menolak login untuk user literal `System.Collections.Hashtable.POSTGRES_USER`.

### Sumber

PowerShell meneruskan ekspresi hashtable sebagai teks literal ketika nilai diberikan sebagai argumen terpisah setelah `-e`.

### Dampak

Helper belum dapat membuka koneksi database.

### Perbaikan

Bentuk setiap environment sebagai satu string `KEY=VALUE` sebelum diteruskan ke Docker.

### Verifikasi

Migration, seed admin, dan verifier lulus.

## BUG-20260927-022 - Password role runtime tidak sinkron setelah bootstrap

- Tanggal: 27 September 2026
- Status: Fixed and verified
- Area: Database deployment
- Severity: High

### Gejala

Aplikasi mengembalikan health HTTP 500 dan PostgreSQL menolak autentikasi `honda_runtime`.

### Sumber

Container aplikasi bergabung dengan beberapa Docker network. Host generik `postgres` dapat resolve ke database lain pada network eksternal, sehingga credential `honda_runtime` valid ditolak oleh server yang salah.

### Dampak

Aplikasi tidak dapat mengakses database meskipun migration dan seed selesai.

### Perbaikan

Gunakan hostname container unik `honda-postgres`, sinkronkan secret runtime, lalu recreate aplikasi.

### Verifikasi

Health endpoint mengembalikan `ok` dan login admin berhasil.

## BUG-20260927-023 - Secret owner dan bootstrap masuk ke runtime aplikasi

- Tanggal: 27 September 2026
- Status: Fixed and verified
- Area: Container security
- Severity: High

### Gejala

Environment container web berisi `POSTGRES_PASSWORD` dan `BOOTSTRAP_ADMIN_PASSWORD` yang tidak dibutuhkan runtime.

### Sumber

Service web memakai `env_file: .env.local`, sehingga seluruh secret deployment diteruskan ke proses Next.js.

### Dampak

Kompromi container web dapat membuka akses owner database dan password bootstrap.

### Perbaikan

Hapus `env_file` dari service web. Tambah image target dan service profile `db-tools` khusus migration/seed yang hanya berjalan secara one-off.

### Verifikasi

Runtime web hanya menerima password role `honda_runtime`; migration dan reset password admin tetap tersedia melalui `db-tools`.

