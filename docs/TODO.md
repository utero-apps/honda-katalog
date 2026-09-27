# Master TODO

## Aturan

- File ini adalah source of truth implementasi.
- Task selesai hanya setelah code, test, dan bukti tersedia.
- P0 memblokir production; P1 memblokir complete release; P2 enhancement.
- Status disinkronkan 27 September 2026; checkbox selesai berarti code dan quality gate tersedia. Item E2E tetap terbuka sampai workflow terverifikasi end-to-end.

## 0. Documentation

- [x] DOC-001 [P0] PDR.
- [x] DOC-002 [P0] SDD.
- [x] DOC-003 [P0] Design System.
- [x] DOC-004 [P0] Architecture.
- [x] DOC-005 [P0] Agent Operating Model.
- [x] DOC-006 [P0] Master TODO.
- [x] DOC-007 [P1] README aktual.
- [x] DOC-008 [P1] Backup, restore, incident, release runbook.

## 1. Foundation

- [x] FND-001 [P0] Upgrade Next.js patched dan lockfile.
- [x] FND-002 [P0] Hapus Supabase dependency/env/code.
- [x] FND-003 [P0] Tambah `pg`, Zod, test tooling, npm canonical.
- [x] FND-004 [P0] Bentuk `features` dan `server` boundaries.
- [x] FND-005 [P1] Environment validation fail-fast.
- [x] FND-006 [P1] Response envelope, request ID, safe error, structured log.
- [x] FND-007 [P1] Security headers/CSP dan route boundaries.

## 2. PostgreSQL

- [x] DB-001 [P0] PostgreSQL service, volume, health check.
- [x] DB-002 [P0] Pisahkan migration owner dan runtime role.
- [x] DB-003 [P0] Migration runner dan ledger.
- [x] DB-004 [P0] Identity/security schema.
- [x] DB-005 [P0] Catalog schema, constraints, indexes.
- [x] DB-006 [P0] Customer/vehicle/service/mechanic schema.
- [x] DB-007 [P0] Inventory ledger dan balance schema.
- [x] DB-008 [P0] Vendor/PO/receiving schema.
- [x] DB-009 [P0] Invoice/payment/expense/fee schema.
- [x] DB-010 [P1] CRM/reporting structures.
- [x] DB-011 [P0] Enable/force RLS semua tabel bisnis.
- [x] DB-012 [P0] Least-privilege grant dan policy.
- [x] DB-013 [P0] RLS matrix integration tests.
- [x] DB-014 [P1] Seed role, permission, admin, category, model, warehouse.

## 3. Authentication dan Security

- [x] SEC-001 [P0] Password hashing/verification.
- [x] SEC-002 [P0] Opaque DB sessions.
- [x] SEC-003 [P0] Login/logout/current-user API dan UI.
- [x] SEC-004 [P0] RBAC permission checks.
- [x] SEC-005 [P0] Transaction-local RLS identity.
- [x] SEC-006 [P0] Origin/CSRF protection.
- [ ] SEC-007 [P1] Rate limit, rotation, expiry, revocation.
- [x] SEC-008 [P1] Audit events.
- [ ] SEC-009 [P0] Test anonymous, IDOR, escalation, injection, replay.
- [x] SEC-010 [P0] Hapus raw backend error dari response.

## 4. Phase 1 - Catalog

- [x] CAT-001 [P0] Product/category/model/compatibility services.
- [x] CAT-002 [P0] Paginated DB-side search/filter.
- [x] CAT-003 [P0] Product CRUD validation/permission.
- [x] CAT-004 [P1] Barcode CRUD/scanner.
- [x] CAT-005 [P1] HET, HPP, unit, minimum stock, lifecycle.
- [x] CAT-006 [P1] Normalisasi category/compatibility.
- [x] CAT-007 [P1] Accessible responsive catalog UI.
- [x] CAT-008 [P0] CSV preview/validation/dedup/report.
- [ ] CAT-009 [P0] Supabase/current-data export/import.
- [x] CAT-010 [P0] Reconcile count, duplicate, price, search.
- [x] CAT-011 [P1] Catalog unit/integration/API/E2E tests.

## 5. Phase 2 - Operational

- [x] P2-001 [P1] Customer dan vehicle management.
- [x] P2-002 [P1] Mechanic management.
- [x] P2-003 [P1] Service Order state machine.
- [x] P2-004 [P1] Complaint, diagnosis, assignment, job, part, QC.
- [x] P2-005 [P1] Service history.
- [x] P2-006 [P1] Warehouse dan stock overview.
- [x] P2-007 [P0] Transactional stock movements/balances.
- [x] P2-008 [P1] Reservation/service consumption.
- [x] P2-009 [P1] Adjustment dan stock opname.
- [x] P2-010 [P1] Low-stock alert.
- [x] P2-011 [P1] Service/inventory RLS/API/E2E tests.

## 6. Phase 3 - Business

- [x] P3-001 [P1] Vendor dan vendor-product.
- [x] P3-002 [P1] PO lifecycle/approval.
- [x] P3-003 [P0] Receiving atomik dengan stock posting.
- [x] P3-004 [P1] Vendor invoice/payable aging.
- [x] P3-005 [P1] Customer invoice dari Service Order.
- [x] P3-006 [P1] Customer/vendor payment.
- [x] P3-007 [P1] Income/expense.
- [x] P3-008 [P1] HPP/COGS/profit/margin.
- [x] P3-009 [P1] Mechanic fee.
- [x] P3-010 [P0] Reversal posted records.
- [x] P3-011 [P1] Reconciliation/E2E tests.

## 7. Phase 4 - Intelligence

- [x] P4-001 [P1] Customer profile/history.
- [x] P4-002 [P1] Follow-up/reminder.
- [x] P4-003 [P1] Mechanic performance.
- [x] P4-004 [P1] Owner dashboard.
- [x] P4-005 [P1] Domain reports.
- [x] P4-006 [P1] Product, retention, turnover metrics.
- [x] P4-007 [P2] CSV export.
- [x] P4-008 [P1] Report reconciliation tests.

## 8. UX dan Accessibility

- [x] UX-001 [P1] App shell dan permission navigation.
- [x] UX-002 [P1] Reusable component system.
- [ ] UX-003 [P1] Dialog/focus/keyboard.
- [ ] UX-004 [P1] Label/error association.
- [x] UX-005 [P1] Loading/empty/error/recovery.
- [ ] UX-006 [P1] Mobile 360 px verification.
- [ ] UX-007 [P1] Accessibility tests.

## 9. Audit Remediation

- [x] AUD-001 [P0] Hapus anonymous mutation dan disabled RLS.
- [x] AUD-002 [P0] Perbaiki vulnerable dependency chain.
- [x] AUD-003 [P0] Runtime validation seluruh boundary.
- [x] AUD-004 [P1] Perbaiki search race dan scanner lifecycle.
- [x] AUD-005 [P1] Constraint uniqueness/price/status/relasi.
- [x] AUD-006 [P1] Hapus detail error dan secret exposure.
- [x] AUD-007 [P1] Ganti manual SQL dengan migrations.
- [x] AUD-008 [P1] Hapus fixture mati setelah reconciliation.
- [x] AUD-009 [P0] Lint lulus tanpa warning.

## 10. Test, DevOps, Release

- [x] QA-001 [P0] Unit/integration/E2E tooling dan test DB.
- [x] QA-002 [P0] Empty DB migration dan RLS matrix pass.
- [x] QA-003 [P1] Main API/workflow tests.
- [x] QA-004 [P0] Lint, typecheck, tests, build pass.
- [x] QA-005 [P0] 0 critical/high production audit.
- [x] OPS-001 [P0] Production-safe Docker Compose.
- [x] OPS-002 [P0] PostgreSQL private dan web non-root.
- [x] OPS-003 [P1] CI, health/readiness, structured logs.
- [x] OPS-004 [P1] Backup/restore scripts dan verification.
- [x] REL-001 [P0] Tidak ada runtime Supabase reference.
- [x] REL-002 [P0] Main Phase 1-4 E2E pass.
- [ ] REL-003 [P0] Docker smoke dan final security audit pass.
