# Data Katalog

Folder ini menyimpan sumber data katalog untuk import dan rekonsiliasi.

Contoh migrasi data:

```powershell
npm run catalog:migrate -- --input data/catalog/import.csv --target api
```

Tambahkan `--apply` setelah hasil dry-run dan laporan valid.
