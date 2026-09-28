# Bug Integritas Pembayaran Vendor - 2026-09-28

## P0 - Pembayaran vendor tidak merekonsiliasi invoice - selesai

- **Sumber:** src/app/api/v1/business/payments/route.ts mencatat pembayaran outgoing tanpa mengunci dan membaca saldo invoice vendor.
- **Dampak:** pembayaran dapat melebihi total invoice, status invoice tetap posted, dan dua request konkuren dapat menghasilkan saldo hutang salah.
- **Perbaikan:** invoice dikunci dalam transaksi, pembayaran aktif dihitung ulang, overpayment ditolak, konflik idempotency diblokir, dan status diperbarui menjadi partially_paid atau paid.
- **Reversal:** pembatalan payment menghitung ulang saldo dan mengembalikan status invoice ke posted atau partially_paid.
- **Invoice-PO:** vendor dan status PO divalidasi; nilai invoice dibatasi nilai barang yang telah diterima serta dikurangi invoice aktif sebelumnya.
- **Dashboard:** query PostgreSQL dijalankan sekuensial pada satu transaction client dan setiap query menerima jumlah parameter yang tepat.
- **Verifikasi:** 154 unit/API test lulus, 7 skip, typecheck lulus, lint file terkait lulus, production build lulus, Docker sehat, dan E2E purchasing multi-item/partial receiving/payment/reversal/detail vendor lulus.
