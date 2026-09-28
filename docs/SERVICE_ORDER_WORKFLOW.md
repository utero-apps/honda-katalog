# Service Order Workflow

## Tujuan

Workflow mengawal motor dari order dibuka sampai pekerjaan, QC, invoice, pembayaran, dan penyerahan selesai dengan histori status serta mutasi stok yang dapat diaudit.

## Alur Operasional

1. `POST /api/v1/operations/service-orders` membuat order `open` setelah customer-vehicle tervalidasi.
2. `POST /service-orders/:id/details` dengan `diagnosis` mencatat diagnosis dan dapat menetapkan mekanik.
3. Action `job` menambah jasa; `reserve_part` menahan stok tersedia; `consume_part` membuat stock movement sekali.
4. `PATCH /service-orders/:id/status` memindahkan `open/assigned → in_progress → quality_check`.
5. Action `quality_check` menyimpan hasil QC. QC gagal harus kembali ke `in_progress`.
6. `POST /api/v1/operations/service-orders/:id/invoice` membentuk invoice dari job dan part lalu memindahkan order ke `invoiced`.
7. `POST /api/v1/operations/service-orders/:id/invoice` dengan action `record_payment` mengunci invoice, menghitung outstanding, menerima pembayaran parsial, dan menolak jumlah melebihi outstanding. Replay dengan idempotency key sama mengembalikan payment sama.
8. `POST /api/v1/operations/service-orders/:id/workflow` dengan action `handover` hanya tersedia setelah QC lulus dan invoice lunas; action ini memindahkan `invoiced → paid → completed` atomik serta menyimpan penerima/waktu serah-terima.

## State Machine

| Dari | Tujuan valid | Catatan |
| --- | --- | --- |
| `open` | `assigned`, `in_progress`, `cancelled` | Diagnosis dengan mekanik dapat membuat `assigned` |
| `assigned` | `in_progress`, `cancelled` | Mekanik mulai bekerja |
| `in_progress` | `quality_check`, `cancelled` | Semua job/part seharusnya final sebelum QC |
| `quality_check` | `in_progress`, `invoiced` | Kembali jika gagal; invoice jika lulus |
| `invoiced` | `paid` melalui payment penuh | Payment parsial tetap `invoiced`; invoice lunas memindahkan order ke `paid` |
| `paid` | `completed` dalam `handover` | Penyerahan motor dan histori status atomik |
| `completed`, `cancelled` | tidak ada | Terminal |

## Test Matrix

| Priority | Area | Skenario | Hasil wajib |
| --- | --- | --- | --- |
| P0 | Auth/origin | Anonymous, role tanpa izin, cross-origin mutation | `401`/`403`; tidak ada write |
| P0 | Ownership | Vehicle bukan milik customer; order/part ID asing | Error aman tanpa data leakage |
| P0 | State machine | Lompat `open → paid`, terminal mutation, QC bypass | `409 INVALID_STATE_TRANSITION` |
| P0 | Inventory | Reserve memakai available stock; consume replay | Stok tidak negatif; movement hanya sekali |
| P0 | Finance | Invoice setelah QC; payment replay; urutan paid/completed | Satu invoice/payment; histori lengkap |
| P0 | Payment integrity | Partial payment, full payment, overpayment | Outstanding akurat; overpayment `409`; invoice tidak dapat handover sebelum lunas |
| P1 | Diagnosis/job/QC | Assign mekanik, tambah job, QC upsert | Detail dan actor history konsisten |
| P1 | Atomicity | Kegagalan invoice/payment/consume | Tidak ada status atau stok parsial |
| P1 | Concurrency | Dua reserve/consume/status bersamaan | Lock mencegah oversell/double transition |
| P2 | Validation | UUID, nilai negatif, payload terlalu panjang | `422 VALIDATION_ERROR` terstruktur |
| P2 | Read model | Detail jobs/parts/history/QC | Urutan dan tipe data stabil |
| P2 | Audit | Actor, reason, request ID | Perubahan sensitif dapat ditelusuri |
| P3 | Performance | Order dengan banyak job/part/history | Respons tetap dalam target operasional |
| P3 | UX recovery | Reload/retry setelah network failure | Server state dapat dipulihkan tanpa duplikasi |

## Known Gaps

- Endpoint legacy status masih harus dibatasi agar tidak dapat melewati workflow endpoint baru.
- Kontrak payment atomik perlu dijalankan pada Docker/database sebelum ditandai verified.
- Action `job` dan `quality_check` legacy mengandalkan foreign key untuk order tidak dikenal; error API aman perlu dipastikan.
- Handover harus menerima status `paid`; implementasi saat ini masih memeriksa `invoiced`, sehingga handover order lunas tertolak.

## Automation

- Unit/route: `src/app/api/v1/operations/service-orders/service-order-workflow.test.ts`.
- E2E: `node --env-file-if-exists=.env.local scripts/service-order-e2e.mjs`.
- E2E membutuhkan database ter-migrasi, seed admin, register/warehouse, dan aplikasi aktif.
