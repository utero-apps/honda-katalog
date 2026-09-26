# Software Design Document (SDD)

## 1. Tujuan

Menetapkan desain implementasi untuk mengganti Supabase dengan backend milik sendiri dan PostgreSQL, sekaligus membangun seluruh Phase 1-4 secara aman dan teruji.

## 2. Stack

- Next.js App Router 16.3.6, React 19, TypeScript strict.
- Next.js Route Handlers sebagai API `/api/v1`.
- PostgreSQL dengan driver `pg` dan SQL parameterized.
- Zod untuk runtime validation.
- Tailwind CSS 4.
- Vitest, integration test PostgreSQL, dan E2E browser.
- Docker multi-stage, Docker Compose, dan CI.

Supabase package, API, authentication, key, dan SQL grant lama dihapus.

## 3. Struktur Target

- `src/app`: auth pages, dashboard pages, Route Handlers.
- `src/components`: UI primitive, layout, dan domain component.
- `src/features`: auth, catalog, customer, service, inventory, purchasing, finance, CRM, reporting.
- `src/server`: auth, DB, HTTP, security, observability.
- `db`: migrations, seeds, dan scripts.
- `tests`: unit, integration, E2E, security.

UI tidak mengimpor database. Route Handler tidak menyimpan business SQL. Domain service mengatur workflow/transaksi. Repository hanya mengakses PostgreSQL. Environment hanya dibaca modul server.

## 4. Request Flow

1. Route menerima request dan membuat request ID.
2. Security layer memeriksa content type, origin, rate limit, dan session.
3. Zod memvalidasi path, query, dan body.
4. Authorization memeriksa permission.
5. Transaksi DB mengatur `app.user_id`, `app.user_role`, `app.request_id` memakai `set_config(..., true)`.
6. Repository menjalankan SQL parameterized.
7. PostgreSQL RLS memeriksa akses row.
8. Mutation sensitif menulis audit event.
9. API mengembalikan response aman tanpa detail internal.

## 5. API Contract

Response sukses memiliki `data`, `meta`, dan `error: null`. Response gagal memiliki `data: null` serta error dengan `code`, user-safe `message`, dan optional `fields`.

Group endpoint: `auth`, `users`, `catalog`, `customers`, `vehicles`, `service-orders`, `mechanics`, `inventory`, `vendors`, `purchase-orders`, `receivings`, `invoices`, `payments`, `finance`, `crm`, `reports`, `dashboard`, `health`, dan `ready`.

Semua list memakai bounded pagination dan deterministic ordering. Mutation mendukung idempotency key bila retry dapat menimbulkan duplikasi.

## 6. Authentication

- Password memakai scrypt Node.js, random salt, parameter tersimpan, dan timing-safe comparison.
- Session token random 256-bit; browser menyimpan token mentah hanya di cookie `honda_session`.
- Database menyimpan SHA-256 token hash, user, expiry, last seen, dan metadata terbatas.
- Cookie HTTP-only, Secure production, SameSite Lax, path `/`, expiry terbatas.
- Login dan privilege change merotasi session; logout/password change mencabut session.

## 7. Authorization

Permission eksplisit: `catalog.read/write`, `service.create/assign/complete`, `inventory.receive/adjust`, `purchasing.approve`, `finance.post/pay`, `users.manage`, `reports.read`, `audit.read`.

Backend memeriksa permission sebelum query. RLS memeriksa role, assignment, ownership, atau domain access. Hidden menu hanya UX, bukan security boundary.

## 8. Data Model

- Identity: `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `sessions`, `audit_events`.
- Catalog: `product_categories`, `vehicle_models`, `products`, `product_barcodes`, `product_vehicle_compatibility`, `product_prices`.
- Service: `customers`, `customer_vehicles`, `mechanics`, `service_orders`, `service_order_jobs`, `service_order_parts`, `service_order_status_history`, `quality_checks`.
- Inventory: `warehouses`, `inventory_balances`, `stock_movements`, `stock_opnames`, `stock_opname_items`.
- Purchasing: `vendors`, `vendor_products`, `purchase_orders/items`, `goods_receipts/items`.
- Finance: `customer_invoices/items`, `vendor_invoices`, `payments`, `expenses`, `mechanic_fees`.
- CRM: `customer_follow_ups`, `service_reminders`.

UUID digunakan untuk business entity. Document number memakai sequence dan unique constraint. Money memakai `numeric`. Posted inventory/finance record dikoreksi melalui reversal.

## 9. PostgreSQL dan RLS

- Migration owner terpisah dari runtime role.
- Runtime role bukan superuser, tidak memiliki `BYPASSRLS`, dan tidak dapat mengubah policy.
- Tabel bisnis memakai `ENABLE ROW LEVEL SECURITY` dan `FORCE ROW LEVEL SECURITY`.
- Request tanpa transaction-local identity tidak memperoleh row bisnis.
- RLS matrix diuji untuk SELECT, INSERT, UPDATE, DELETE setiap role.

## 10. Transaction Rules

- Service completion, konsumsi stok, invoice, dan status transition atomik.
- Receiving, stock movement, dan payable reference atomik.
- Payment dan settlement atomik.
- Stock balance selalu didukung immutable movement.
- State machine menolak transisi dokumen ilegal.

## 11. Validation dan Logging

- UUID, pagination, search, date range, enum, quantity, dan money divalidasi.
- Money diproses sebagai decimal-compatible string, bukan floating point.
- Client menerima stable error code.
- Log internal memiliki request ID, actor, route, durasi, hasil, dan error teredaksi.
- Password, token, cookie, DB URL, dan PII tidak dicatat.

## 12. Testing

- Unit: validation, password/session, state machine, money calculation.
- Integration: migration, repository, transaction, RLS dengan PostgreSQL nyata.
- API: auth, authorization, validation, error contract, idempotency.
- E2E: login, catalog, service, inventory, receiving, invoice/payment, reporting.
- Security: anonymous access, IDOR, escalation, CSRF, rate limit, injection, replay.
- Accessibility: automated dan keyboard workflow.

## 13. Deployment dan Migrasi

- `postgres` private, persistent volume, health check.
- `migrate` one-shot memakai owner credential.
- `web` non-root hanya menerima runtime credential.
- Readiness memeriksa DB dan migration version.
- Migrasi Supabase: freeze write, export, staging import, normalize, validate count/duplicate/price/status, promote transactionally, compare search, lalu rotate/disable credential lama.
