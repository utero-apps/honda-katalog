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

## Incident

- Jika health gagal, cek koneksi runtime role dan `docker compose logs postgres`.
- Jangan gunakan role owner pada aplikasi web.
- Untuk pelanggaran RLS atau data gagal posting, simpan `requestId`, cek `app.audit_events`, lalu lakukan reversal melalui transaksi baru. Stock movement tidak boleh diubah atau dihapus.

## Release

1. Jalankan `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, dan `npm audit --omit=dev`.
2. Jalankan migrasi dan verifier pada database kosong.
3. Deploy image baru setelah database sehat.

## Otomasi CRM

- Jalankan `npm run automation:due` melalui scheduler lokal setelah mengisi `AUTOMATION_SESSION_COOKIE` dengan sesi owner/admin dan `APP_BASE_URL` bila aplikasi bukan di `http://localhost:7780`.
- Job memakai advisory lock, aman dijalankan berulang, dan mencatat item jatuh tempo ke `app.audit_events` per jadwal.
- Tanpa provider pesan, hasil selalu `provider_unavailable`; status follow-up/reminder tidak diubah menjadi terkirim atau selesai.
