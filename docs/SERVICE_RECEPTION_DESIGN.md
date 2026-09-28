# Service Reception Design

## Tujuan

Service Reception menjadi pintu masuk motor sebelum proses bengkel. Workflow menjaga hubungan Customer -> Vehicle -> Service Order -> Mechanic -> Sparepart/Jasa -> QC -> Invoice -> Payment -> Motor Keluar.

## Alur Kasir

1. Cari pelanggan melalui nama, telepon, atau plat nomor.
2. Pilih pelanggan lama atau buat pelanggan baru.
3. Pilih kendaraan pelanggan atau tambah kendaraan baru.
4. Catat kilometer masuk, keluhan, kondisi awal, barang bawaan, dan catatan.
5. Pilih jenis layanan: service biasa, bulanan, berdasarkan KM, atau rutin.
6. Tinjau rekomendasi awal berdasarkan jenis layanan dan riwayat kendaraan.
7. Konfirmasi dan buat Service Order atomik.

## Data

- Customer: nama, telepon/email, alamat, catatan.
- Vehicle: customer, model, plat unik, tahun, VIN, nomor mesin, kilometer terakhir.
- Reception: service type, kilometer masuk, kondisi fisik, level bensin, barang bawaan, catatan penerimaan.
- Odometer log: histori immutable per kunjungan, sumber dan alasan koreksi.
- Recommendation: item pekerjaan awal, alasan, status diterima/ditolak.
- Service Order: customer, vehicle, keluhan, mekanik opsional, status open.

## Aturan Integritas

- Service wajib memiliki customer dan vehicle; tidak ada pelanggan umum.
- Vehicle harus dimiliki customer yang dipilih.
- Plat nomor unik dan dinormalisasi server-side.
- Kilometer tidak boleh turun dari catatan terakhir tanpa alasan koreksi.
- Create reception memakai idempotency key dan satu transaksi PostgreSQL.
- Gagal pada customer, vehicle, reception, odometer, recommendation, atau service order membatalkan seluruh transaksi.
- Semua mutation memakai session, permission, same-origin, Zod, forced RLS, dan audit.

## API Contract

- `GET /api/v1/operations/service-reception/search?query=` mencari customer, telepon, dan plat.
- `POST /api/v1/operations/service-reception/customers` membuat customer baru dengan duplicate warning.
- `POST /api/v1/operations/service-reception/vehicles` menambah vehicle milik customer.
- `POST /api/v1/operations/service-reception/orders` membuat reception dan Service Order atomik.

## UX

- Desktop memakai stepper, form utama, dan ringkasan sticky.
- Mobile memakai satu langkah per layar dengan bottom action.
- Draft lokal per pengguna; data sensitif dibersihkan setelah sukses.
- Semua target sentuh minimal 44px, label terlihat, fokus terlihat, error dekat field, dan status memakai `aria-live`.

## Acceptance Criteria

- Customer lama dapat ditemukan lewat nama, telepon, atau plat.
- Customer dan motor baru dapat ditambahkan dari flow yang sama.
- Motor kedua dapat ditambahkan tanpa menduplikasi customer.
- Kilometer, keluhan, jenis service, dan checklist tersimpan.
- Service Order dan histori kilometer tercipta tepat sekali.
- Ownership, duplicate plate, odometer regression, IDOR, role, origin, dan replay diuji.
