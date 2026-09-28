# POS Open Bill Test Plan

## Scope

- `GET /api/v1/pos/services`: katalog jasa aktif, harga server-side, tanpa data biaya internal.
- `GET`, `PUT`, dan `DELETE /api/v1/pos/open-bill`: satu Open Bill aktif per pelanggan, daftar item utuh, pembatalan eksplisit.
- `POST /api/v1/pos/checkout`: item produk dan jasa campuran, `openBillId` dikonversi atomik.
- `GET /api/v1/pos/products`: `imageUrl` aman untuk UI, tanpa HPP atau biaya unit.

## Request and Response

| Area | Positive path | Negative path |
| --- | --- | --- |
| Services | Kasir membaca jasa aktif dan harga | Anonim `401`; mechanic/warehouse `403`; respons tidak mengandung HPP |
| Open Bill GET | Pelanggan pemilik membaca bill aktif | Anonim `401`; customer lain memperoleh `404` tanpa data; origin lintas situs `403` untuk mutasi |
| Open Bill PUT | Simpan produk+jasa, penyimpanan ulang mengganti item pada bill yang sama | Tanpa customer `422`; service/product nonaktif `409`; customer lain tidak dapat menimpa bill |
| Open Bill DELETE | Menghapus bill pemilik | ID acak atau milik pelanggan lain `404`; anon/role tak berizin ditolak |
| Checkout | Produk+jasa menghasilkan sale tunggal dan bill berubah menjadi converted | `openBillId` milik customer lain `404`; item berubah `409`; idempotency payload beda `409` |
| Inventory | Checkout produk mengurangi stok satuan; checkout jasa tidak membuat stock movement | Simpan/open bill tidak mengurangi atau mereservasi stok |
| Product image | `imageUrl` nullable/URL valid dan fallback UI tidak menggeser kartu | URL tidak boleh memuat secret, path lokal, atau data internal |
| RLS locking | Cashier membaca dan memakai produk aktif yang sama | `SELECT ... FOR UPDATE` tidak boleh menyembunyikan produk dari role `cashier` yang memiliki `pos.sell` |

## Automation

- `src/app/api/v1/pos/open-bill.contract.test.ts`: integrasi opt-in melalui `POS_OPEN_BILL_E2E_ENABLED=true`.
- `scripts/e2e-api.mjs`: smoke E2E ketika flag sama aktif.
- `scripts/security-api.mjs`: anonymous, role, origin, dan IDOR ketika `POS_OPEN_BILL_SECURITY_ENABLED=true`.

## Acceptance Gate

- Produk dan jasa dapat muncul pada satu Open Bill dan satu receipt.
- Pelanggan hanya memiliki satu Open Bill `open`; PUT berulang mempertahankan ID bill.
- Checkout sukses berulang dengan payload/idempotency key sama mengembalikan sale sama; stok produk hanya turun sekali.
- Tidak ada mutasi stok untuk jasa atau saat Open Bill disimpan.
- Semua endpoint mutasi memeriksa origin; setiap read/mutation memeriksa session dan permission.
- Produk yang terlihat pada `GET /pos/products` harus dapat dipakai pada Open Bill oleh cashier tanpa `PRODUCT_NOT_FOUND` akibat policy lock.
