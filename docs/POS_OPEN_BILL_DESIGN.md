# POS Open Bill Design

## Tujuan

Kasir dapat menyimpan keranjang pelanggan sebagai Open Bill, membuka pelanggan yang sama pada sesi berikutnya, lalu melanjutkan transaksi tanpa input ulang.

## Aturan Domain

- Satu pelanggan memiliki maksimal satu Open Bill aktif.
- Pelanggan umum tidak disimpan otomatis karena tidak memiliki identitas stabil.
- Perubahan item pelanggan tersimpan otomatis setelah debounce.
- Produk tidak melakukan reservasi stok; stok dikunci dan divalidasi saat checkout.
- Jasa tidak membuat stock movement.
- Checkout campuran produk dan jasa menghasilkan satu receipt dan mengubah Open Bill menjadi converted secara atomik.
- Mengosongkan seluruh item membatalkan Open Bill aktif.

## Katalog Jasa Awal

1. Jasa Ganti Oli.
2. Servis Ringan.
3. Servis Lengkap.
4. Jasa Ganti Sparepart.

Jasa tampil sebelum sparepart pada POS. Harga dihitung server-side dari katalog jasa aktif.

## UX

- Status eksplisit: Belum disimpan, Menyimpan, Open Bill tersimpan, atau Gagal menyimpan.
- Kartu jasa dan produk memakai rasio 1:1 dengan target sentuh minimal 44 px.
- Area gambar memiliki ukuran tetap agar grid tidak berubah saat gambar tersedia.
- Gambar gagal dimuat diganti fallback kategori tanpa layout shift.
