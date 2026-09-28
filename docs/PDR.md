# Product Definition & Requirements (PDR)

## Kontrol Dokumen

- Produk: Honda Dealer & Workshop Management System
- Baseline: 26 September 2026
- Status: Disetujui sebagai kontrak implementasi
- Kondisi awal: Prototipe katalog sparepart Phase 1
- Target: Sistem production lengkap Phase 1-4

## 1. Visi

Membangun satu platform operasional dealer dan bengkel Honda yang mengganti proses manual serta data tersebar menjadi sistem terintegrasi, aman, cepat, terukur, dan berbasis data.

> One System. One Data. Better Operation.

## 2. Masalah Bisnis

- Sparepart, stok, service, customer, vendor, dan keuangan dicatat terpisah.
- Pergerakan stok dan pembelian membutuhkan rekonsiliasi manual.
- Riwayat service kendaraan sulit ditelusuri.
- Penugasan, fee, dan performa mekanik belum konsisten.
- Owner terlambat memperoleh gambaran bisnis.
- Prototipe saat ini tidak memiliki authentication, authorization, dan RLS aman.

## 3. Outcome

- Satu sumber data operasional yang valid.
- Workflow service, inventory, purchasing, dan payment dapat ditelusuri end-to-end.
- Informasi stok dan low-stock tersedia real-time.
- Dashboard owner menyajikan revenue, expense, profit, service, inventory, payable, dan customer.
- Semua perubahan sensitif memiliki aktor dan audit trail.
- Sistem dapat dipasang mandiri tanpa Supabase.

## 4. Role

| Role | Tanggung jawab utama |
| --- | --- |
| Owner | Dashboard, laporan, approval, pengawasan user |
| Admin | Master data, user, konfigurasi, seluruh operasional |
| Cashier | Customer, Service Order, invoice, pembayaran |
| Mechanic | Pekerjaan ditugaskan, diagnosis, progres, penggunaan part |
| Warehouse | Produk, stok, receiving, adjustment, stock opname |
| Finance | Expense, payable, vendor payment, profitability |

Seluruh user internal wajib login. Setiap mutation membutuhkan permission. Mechanic hanya melihat pekerjaan relevan. Warehouse tidak melunasi kewajiban keuangan. Finance tidak mengubah stok. Owner/Admin tetap diaudit.

## 5. Ruang Lingkup

### Phase 1 - Foundation

- Authentication, session, user, role, permission.
- Produk, kategori, model kendaraan, kompatibilitas, barcode.
- Part code, nama, HET, HPP, unit, minimum stock, status.
- Search/filter database-side dan pagination.
- Import CSV dengan preview, validasi, deduplikasi, laporan.
- Migrasi data Supabase/CSV ke PostgreSQL.

### Phase 2 - Operational

- Customer dan kendaraan.
- Service Order dari kendaraan masuk sampai pembayaran/selesai.
- Keluhan, diagnosis, mekanik, jasa, sparepart, QC, service history.
- Warehouse, stock IN/OUT, balance, reservation, consumption, adjustment.
- Stock opname, movement history, low-stock alert.

### Phase 3 - Business

- Vendor, harga vendor, Purchase Order, approval, receiving.
- Vendor invoice, hutang, aging, pembayaran.
- Customer invoice dan pembayaran.
- Income, expense, HPP/COGS, gross profit, margin, mechanic fee.

### Phase 4 - Intelligence

- Customer profile, retention, follow-up, service reminder.
- Mechanic performance dan owner dashboard.
- Reporting service, inventory, purchasing, finance, customer.
- Top product, slow-moving, turnover, low stock, profit/margin.
- Export laporan dengan range terbatas.

### Service Order Desk (menggantikan POS retail)

- Kasir menerima pelanggan, mencari atau membuat data pelanggan, lalu memilih atau mendaftarkan kendaraan.
- Kasir mencatat kilometer, keluhan, jenis servis, kondisi fisik, barang bawaan, dan bahan bakar sebelum Service Order dibuat.
- Service Order menjadi dokumen transaksi utama: diagnosis, penugasan mekanik, jasa, sparepart, QC, invoice, pembayaran, dan serah-terima berjalan pada nomor order yang sama.
- Halaman `/pos` adalah pintu masuk Service Order Desk; daftar dan detail order tersedia di `/business/service-orders`.
- Kasir retail sparepart lama tetap tersedia sebagai fallback internal di `/retail-pos`, tetapi tidak menjadi alur navigasi utama bengkel.

## 6. Workflow Utama

- Service: Customer -> Vehicle -> Service Order -> Diagnosis -> Assign Mechanic -> Job/Part -> QC -> Invoice -> Payment -> Completed.
- Procurement: Vendor -> PO -> Approval -> Receiving -> Stock Movement -> Vendor Invoice -> Payable -> Payment.
- Inventory: setiap perubahan menghasilkan movement; balance diperbarui atomik; adjustment wajib alasan; opname menghasilkan adjustment, bukan overwrite.

## 7. Functional Requirements

- Login username/email dan password.
- Session opaque tersimpan di PostgreSQL; cookie HTTP-only, Secure di production, SameSite Lax.
- Logout/perubahan password mencabut session terkait.
- Backend memeriksa permission dan PostgreSQL memeriksa RLS.
- Product code unik setelah normalisasi.
- Money memakai `numeric`; status memakai nilai terkontrol; relasi memakai foreign key.
- Filter dilakukan sebelum pagination.
- Search mencakup kode, barcode, nama, kategori, dan kompatibilitas.
- Setiap metrik mendefinisikan range tanggal, timezone, dan sumber rekonsiliasi.

## 8. Non-Functional Requirements

### Security

- Tidak ada dependency, API, auth, atau key Supabase.
- Runtime DB role bukan superuser dan tidak memiliki `BYPASSRLS`.
- RLS diaktifkan dan dipaksa pada tabel bisnis.
- Semua input eksternal divalidasi runtime; SQL selalu parameterized.
- Mutation berbasis cookie dilindungi origin/CSRF control.
- Login/endpoint sensitif memiliki rate limit.
- Secret tidak masuk browser bundle atau log.

### Performance dan Reliability

- List umum target p95 < 500 ms; search 100.000 produk p95 < 750 ms; dashboard p95 < 2 detik.
- Pagination dan range laporan dibatasi.
- Schema hanya berubah melalui migration versioned.
- Workflow kritis memakai transaksi dan idempotency protection.
- Health/readiness tersedia; backup/restore didokumentasikan dan diuji.

### UX dan Accessibility

- Target WCAG 2.2 AA.
- Workflow utama dapat dijalankan dengan keyboard.
- Form, dialog, loading, empty, error, dan recovery state lengkap.
- Workflow mobile usable pada lebar 360 px.

## 9. Di Luar Scope Release Awal

- General ledger statutory lengkap, payroll, pajak, multi-company consolidation.
- Aplikasi native Android/iOS.
- Integrasi korporat Honda tanpa kontrak API resmi.

## 10. Metrik dan Release Gate

- 0 anonymous write dan 100% mutation membutuhkan permission.
- 100% tabel bisnis dilindungi RLS atau didokumentasikan sebagai referensi.
- 0 vulnerability production critical/high.
- Lint, typecheck, test, migration, build, dan Docker smoke lulus.
- Search/filter benar melampaui halaman pertama.
- Rekonsiliasi inventory/finance dan E2E service/procurement lulus.

Production release hanya setelah seluruh P0 dan P1 pada `docs/TODO.md` selesai, security/RLS suite lulus, migration database kosong berhasil, Docker sehat, dan backup/restore terverifikasi.
