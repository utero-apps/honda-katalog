# Inventory Page 6 - Integration Contract

## Tujuan

Page 6 menampilkan stok operasional sebagai read model. Sumber kebenaran tetap
`app.stock_movements`; `app.inventory_balances` adalah saldo terproyeksi per
gudang dan produk.

## Alur stok masuk: PO ke penerimaan

1. Pengadaan membuat PO melalui `POST /api/v1/business/purchase-orders`
   (`purchasing.write`).
2. PO berpindah `draft -> submitted -> approved`; persetujuan memerlukan
   `purchasing.approve`.
3. Gudang menerima barang melalui `POST /api/v1/business/receipts`
   (`inventory.receive`). Hanya PO `approved` atau `partially_received` yang
   diterima.
4. Setiap item penerimaan menulis `stock_movements` bertipe `receiving`,
   kuantitas positif, unit cost dari receipt, dan referensi `goods_receipt`.
5. Proyeksi saldo bertambah. Receipt idempotent memakai `idempotencyKey`; jumlah
   tidak boleh melebihi kuantitas PO.

## Alur stok keluar: Service Order dan POS

1. SO me-reserve part dengan `inventory.adjust`; ini menaikkan
   `reserved_quantity`, bukan mengurangi stok fisik.
2. Saat part dikonsumsi, SO menulis movement `service_usage` dengan kuantitas
   negatif, mengurangi reservation, lalu menyimpan `consumed_at` pada part SO.
3. Checkout POS yang selesai menulis item penjualan dan movement stok keluar.
   Void harus mengembalikan stok melalui movement lawan, bukan mengubah saldo
   langsung.
4. Page 6 perlu membedakan `quantity`, `reservedQuantity`, dan stok tersedia
   (`quantity - reservedQuantity`) agar stok terpesan tidak tampak siap jual.

## Opname dan adjustment

1. Buat snapshot melalui `POST /api/v1/operations/inventory/opnames`
   (`inventory.adjust`). Snapshot mengambil saldo saat mulai hitung.
2. Posting seluruh item melalui `POST /api/v1/operations/inventory/opnames/:id/post`.
   Selisih nonnol menulis movement `opname`; opname tidak boleh dipost dua kali
   atau saat ada item belum dihitung.
3. Adjustment manual memakai `POST /api/v1/operations/inventory/movements`.
   Tipe masuk harus positif dan tipe keluar harus negatif; mutation wajib origin
   sama serta idempotency key.

## Finance HPP

- `GET /api/v1/intelligence/finance-overview` (`finance.read`) menghitung HPP
  dari `service_order_parts.quantity * unit_cost` yang sudah dikonsumsi dan
  `pos_sale_items.quantity * unit_cost` pada POS selesai.
- Receipt menyimpan unit cost pada movement; alur perlu memastikan cost ini
  terpropagasi ke `service_order_parts.unit_cost` dan `pos_sale_items.unit_cost`.
  Page 6 tidak boleh menampilkan HPP kepada role tanpa `finance.read`.

## Read API Page 6

| Kebutuhan | Endpoint | Status |
| --- | --- | --- |
| Ringkasan saldo per gudang/produk | `GET /api/v1/operations/inventory/balances` | Ada, `inventory.read` |
| Dashboard inventory, tren, low stock, top usage | `GET /api/v1/intelligence/inventory-overview` | Ada, `inventory.read`; nilai modal disembunyikan dari role non-finance |
| Ledger movement | `GET /api/v1/operations/inventory/movements` | Ada, filter gudang/produk/tipe/periode |
| Daftar/detail PO | `GET /api/v1/business/purchase-orders` | Ada, `purchasing.read` |
| Daftar/detail receipt | `GET /api/v1/business/receipts` | Ada, `purchasing.read` |
| Daftar/detail opname | `GET /api/v1/operations/inventory/opnames` | Ada, `inventory.read` |
| Ringkasan HPP finance | `GET /api/v1/intelligence/finance-overview` | Ada, `finance.read` |

## E2E smoke

Jalankan tanpa mutation:

```powershell
$env:BOOTSTRAP_ADMIN_PASSWORD = "..."
node scripts/e2e-inventory.mjs
```

Script memverifikasi autentikasi anonymous, login, saldo, dashboard inventory,
ledger, PO, receipt, opname, dan rekonsiliasi ringkas Finance. Set
`E2E_BASE_URL` dan `BOOTSTRAP_ADMIN_EMAIL` bila perlu.
