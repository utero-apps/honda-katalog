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

## BUG-20260927-024 - Teks input login tidak terlihat pada dark color scheme

- Tanggal: 27 September 2026
- Status: Fixed and verified
- Area: Login UI
- Severity: Medium

### Gejala

Teks yang diketik pada input email dan password hampir tidak terlihat di atas background input putih.

### Sumber

Media query dark mode mengubah warna foreground global menjadi putih. Form control mewarisi warna tersebut meskipun background input tetap terang.

### Dampak

Pengguna tidak dapat memeriksa email atau password yang sedang diketik.

### Perbaikan

Tetapkan background, warna teks, caret, dan placeholder form control secara eksplisit dengan kontras tinggi.

### Verifikasi

Lint, typecheck, build, dan container production lulus; input memakai teks slate gelap di atas background putih.

## BUG-20260927-025 - Test dialog menolak focus restore yang lebih aman

- Tanggal: 27 September 2026
- Status: Fixed and verified
- Area: Accessibility regression test
- Severity: Low

### Gejala

Test mencari string persis `previouslyFocusedRef.current?.focus()`, sedangkan dialog baru memakai `focus({ preventScroll: true })`.

### Sumber

Assertion mengikat detail signature, bukan perilaku restore focus.

### Dampak

Quality gate gagal meskipun focus restore tetap ada dan lebih aman terhadap scroll jump.

### Perbaikan

Ubah assertion untuk memverifikasi pemanggilan `previouslyFocusedRef.current?.focus` tanpa mengunci argumen implementasi.

### Verifikasi

Seluruh accessibility test dan unit test lulus.

## BUG-20260928-026 - Navigasi sidebar memakai anchor section, bukan halaman aplikasi

- Tanggal: 28 September 2026
- Status: Fixed and verified
- Area: Dashboard navigation
- Severity: Medium

### Gejala

Menu `Ringkasan Operasional`, `Katalog Sparepart`, dan `Modul Bisnis` hanya memindahkan scroll ke section dalam satu halaman. Dua menu juga menunjuk target `#workspace` yang sama, sehingga konteks halaman dan URL tidak jelas.

### Sumber

Sidebar memakai elemen anchor `href="#workspace"` dan `href="#catalog"`, sementara dashboard, katalog, dan modul bisnis dirender bersama dalam `src/app/page.tsx`.

### Dampak

Pengguna melihat panel operasi muncul di bawah katalog dan mengira komponen salah tempat. Navigasi tidak memiliki deep link halaman yang jelas.

### Perbaikan

Tambah route `/`, `/catalog`, dan `/business`. Ubah sidebar menjadi `next/link`, beri state aktif berbasis pathname, dan tampilkan konten sesuai tujuan halaman.

### Verifikasi

`npm run typecheck`, `npm run lint`, `npm test` (23 test), dan image production Docker lulus. Endpoint `/`, `/catalog`, `/business`, dan `/api/health` mengembalikan HTTP 200.

## BUG-20260928-027 - Kamera scanner aktif tetapi barcode produk tidak terbaca

- Tanggal: 28 September 2026
- Status: Fixed and verified
- Area: Catalog barcode scanner
- Severity: High

### Gejala

Dialog scanner berhasil menampilkan kamera, tetapi barcode yang diarahkan ke kamera tidak menghasilkan pencarian katalog.

### Sumber

Scanner memakai area baca tetap 250×100 piksel, hanya meminta kamera berdasarkan facing mode, dan tidak menyediakan fallback saat webcam sulit fokus. Format barcode produk juga tidak dikonfigurasi secara eksplisit.

### Dampak

Pencarian cepat lewat barcode tidak dapat dipakai pada kamera laptop atau kondisi pencahayaan dan fokus yang kurang ideal.

### Perbaikan

Aktifkan format EAN, UPC, Code, ITF, Codabar, QR, dan Data Matrix secara eksplisit; prioritaskan kamera belakang; perluas area baca adaptif; naikkan frekuensi pemindaian; tambahkan scan dari foto dan input kode manual.

### Verifikasi

Typecheck, lint, regression test scanner, build production Docker, endpoint health, dan halaman katalog lulus. Pembacaan kamera fisik tetap bergantung pada fokus dan kualitas webcam; fallback foto serta input manual tersedia.

## BUG-20260928-028 - Pesan error scanner menyamarkan penyebab kegagalan kamera

- Tanggal: 28 September 2026
- Status: Fixed and verified
- Area: Catalog barcode scanner
- Severity: High

### Gejala

Scanner menampilkan pesan bahwa kamera memerlukan HTTPS meskipun domain memakai HTTPS dan header izin kamera benar.

### Sumber

Pemanggilan `Html5Qrcode.getCameras()` dilakukan sebelum scanner dimulai. Kegagalan enumerasi kamera tertangkap oleh handler generik yang selalu menyebut HTTPS.

### Dampak

Pengguna menerima diagnosis keliru dan tidak mendapat tindakan tepat saat kamera ditolak, tidak ditemukan, sedang dipakai aplikasi lain, atau tidak mendukung konfigurasi.

### Perbaikan

Hapus enumerasi kamera sebelum start; gunakan constraint `facingMode` langsung; petakan error browser menjadi pesan spesifik dan dapat ditindaklanjuti.

### Verifikasi

HTTPS domain mengembalikan HTTP 200 dengan `Permissions-Policy: camera=(self)`. Typecheck, lint, 25 test, build Docker, dan endpoint katalog lokal serta domain lulus.

## BUG-20260928-029 - Konfigurasi decoder scanner memicu kegagalan start kamera

- Tanggal: 28 September 2026
- Status: Fixed and pending verification
- Area: Catalog barcode scanner
- Severity: High

### Gejala

Setelah pesan error diperjelas, scanner tetap gagal memulai kamera pada localhost dan domain HTTPS.

### Sumber

Konfigurasi lanjutan decoder dan camera constraints ditambahkan ke alur start, padahal konfigurasi dasar sebelumnya berhasil membuka preview kamera. Error library tidak selalu berupa `DOMException`, sehingga pesan awal masih terlalu umum.

### Dampak

Scanner tidak dapat digunakan meskipun browser, HTTPS, dan Permissions-Policy telah valid.

### Perbaikan

Gunakan konstruktor default `Html5Qrcode`, constraint kamera sederhana yang kompatibel, area baca barcode tetap lebih besar, dan tampilkan detail error library yang telah dibersihkan bila penyebab belum dapat dipetakan.

### Verifikasi

Konfigurasi dasar lulus typecheck, lint, regression test, build production, dan smoke test HTTP. Verifikasi pembacaan kamera fisik tetap memerlukan perangkat pengguna.

## BUG-20260928-030 - Navigasi dan umpan balik katalog tidak lengkap pada layar mobile

- Tanggal: 28 September 2026
- Status: Fixed and verified
- Area: Dashboard responsive layout dan katalog
- Severity: High

### Gejala

Sidebar utama disembunyikan di bawah breakpoint desktop tanpa navigasi pengganti. Pengguna mobile tidak dapat berpindah halaman dari UI. Katalog juga tidak membedakan kondisi memuat, gagal, dan data kosong.

### Sumber

Layout hanya menyediakan navigasi pada elemen `aside` dengan kelas `hidden lg:flex`. Pemanggilan katalog langsung mengganti data tanpa state loading dan error khusus, sementara empty state lama selalu aktif saat array kosong.

### Dampak

Navigasi mobile terputus, kegagalan API tampak seperti katalog kosong, dan pengguna dapat mengulang aksi karena tidak melihat proses pemuatan.

### Perbaikan

Tambah navigasi mobile sticky dengan deep link dan status halaman aktif. Tambah skeleton loading, alert error dengan retry, empty state dengan reset pencarian dan tambah produk, serta hilangkan empty state duplikat.

### Verifikasi

Typecheck, lint, 29 regression test, build production Docker, dan smoke test HTTP untuk `/`, `/catalog`, `/business`, serta `/api/health` lulus.

## BUG-20260928-031 - Modul bisnis hanya berupa tab data generik tanpa workflow operasional

- Tanggal: 28 September 2026
- Status: Fixed and verified
- Area: Pelanggan, Service Order, Inventori, Vendor, Keuangan, CRM
- Severity: High

### Gejala

Enam modul bisnis ditampilkan sebagai tab horizontal pada satu halaman. Setiap tab hanya melakukan GET dan merender kolom objek secara generik. Tidak ada URL permanen per modul, pencarian domain, ringkasan, maupun form untuk menjalankan operasi yang sudah tersedia di API.

### Sumber

`WorkspaceOverview` menggunakan satu konfigurasi endpoint dan komponen `DataView` generik. Route `/business` tidak memiliki child route untuk pelanggan, service order, inventori, vendor, keuangan, atau CRM.

### Dampak

API Phase 2–4 tidak dapat digunakan penuh dari dashboard. Pengguna tidak dapat membuat pelanggan, membuka service order, menyesuaikan stok, menambah vendor, mencatat biaya, atau menjadwalkan follow-up tanpa memanggil API secara manual.

### Perbaikan

Buat route permanen per modul, command center bisnis, navigasi responsif, tampilan data domain, pencarian, ringkasan, form aksi, status loading/error/empty, dan regression test route serta workflow.

### Verifikasi

Typecheck, lint, dan 66 regression test lulus. Docker production build dan HTTP 200 diverifikasi untuk `/business`, enam deep-link modul, serta `/api/health`. Security matrix container lulus untuk anonymous access, privilege escalation, IDOR, session expiry, dan token rotation.

## BUG-20260928-032 - Integritas service order, stock movement, dan goods receipt belum divalidasi cukup

- Tanggal: 28 September 2026
- Status: Fixed and verified
- Area: Service, inventori, purchasing
- Severity: Critical

### Gejala

API dapat membuat service order menggunakan kendaraan milik pelanggan lain, mengubah status lewat diagnosis tanpa transisi valid, mencatat arah stock movement yang salah, dan menerima barang terhadap PO yang belum disetujui atau item yang bukan bagian PO.

### Sumber

Route hanya memvalidasi bentuk payload, belum menegakkan kepemilikan kendaraan, state machine, semantik tanda kuantitas, dan keterkaitan receipt terhadap PO.

### Dampak

Riwayat layanan dapat salah, saldo ledger membingungkan, dan penerimaan barang dapat mem-post stok terhadap dokumen pembelian yang tidak sah.

### Perbaikan

Validasi pasangan kendaraan-pelanggan, batasi diagnosis agar hanya memindahkan open ke assigned, validasi tanda kuantitas per tipe movement, dan validasi status PO, duplikasi item, serta kepemilikan item sebelum receipt dibuat.

### Verifikasi

Focused API regression test untuk service, inventory, dan receipt lulus sebagai bagian dari 66 test.

## BUG-20260928-033 - Penjualan retail belum memiliki workflow POS terintegrasi

- Tanggal: 28 September 2026
- Status: Fixed and verified
- Area: POS, katalog, inventori, pembayaran
- Severity: Critical

### Gejala

Dashboard belum memiliki halaman POS, cart, checkout, receipt, pencatatan pembayaran retail, dan pengurangan stok yang terhubung dalam satu transaksi.

### Sumber

Phase sebelumnya hanya menyediakan katalog, service order, inventori, dan keuangan. Penjualan sparepart walk-in belum memiliki aggregate, API, permission, RLS, atau UI khusus.

### Dampak

Kasir tidak dapat menjalankan penjualan retail dari dashboard. Pencatatan manual berisiko membuat selisih stok, pembayaran ganda, harga tidak konsisten, dan transaksi tanpa audit.

### Perbaikan

Tambah domain POS dengan checkout atomik dan idempotent, stock ledger, payment record, receipt, void kompensasi, permission least privilege, forced RLS, UI responsif, barcode scanner, serta security test.

### Verifikasi

Typecheck, lint, 66 regression test, build Next.js, migration PostgreSQL, seed register, Docker production build, smoke HTTP, lifecycle checkout/idempotency/receipt/void, E2E penuh, dan security matrix POS lulus.

## BUG-20260928-034 - Penerimaan motor belum memiliki workflow customer dan vehicle terpadu

- Tanggal: 28 September 2026
- Status: Fixed and verified
- Area: Customer, vehicle, service order, reception
- Severity: Critical

### Gejala

Kasir belum dapat mencari pelanggan lewat telepon atau plat, membuat pelanggan dan motor dalam satu flow, mencatat kondisi motor, memilih jenis service, lalu membuka Service Order secara atomik.

### Sumber

Customer, vehicle, dan Service Order tersedia sebagai endpoint terpisah. Belum ada aggregate Service Reception, histori odometer immutable, service type formal, recommendation, atau wizard penerimaan.

### Dampak

Data pelanggan dapat terduplikasi, motor kedua sulit dicatat, kilometer dan keluhan tidak konsisten, serta proses penerimaan bergantung pada perpindahan halaman dan input manual.

### Perbaikan

Tambah route `/service/reception` dengan wizard lima langkah, pencarian customer/plat, create customer/vehicle, checklist kondisi, empat service type, recommendation, draft recovery, dan Service Order atomik. Tambah ledger odometer immutable, correction reason, actor-scoped idempotency, deterministic request hash, duplicate-race mapping, ownership non-disclosure, forced RLS, audit, serta navigasi Dashboard/POS.

### Verifikasi

Typecheck, lint, 66 regression test, 4 Service Reception integration test, production build, migration PostgreSQL `007` dan `008`, forced RLS 45 tabel, Docker rebuild, health/page smoke HTTP 200, API E2E lintas fase, dan security matrix reception lulus.

## BUG-20260928-035 - Seed menambah model kendaraan duplikat

- Tanggal: 28 September 2026
- Status: Fixed and verified
- Area: Katalog kendaraan, seed PostgreSQL
- Severity: High

### Gejala

Model seperti Vario 150 muncul empat kali dalam daftar aktif setelah seed dijalankan berulang.

### Sumber

Constraint UNIQUE (brand, name, year_start) mengizinkan lebih dari satu nilai NULL pada year_start. Seed memakai ON CONFLICT DO NOTHING sehingga tidak melihat konflik untuk model tanpa tahun.

### Perbaikan

Migration 009 memindahkan relasi product dan kendaraan ke record model tertua, menghapus duplikat, lalu memasang UNIQUE NULLS NOT DISTINCT. Seed memakai conflict target eksplisit dan mengaktifkan kembali record yang sudah ada.

### Verifikasi

Audit database sebelum perbaikan menemukan 10 kelompok model dengan masing-masing empat duplikat. Setelah migration dan seed ulang, setiap model aktif hanya satu record dan constraint baru menolak insert ulang dengan year_start NULL.

## BUG-20260928-036 - Keranjang POS tidak dapat disimpan sebagai Open Bill

- Tanggal: 28 September 2026
- Status: In progress
- Area: POS, pelanggan, katalog jasa, product media
- Severity: High

### Gejala

Keranjang POS hilang saat halaman ditutup atau pelanggan dibuka kembali. POS hanya menampilkan sparepart, belum memiliki biaya jasa tetap, dan kartu produk belum menyediakan area gambar yang konsisten.

### Sumber

State keranjang hanya berada pada React memory. Schema POS belum memiliki aggregate Open Bill, katalog jasa, item campuran produk/jasa, atau media produk.

### Rencana Perbaikan

Tambah Open Bill persisten per pelanggan dengan auto-save dan restore, katalog jasa terurut di bagian pertama, checkout campuran tanpa stock movement untuk jasa, dukungan image URL produk, kartu persegi responsif, forced RLS, audit, serta test keamanan dan integritas.

### Verifikasi

Menunggu implementasi dan seluruh quality gate.

## BUG-20260928-037 - Service Order dapat selesai tanpa invoice dan pembayaran

- Tanggal: 28 September 2026
- Status: Open
- Area: Service Order, QC, finance
- Severity: Critical

### Gejala

State machine menerima transisi langsung `quality_check → completed`. Endpoint customer invoice juga menerima Service Order berstatus `completed`, lalu mengubah status terminal tersebut kembali menjadi `invoiced`.

### Sumber

Daftar transisi route status memasukkan `completed` sebagai tujuan dari `quality_check`. Validasi customer invoice menerima status `quality_check` dan `completed`.

### Dampak

Motor dapat ditandai selesai tanpa tagihan dan pembayaran. Order terminal juga dapat dibuka kembali secara implisit, merusak histori status dan rekonsiliasi keuangan.

### Rencana Perbaikan

Batasi jalur normal menjadi `quality_check → invoiced → paid → completed`, tolak invoice untuk status terminal, dan buat rekonsiliasi invoice/payment/status atomik.

### Verifikasi

Test matrix dan regression test sudah ditambahkan. Perbaikan implementasi belum dikerjakan karena berada di luar scope task ini.

## BUG-20260928-038 - Pembayaran Service Order belum merekonsiliasi invoice dan status order

- Tanggal: 28 September 2026
- Status: Fixed, pending E2E verification
- Area: Payment, customer invoice, Service Order
- Severity: High

### Gejala

Posting pembayaran mencatat record payment tetapi tidak memperbarui paid amount/status invoice atau memindahkan Service Order dari `invoiced` ke `paid`.

### Sumber

Endpoint payment hanya melakukan lookup idempotency dan insert ke `app.payments`. Tidak ada lock invoice, validasi outstanding amount, agregasi pembayaran, atau transisi Service Order.

### Dampak

Status operasional harus dipindahkan manual dan dapat berbeda dari saldo invoice sebenarnya. Overpayment dan penyelesaian order sebelum lunas belum dicegah oleh workflow API.

### Rencana Perbaikan

Lock invoice saat pembayaran, validasi outstanding amount, hitung pembayaran aktif, update status invoice, dan transisikan Service Order ke `paid` hanya saat lunas dalam transaksi yang sama.

### Verifikasi

Backend atomik sudah tersedia melalui action `record_payment`: invoice dikunci, outstanding dihitung, partial/full status direkonsiliasi, overpayment ditolak, dan replay idempotent. Contract test dan E2E diperbarui; verifikasi Docker masih tertunda.

## BUG-20260928-039 - Handover menolak Service Order yang sudah lunas

- Tanggal: 28 September 2026
- Status: Open
- Area: Service Order handover, payment atomik
- Severity: Critical

### Gejala

Payment penuh atomik mengubah order dari `invoiced` ke `paid`, tetapi action `handover` masih hanya menerima status `invoiced`. Motor tidak dapat diserahkan setelah invoice lunas.

### Sumber

`recordServiceInvoicePayment` mentransisikan order ke `paid` saat outstanding mencapai nol. Guard action `handover` masih memakai kondisi `order.status !== "invoiced"`.

### Dampak

Kasir tidak dapat menutup workflow dan mencatat serah-terima motor walaupun pembayaran telah lengkap. Tidak ada jalur API yang valid menuju `completed`.

### Rencana Perbaikan

Ubah guard handover agar menerima status `paid`, pertahankan validasi `handoverReady`, lalu verifikasi transisi `paid → completed` beserta data penerima/signature.

### Verifikasi

`scripts/service-order-e2e.mjs` menguji partial payment, overpayment, full payment, dan handover. E2E diharapkan lulus setelah guard diperbaiki.

## BUG-20260928-040 - Cashier melihat produk POS tetapi Open Bill mengembalikan PRODUCT_NOT_FOUND

- Tanggal: 28 September 2026
- Status: Open
- Area: POS Open Bill, PostgreSQL RLS
- Severity: Critical

### Gejala

`GET /api/v1/pos/products?registerId=...` mengembalikan produk dengan UUID valid dan stok positif untuk cashier. Payload Open Bill yang memakai ID tersebut ditolak `422 PRODUCT_NOT_FOUND`.

### Sumber

Payload script sesuai `openBillUpsertSchema`: `{ productId, quantity, discount }`. `resolveItems` membaca `app.products` memakai `SELECT ... FOR UPDATE`. Policy `products_read` mengizinkan semua user terautentikasi, tetapi policy `products_update` hanya mengizinkan owner, admin, dan warehouse. PostgreSQL menerapkan policy UPDATE pada locking read, sehingga row produk tersembunyi dari cashier dan jumlah hasil lebih kecil dari daftar `productIds`.

### Dampak

Role cashier yang memiliki permission `pos.sell` tidak dapat menyimpan Open Bill produk. Checkout produk berpotensi mengalami kegagalan sama karena memakai resolver dan locking query yang sama.

### Rencana Perbaikan

Pisahkan validasi katalog dari row lock produk atau tambahkan policy locking yang sempit untuk transaksi POS tanpa memberi hak perubahan katalog. Pertahankan lock pada inventory balance dan pastikan policy cashier hanya mengizinkan mutasi stok melalui ledger/trigger POS.

### Verifikasi

`scripts/security-api.mjs` sekarang memvalidasi register, UUID produk, stok positif, kontrak item, dan mencetak error plus fixture lengkap. Backend dinyatakan fixed setelah cashier dapat membuat Open Bill dan security matrix melanjutkan test IDOR checkout.

## BUG-20260928-041 - Cart pelanggan lama tersalin saat pelanggan POS diganti

- Tanggal: 28 September 2026
- Status: Fixed
- Area: POS, Open Bill
- Severity: High

### Gejala

Saat kasir mengganti pelanggan pada transaksi aktif, item pelanggan sebelumnya digabung ke Open Bill pelanggan baru. Pelanggan tanpa Open Bill menerima isi cart yang bukan miliknya.

### Sumber

`selectCustomer` mengirim flag `merge` setiap kali cart berisi item. `loadOpenBill` lalu menggabungkan cart aktif dengan Open Bill pelanggan terpilih. Respons request lama juga belum memiliki sequence guard khusus, sehingga perpindahan pelanggan cepat berisiko menampilkan data pelanggan sebelumnya.

### Perbaikan

Pergantian pelanggan sekarang selalu mengganti cart dengan Open Bill milik pelanggan terpilih. Pelanggan tanpa Open Bill mendapat cart kosong. Pilihan pelanggan umum menghapus relasi Open Bill dan cart pelanggan. Sequence guard khusus mencegah respons lama menimpa pilihan pelanggan terbaru.

### Verifikasi

Unit test memvalidasi pemulihan item Open Bill terpilih tanpa membawa ID item cart pelanggan sebelumnya. Typecheck, lint, test, Docker rebuild, dan verifikasi browser dijalankan setelah patch.

## BUG-20260928-042 - Form katalog hanya menerima URL gambar dan tidak mendukung unggah file

- Tanggal: 28 September 2026
- Status: Fixed
- Area: Katalog produk, POS, media storage
- Severity: Medium

### Gejala

Kasir atau admin harus mengetik URL gambar manual. Tidak ada dropzone, preview, validasi file, maupun penyimpanan gambar persisten.

### Sumber

Form produk hanya memiliki field `imageUrl`. API katalog menerima URL tersebut tanpa endpoint multipart atau storage gambar.

### Perbaikan

Tambahkan dropzone dan pemilih file untuk JPEG, PNG, WebP, dan AVIF maksimal 5 MB. File diverifikasi lewat MIME, ukuran, dan magic byte; diberi nama UUID; disimpan pada volume Docker `/app/data/product-images`; lalu disajikan melalui endpoint media terautentikasi dengan `nosniff`. URL protocol-relative kini ditolak oleh schema produk.

### Verifikasi

Unit test memvalidasi format gambar, spoof MIME, batas ukuran, URL protocol-relative, dan kontrak UI. Typecheck, lint, seluruh test, build Docker, health check, serta uji upload browser dijalankan setelah patch.
