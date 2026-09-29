# Audit Page 9 CRM Lifecycle dan Security

Tanggal: 2026-09-28

## Kendala

- Profil pelanggan tidak melakukan join ke `vehicle_models`, sehingga model kendaraan kosong.
- Pembuatan follow-up menerima Service Order milik pelanggan lain.
- Pembuatan reminder menerima kendaraan milik pelanggan lain.
- Follow-up dan reminder terminal dapat dibuka ulang ke status aktif.
- Hitungan overdue memasukkan data cancelled.
- Otomasi serah-terima belum idempotent dan belum membuat jadwal CRM.
- Otomasi jatuh tempo awalnya hanya dapat mencatat satu kegagalan provider selamanya, meski jadwal diubah.
- Query repeat service memakai alias tanpa quote `returning`, sehingga PostgreSQL menolak query BI.

## Sumber

- Query read model Customer 360 belum lengkap.
- Endpoint create hanya mengandalkan foreign key terpisah, bukan validasi relasi bisnis.
- Endpoint PATCH belum menerapkan state machine terminal.
- Query dashboard memakai kondisi `status<>'completed'`.
- Schema belum memiliki kunci otomasi unik.

## Perbaikan

- Join model kendaraan pada profil pelanggan.
- Gunakan `INSERT ... SELECT` untuk memvalidasi ownership dalam satu statement atomik.
- Tolak perubahan jadwal/status pada data completed/cancelled.
- Hitung overdue hanya untuk status pending.
- Tambah `automation_key`, unique index, dan lifecycle handover dalam transaksi Service Order.
- Catat provider unavailable berdasarkan kombinasi entity dan `dueAt`, sehingga reschedule dapat diproses kembali.
- Quote alias repeat service sebagai `"returning"` agar kompatibel dengan PostgreSQL.
- Batasi RLS tulis CRM ke owner/admin, dengan insert otomatis handover yang tervalidasi untuk cashier.
- Tambah schema rating pasca-serah-terima dan konfigurasi performa mekanik; data yang belum dicatat tetap ditampilkan sebagai kosong.
