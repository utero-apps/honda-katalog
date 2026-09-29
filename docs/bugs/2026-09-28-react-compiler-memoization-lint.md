# React Compiler Memoization Lint

Tanggal: 2026-09-28

## Kendala

`npm run lint` penuh gagal enam error `react-hooks/preserve-manual-memoization` pada `src/app/page.tsx`, terutama `closeProductForm` dan `handleBarcode`.

## Sumber

Dependency array manual tidak sama dengan dependency yang diinferensikan React Compiler. Temuan sudah ada di modul katalog dan tidak berasal dari implementasi Page 9.

## Rencana Fix

Refactor callback katalog bersama state setter terkait, lalu jalankan regresi scanner, upload gambar, form produk, lint penuh, dan build. Perubahan tidak digabung ke pekerjaan Page 9 agar tidak memperluas blast radius tanpa audit UI katalog.
