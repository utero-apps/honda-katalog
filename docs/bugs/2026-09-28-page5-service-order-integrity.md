# Page 5: integritas Service Order dan serah-terima

## Temuan dan sumber

- `src/app/api/v1/operations/service-orders/[id]/status/route.ts` mengizinkan transisi langsung melewati approval, QC, invoice, pembayaran, dan serah-terima.
- `src/app/api/v1/operations/service-orders/[id]/details/route.ts` menerima mutasi job/part/QC pada order terminal; jalur legacy tidak memvalidasi readiness order.
- `src/app/api/v1/business/customer-invoices/route.ts`, `payments/route.ts`, dan `reversals/route.ts` memiliki jalur finansial alternatif tanpa rekonsiliasi workflow yang konsisten.
- `src/features/service-orders/service.ts` semula mengirim ringkasan pekerjaan dalam bentuk array, sedangkan UI mengharapkan boolean/jumlah; progress sepuluh tahap bisa menandai tahap selesai sebelum waktunya.
- Form serah-terima lama tidak mensyaratkan foto akhir, checklist keluar, dan tanda tangan; RLS `service_orders` tidak mengizinkan role finance memperbarui status finansial.

## Perbaikan

- Transisi legacy dibatasi; seluruh aksi operasional wajib melalui workflow tervalidasi. Mutasi legacy mengunci order dan memeriksa status/readiness.
- Invoice legacy memakai service canonical. Pembayaran mengunci invoice/order, membatasi outstanding, dan merekonsiliasi status secara atomik. Reversal setelah motor keluar ditolak.
- Ringkasan pekerjaan memakai tipe yang sama di backend dan UI. Progress tampil sesuai sepuluh langkah PDF; rincian pelanggan, kendaraan, jasa, sparepart, QC, dan riwayat ditampilkan.
- Migrasi `015_service_order_handover_assets.sql` mewajibkan checklist, foto akhir, tanda tangan, dan validasi di database. API upload membatasi MIME, ukuran, dan isi; finalisasi memakai transaksi terproteksi.
- Migrasi `016_service_order_role_policies.sql` menyelaraskan role finance/warehouse dengan update workflow. Mekanik hanya boleh memproses SO miliknya; serah-terima dikerjakan kasir/admin/owner.

## Verifikasi

- Unit/API: 208 lulus, 7 skip setelah hardening legacy; E2E SO pada Docker selesai sampai `completed` dengan unggahan foto dan tanda tangan.
- Migrasi 015/016 diterapkan; `verify-db` memeriksa 51 tabel FORCE RLS; `security-api` lulus.
- Lint lintas berkas terkait lulus. Full lint masih gagal pada enam error memoization lama di `src/app/page.tsx:126` dan `src/app/page.tsx:214`; tidak terkait perubahan Page 5.
