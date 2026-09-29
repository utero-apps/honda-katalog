# Runbook Operasional

## Bootstrap

1. Salin `.env.example` menjadi `.env.local` dan isi password owner, runtime, dan bootstrap admin.
2. Jalankan `docker compose up -d postgres`.
3. Jalankan `npm run db:migrate`, `npm run db:seed`, lalu `npm run db:verify`.
4. Jalankan `docker compose up -d catalog-product`.

## Backup dan Restore

- Backup: `npm run db:backup`.
- Restore: `npm run db:restore -- backups/<file>.dump`.
- Setelah restore, jalankan `npm run db:verify`.
- Target Docker `db-tools` wajib memuat `postgresql-client`; rebuild target setelah perubahan `Dockerfile` sebelum backup release.

## Incident

- Jika health gagal, cek koneksi runtime role dan `docker compose logs postgres`.
- Jangan gunakan role owner pada aplikasi web.
- Untuk pelanggaran RLS atau data gagal posting, simpan `requestId`, cek `app.audit_events`, lalu lakukan reversal melalui transaksi baru. Stock movement tidak boleh diubah atau dihapus.

## Release

1. Jalankan `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, dan `npm audit --omit=dev`.
2. Jalankan migrasi dan verifier pada database kosong.
3. Deploy image baru setelah database sehat.

## Otomasi CRM

- Isi `AUTOMATION_JOB_TOKEN` dengan token acak minimal 24 karakter yang sama pada aplikasi dan scheduler. Token ini bukan session cookie dan jangan ditulis ke log.
- `docker compose up -d` mengaktifkan `automation-scheduler` setiap 60 detik. Ubah interval lewat `AUTOMATION_INTERVAL_SECONDS` dan batch lewat `AUTOMATION_BATCH_LIMIT`.
- Provider bersifat opt-in. Isi pasangan `AUTOMATION_EMAIL_PROVIDER_URL`/`AUTOMATION_EMAIL_PROVIDER_TOKEN` atau `AUTOMATION_WHATSAPP_PROVIDER_URL`/`AUTOMATION_WHATSAPP_PROVIDER_TOKEN`. Production hanya menerima URL HTTPS.
- Provider menerima JSON `{ channel, to, message }` dan header `Idempotency-Key`. Provider wajib menghormati kunci ini agar retry tidak menggandakan pengiriman.
- Tanpa provider, outbox tetap berstatus `retry` dengan `last_error_code=provider_unavailable`; tidak ada status `delivered` palsu. Backoff eksponensial dibatasi enam jam, lease macet direbut kembali setelah sepuluh menit, dan item masuk `dead` setelah batas percobaan.
- Inspeksi aman: `SELECT id,entity_type,channel,status,attempts,next_attempt_at,last_error_code FROM app.automation_outbox ORDER BY created_at DESC LIMIT 100;`. Jangan tampilkan `destination`, `payload`, token, atau authorization header dalam log insiden.

## Customer Master Page 5

- Jalankan migration `025_customer_master_management.sql` sebelum `026_customer_communication_preferences.sql`; runner migration normal menangani urutan tersebut lewat `npm run db:migrate`.
- Migration 025 menambah identitas telepon/email ternormalisasi, histori merge, histori kepemilikan kendaraan, indeks unik master aktif, dan RLS histori.
- Migration 026 menambah consent komunikasi dengan default aman `false`. Jangan mengubah default menjadi opt-in saat import, seed, restore, atau koreksi data.
- Setelah migration, jalankan `npm test -- src/features/customer-management`, `npm run typecheck`, dan `E2E_ISOLATED=1 npm run e2e:customer-master` terhadap database uji terisolasi. Script sengaja menolak database non-isolasi.
- Ekspor customer memerlukan permission `users.manage`. File CSV memuat PII; simpan hanya pada lokasi terkontrol, jangan lampirkan ke log/tiket, dan hapus sesuai kebijakan retensi organisasi.
- Saat merge pelanggan, target adalah record master yang dipertahankan dan `sourceCustomerId` adalah record duplikat. Pastikan histori kendaraan, Service Order, invoice, CRM, dan audit tetap dapat ditelusuri sebelum menutup insiden.
