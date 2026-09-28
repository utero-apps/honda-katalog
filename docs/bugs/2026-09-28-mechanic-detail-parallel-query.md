# Detail mekanik gagal dimuat

## Kendala

Endpoint `GET /api/v1/intelligence/mechanics/:id` mengembalikan HTTP `500` untuk mekanik valid.

## Sumber

Read model menjalankan beberapa `client.query()` secara paralel dengan `Promise.all()` pada satu koneksi PostgreSQL yang sedang berada dalam transaksi aktor. Driver PostgreSQL menandai pola ini sebagai pemakaian client paralel dan request gagal.

## Perbaikan

Query profil performa, Service Order, pekerjaan, sparepart, Quality Check, dan fee sekarang dieksekusi berurutan melalui client transaksi yang sama. Query tetap memakai parameter terikat dan pemeriksaan permission `reports.read`.

Validasi runtime juga menemukan nilai `waiting_parts` yang tidak tersedia pada enum `app.service_status`. Status aktif diselaraskan menjadi `assigned`, `in_progress`, dan `quality_check`.
