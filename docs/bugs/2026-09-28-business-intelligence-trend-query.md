# Business Intelligence trend query gagal

## Kendala

Endpoint `GET /api/v1/intelligence/business-overview` mengembalikan HTTP `500` saat dijalankan pada PostgreSQL.

## Sumber

CTE kalender dan kumpulan transaksi memakai alias kolom `day`. PostgreSQL membaca `day` sebagai bagian sintaks interval pada konteks query tersebut dan menghentikan parsing di deklarasi alias.

## Perbaikan

Alias diganti menjadi `bucket`, lalu seluruh referensi `SELECT`, `JOIN`, `GROUP BY`, dan `ORDER BY` diselaraskan. Query diuji langsung melalui PostgreSQL dan endpoint diuji kembali melalui container aplikasi.
