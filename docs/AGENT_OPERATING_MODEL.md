# Agent Operating Model

## 1. Tujuan

Menentukan pembagian kerja, integrasi, review, dan validasi agar implementasi tetap mengikuti PDR, SDD, Architecture, Design System, dan Master TODO.

## 2. Lead Agent

- Memegang keputusan architecture dan konsistensi lintas domain.
- Menjaga status `docs/TODO.md`.
- Melindungi perubahan user dan instruksi repository.
- Mengintegrasikan pekerjaan dalam urutan dependency.
- Memvalidasi keputusan security-sensitive.
- Menjalankan final lint, typecheck, tests, migrations, build, Docker, dan security checks.
- Tidak menandai task selesai tanpa bukti.

## 3. Specialized Agents

### Database & RLS

Menangani migration, seed, grant, constraint, index, policy, dan RLS test. Tidak boleh melemahkan RLS agar test aplikasi lulus.

### Identity & Security

Menangani password, session, RBAC, CSRF/origin, rate limit, security event, dan privileged endpoint review.

### Catalog & Migration

Menangani produk, barcode, kategori, kompatibilitas, import CSV, migrasi Supabase, count/duplicate reconciliation.

### Service & CRM

Menangani customer, vehicle, Service Order, mechanic, QC, history, reminder, follow-up.

### Inventory & Purchasing

Menangani warehouse, movement ledger, balance, opname, vendor, PO, receiving. Stock mutation wajib transactional dan auditable.

### Finance & Reporting

Menangani invoice, payment, expense, payable, HPP/COGS, profit, fee, dashboard, report, reconciliation test.

### Frontend & Design System

Menangani shell, components, forms, responsive states, accessibility, dan konsistensi `docs/DESIGN_SYSTEM.md`.

### QA & Security Validation

Menangani unit/integration/E2E/security test dan adversarial verification secara independen.

### DevOps & Documentation

Menangani Docker, environment, CI, health, migration command, backup/restore, README, runbook.

## 4. Aturan Paralel

- Task harus konkret, terbatas, dan memiliki acceptance criteria.
- Agent penulis kode mendapat write scope yang tidak tumpang tindih.
- Blocking architecture tetap di lead.
- Dua agent tidak mengubah migration/domain file sama bersamaan.
- Laporan agent wajib memuat changed paths, validation, risk, assumption.
- Lead mereview sebelum integrasi.
- Jika subagent tidak tersedia, lead menjalankan peran yang sama secara berurutan; quality gate tidak berubah.

## 5. Urutan Eksekusi

1. Documentation baseline.
2. Dependency dan project structure.
3. PostgreSQL role, migration, RLS, seed.
4. Auth, permission, backend infrastructure.
5. Phase 1 catalog/migration.
6. Phase 2 service/inventory.
7. Phase 3 purchasing/finance.
8. Phase 4 CRM/dashboard/reporting.
9. UX/accessibility hardening.
10. Test/security verification.
11. Docker/CI/backup/restore release gate.

## 6. Definition of Done

- Acceptance criteria selesai.
- Input divalidasi runtime.
- Authorization dan RLS diterapkan/ditinjau.
- Error/loading/empty state tersedia.
- Test ditambah dan lulus.
- Dokumentasi dan TODO diperbarui.
- Tidak ada secret atau generated artifact masuk commit.

## 7. Security Checklist

Setiap endpoint sensitif harus menjawab: siapa pemanggil; bagaimana identity dibuktikan; permission apa; row mana; apakah RLS menegakkan; apakah ID dapat dimanipulasi; apakah input dibatasi; apakah retry aman; apakah mutation diaudit; error aman apa yang dikirim.

## 8. Testing Escalation

1. Unit modul.
2. Repository integration.
3. API integration.
4. RLS matrix.
5. E2E workflow.
6. Lint/typecheck.
7. Production build.
8. Docker health smoke.
9. Dependency/secret scan.

Root cause diperbaiki; failure tidak boleh disembunyikan.

## 9. Change Safety

- Jangan menjalankan destructive production SQL atau reset database production.
- Migration test memakai database disposable/local.
- Secret selalu diredaksi.
- Migrasi data dimulai dengan export dan reconciliation.
- Existing user changes dipertahankan kecuali langsung diganti oleh scope yang telah disetujui.

## 10. Checkpoint Report

Setiap checkpoint melaporkan TODO ID selesai, file berubah, command/test, bukti RLS/security, risk tersisa, dan langkah dependency berikutnya.
