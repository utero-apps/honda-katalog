# System Architecture

## 1. Gaya Arsitektur

Release lengkap pertama memakai modular monolith. Next.js menyediakan UI dan HTTP backend milik sendiri; PostgreSQL menyediakan data durable, constraint, transaction, dan RLS.

Pilihan ini menjaga konsistensi workflow lintas service, inventory, purchasing, dan finance tanpa kompleksitas microservice prematur. Domain dapat diekstrak setelah kebutuhan scale atau ownership terbukti.

## 2. Context

```text
User -> HTTPS/Reverse Proxy -> Next.js
                              - React UI
                              - Route Handler API
                              - Auth/RBAC
                              - Domain Services
                              - Reporting
                                      |
                                      v
                                PostgreSQL
                                - Constraints
                                - Transactions
                                - Forced RLS
                                - Audit
```

Integrasi eksternal wajib melalui adapter, bukan akses database langsung.

## 3. Domain Boundaries

- Identity: user, role, permission, session, security event.
- Catalog: produk, kategori, barcode, model, kompatibilitas, harga.
- Customer/Vehicle: customer dan kendaraan milik customer.
- Service: Service Order, job, diagnosis, assignment, part, QC, history.
- Inventory: warehouse, balance, movement, reservation, adjustment, opname.
- Purchasing: vendor, PO, approval, receiving.
- Finance: invoice, payment, expense, payable, HPP/COGS, fee, profit.
- CRM: follow-up, reminder, retention.
- Reporting: read model dan aggregate; tidak boleh memutasi transaksi sumber.

## 4. Dependency Direction

```text
UI -> API -> Domain Service -> Repository -> PostgreSQL
                  |-> Authorization
                  |-> Audit
```

- UI tidak mengakses DB.
- API tidak memuat business SQL.
- Repository tidak menentukan HTTP response.
- Domain service memiliki state transition dan transaction boundary.
- Reporting membaca domain; domain tidak bergantung pada reporting.

## 5. Security Architecture

Browser selalu tidak dipercaya. Session membuktikan identity, bukan otomatis authorization. Setiap transaksi bisnis mengatur context lokal:

```sql
BEGIN;
SELECT set_config('app.user_id', $1, true);
SELECT set_config('app.user_role', $2, true);
SELECT set_config('app.request_id', $3, true);
-- parameterized queries
COMMIT;
```

Context hilang/invalid menghasilkan no row. Runtime role tidak dapat mematikan RLS. Lapisan pertahanan: TLS/request limit, headers, cookie/origin, rate limit, validation, permission, grants/RLS, constraints/state machine, audit/monitoring.

## 6. State Machines

- Service Order: `draft -> open -> assigned -> in_progress -> quality_check -> invoiced -> paid -> completed`; terminal alternatif `cancelled` dengan alasan.
- Purchase Order: `draft -> submitted -> approved -> partially_received -> received -> closed`; alternatif `rejected/cancelled`.
- Invoice: `draft -> posted -> partially_paid -> paid`; pembatalan posted memakai reversal.

## 7. Data Integrity

- UUID business keys dan unique human document number.
- Canonical unique index untuk product code/barcode.
- Money `numeric`, quantity memiliki precision terdefinisi.
- Foreign key memiliki delete behavior eksplisit.
- Mutable master data mencatat created/updated actor dan time.
- Financial dan inventory event mempertahankan histori.

## 8. Reporting

Mulai dari indexed query dan SQL view. Materialized view hanya setelah pengukuran. Metrik mendefinisikan basis revenue/expense, COGS, stock valuation, average inventory, timezone, dan date boundary. Dashboard card harus dapat ditelusuri ke detail.

## 9. Deployment

Docker Compose baseline:

- `web`: Next.js standalone, non-root.
- `postgres`: private network, volume, health check.
- `migrate`: one-shot memakai owner credential.

Production memakai TLS proxy, secret injection, encrypted backup, centralized log, staging terpisah, dan PostgreSQL tidak dibuka publik.

## 10. Scalability Path

- PgBouncer saat connection pressure terbukti.
- Read replica untuk reporting setelah pengukuran.
- Queue/worker untuk reminder, import, export, dan report berat.
- API versioned agar client eksternal dapat ditambahkan.

## 11. Keputusan Utama

| Area | Keputusan |
| --- | --- |
| Backend | Next.js Route Handlers milik sendiri |
| Database | PostgreSQL |
| Architecture | Modular monolith |
| Authentication | Opaque session tersimpan di DB |
| Authorization | Permission check + forced RLS |
| Data access | Repository SQL parameterized via `pg` |
| Reporting | SQL view/query lebih dulu |
| Deployment | Docker Compose baseline |

## 12. Pola Terlarang

- Credential DB di browser.
- SQL di React component.
- Authorization hanya lewat hidden UI.
- Runtime DB superuser/BYPASSRLS.
- Silent overwrite stok/keuangan.
- List/import/report tidak berbatas.
- Raw internal error ke user.
- Perubahan schema production di luar migration.
