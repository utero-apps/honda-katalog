# Finance Overview Trend Query

## Kendala

Endpoint `/api/v1/intelligence/finance-overview` mengembalikan HTTP 500 pada 28 September 2026 ketika dashboard memuat tren.

## Sumber

CTE PostgreSQL memakai alias `day` sesudah cast `::date__. Alias tersebut menyebabkan parser PostgreSQL gagal pada query `generate_series`.

## Perbaikan

Alias diganti menjadi `bucket` di CTE hari, revenue, cost, dan correlated subquery. Regression test sekarang memverifikasi token `AS bucket`.

## Dampak

Tidak ada data transaksi berubah. Hanya read-model Finance Overview yang diperbaiki.
