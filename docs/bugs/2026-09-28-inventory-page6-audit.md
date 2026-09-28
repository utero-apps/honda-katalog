# Audit Inventory Page 6 - 2026-09-28

## P0 - Read API ledger belum tersedia - selesai

- **Sumber:** `src/app/api/v1/operations/inventory/movements/route.ts` hanya
  mengekspor `POST`.
- **Dampak:** Page 6 tidak dapat menampilkan audit trail stock IN/OUT, referensi
  receipt/SO/POS, unit cost, atau actor secara aman dari API.
- **Perbaikan:** `GET` berizin `inventory.read` sudah ditambahkan dengan filter
  warehouse/product/type/date. `unitCost` dan nilai movement menjadi `null`
  untuk role tanpa akses biaya.

## P0 - Read API PO, receipt, dan opname belum tersedia - selesai

- **Sumber:** route masing-masing hanya menyediakan mutation `POST` (dan status
  PO `PATCH`), sehingga request `GET` akan `405`.
- **Dampak:** Page 6 tidak dapat menelusuri sumber stock IN atau status opname;
  integrasi UI akan memerlukan query baru atau data duplikat.
- **Perbaikan:** endpoint list sudah ditambahkan dengan permission, filter,
  progress ordered-vs-received, total receipt, dan progress/difference opname.

## P1 - Kontrak POS stock-out perlu verifikasi live

- **Sumber:** audit route finance mengonsumsi `pos_sale_items.unit_cost`, tetapi
  audit ini tidak mengubah checkout POS dan tidak menjalankan transaksi write.
- **Dampak:** HPP POS dapat salah nol atau tidak sinkron bila checkout tidak
  menyalin unit cost dan movement keluar secara atomik.
- **Perbaikan:** agent POS menambah E2E write terisolasi: saldo sebelum/sesudah,
  satu movement referensi sale, unit cost item, finance overview HPP, dan reverse
  saat void.

## P1 - Visibility HPP lintas peran belum teruji - selesai

- **Sumber:** balances memakai `inventory.read`; finance overview memakai
  `finance.read`. Belum ada read ledger untuk memisahkan kolom cost.
- **Dampak:** implementasi Page 6 berisiko membocorkan `unitCost`/HPP ke role
  gudang atau kasir.
- **Perbaikan:** read-model dan ledger meredaksi nilai biaya untuk role non-finance;
  route test memverifikasi kontrak redaksi tersebut.

## Batas audit

Tidak ada file Page 6/Inventory yang diubah. `scripts/e2e-inventory.mjs` bersifat
read-only dan melaporkan endpoint read yang belum ada sebagai capability gap.
