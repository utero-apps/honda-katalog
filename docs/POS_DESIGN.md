# Point of Sale Design

## Tujuan

POS melayani penjualan sparepart langsung dengan transaksi PostgreSQL atomik, stok real-time, pembayaran tercatat, receipt dapat dicetak, serta audit tidak dapat dihapus.

## Pengguna dan Hak Akses

| Role | Akses |
| --- | --- |
| Owner/Admin | Baca, checkout, void, audit |
| Cashier | Baca dan checkout |
| Finance | Baca transaksi dan receipt |
| Role lain | Tidak mendapat akses POS secara default |

Permission domain: \`pos.read\`, \`pos.checkout\`, dan \`pos.void\`. UI hanya menyembunyikan aksi; API dan PostgreSQL RLS tetap menjadi kontrol utama.

## Alur Utama

1. Kasir memilih gudang dan pelanggan opsional.
2. Produk dicari lewat nama, part code, barcode keyboard, kamera, atau foto.
3. Produk aktif dengan stok tersedia masuk cart.
4. Kasir mengatur kuantitas, diskon transaksi, pajak, dan catatan.
5. Kasir memilih pembayaran tunai, transfer, kartu, atau lainnya.
6. Server mengunci data produk, menghitung ulang harga dan total, memvalidasi pembayaran, mencatat sale, item, pembayaran, dan stock movement dalam satu transaksi.
7. Receipt tampil dan dapat dicetak. Retry memakai idempotency key yang sama agar tidak membuat transaksi ganda.

## Layout

### Desktop

- Header berisi status POS, gudang, operator, dan nomor draft.
- Panel produk berisi input scan/search, tombol kamera, hasil produk, dan stok.
- Panel cart sticky berisi pelanggan, item, qty, ringkasan, dan tombol bayar.
- Dialog pembayaran serta receipt memakai focus trap.

### Tablet dan Mobile

- Produk tampil sebagai kartu tanpa scroll horizontal.
- Cart memakai panel penuh dengan ringkasan total selalu terlihat.
- Tombol scan, tambah, kurangi, hapus, dan bayar minimal \`44x44px\`.
- Bottom action memberi jumlah item, total, dan akses checkout.

## Data Model

- \`app.pos_sales\`: header sale, customer, warehouse, total, status, aktor, idempotency, metadata void.
- \`app.pos_sale_items\`: snapshot produk, HET/HPP, qty, diskon, line total.
- \`app.pos_payments\`: metode, nominal, referensi, waktu, penerima.
- \`app.stock_movements\`: ledger \`pos_sale\` dan kompensasi \`pos_return\`; transaksi lama tidak diubah atau dihapus.

## API

- \`GET /api/v1/pos/products\`: pencarian produk dan stok gudang.
- \`POST /api/v1/pos/checkout\`: checkout atomik dan idempotent.
- \`GET /api/v1/pos/sales\`: riwayat receipt.
- \`GET /api/v1/pos/sales/:id\`: detail receipt.
- \`POST /api/v1/pos/sales/:id/void\`: void beralasan dan stock movement kompensasi.

## Aturan Keamanan dan Integritas

- Semua mutation memerlukan session, permission, same-origin, validasi Zod, transaksi, forced RLS, dan audit.
- Harga/HPP diambil ulang dan disimpan sebagai snapshot pada checkout.
- Stock ledger menjaga saldo tidak negatif dan menangani race condition.
- Item diproses dalam urutan deterministik untuk mengurangi deadlock.
- Pembayaran non-tunai tidak boleh kurang atau lebih dari sisa tagihan.
- Tunai boleh lebih dan menghasilkan kembalian server-side.
- Void tidak menghapus sale; void menambah movement kompensasi dan metadata aktor/alasan.
- Tidak ada hard delete transaksi POS.

## UX dan Aksesibilitas

- Fokus awal pada input scan; \`F2\` kembali ke pencarian dan \`F8\` membuka pembayaran.
- Scanner kamera menjadi opsi, bukan ketergantungan; scanner USB/Bluetooth bekerja sebagai keyboard.
- Loading, kosong, error, retry, konflik stok, dan transaksi sedang diproses terlihat jelas.
- Fokus terlihat, label form eksplisit, error dekat field, \`aria-live\` untuk hasil scan dan checkout.
- Angka uang memakai tabular figures dan format IDR.

## Acceptance Criteria

- Produk dapat ditemukan lewat nama, part code, dan barcode.
- Cart menolak qty di atas stok dan checkout tanpa item.
- Checkout sukses menghasilkan receipt, payment, audit, serta pengurangan stok tepat sekali.
- Retry idempotent mengembalikan sale yang sama.
- Kasir tidak dapat void; owner/admin dapat void dengan alasan.
- Void mengembalikan stok tanpa menghapus ledger lama.
- Layout dapat dipakai pada mobile, tablet, desktop, keyboard, dan layar sentuh.
- Typecheck, lint, unit/API test, build, migration, Docker smoke, E2E, dan security matrix lulus.
