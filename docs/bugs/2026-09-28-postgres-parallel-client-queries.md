# PostgreSQL parallel query warning - 28 September 2026

## Kendala

Log container menampilkan peringatan `pg`: query berjalan paralel pada satu
client yang sedang mengeksekusi query lain. Pola ini deprecated dan akan
dihapus pada `pg@9`.

## Sumber

- `src/features/service-orders/service.ts` menjalankan tujuh query workflow
  dengan `Promise.all` pada satu `PoolClient` transaction.
- `src/app/api/v1/operations/service-orders/[id]/details/route.ts` menjalankan
  empat query detail dengan pola sama.
- `src/app/api/v1/operations/customers/[id]/profile/route.ts` menjalankan
  delapan query Customer 360 dengan pola sama.

## Perbaikan

Query dalam transaction dijalankan berurutan. Kontrak respons dan data tidak
berubah; transaction-local RLS, ordering, serta rollback tetap berlaku.
