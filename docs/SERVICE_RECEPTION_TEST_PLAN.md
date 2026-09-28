# Service Reception Test Plan

## Actual API Contract

Prefix: `/api/v1/operations/service-reception`

| Method | Endpoint | Permission | Current contract |
| --- | --- | --- | --- |
| `GET` | `/search?query=&limit=` | `service.read` | Active customers with nested `vehicles`; query 2-120 characters, limit 1-50. |
| `GET` | `/customers/:id/context` | `service.read` | Customer and owned vehicles with numeric odometer. |
| `POST` | `/customers` | `service.create` | Name and phone or email required; duplicate exact phone is `409 CUSTOMER_PHONE_EXISTS`. |
| `POST` | `/vehicles` | `service.create` | Active customer required; duplicate canonical plate is `409 VEHICLE_PLATE_EXISTS`. |
| `GET` | `/recommendations` | `service.read` | Vehicle ID, service type, and odometer required. |
| `POST` | `/orders` | `service.create` | Atomic existing or nested new customer/vehicle reception order. |
| `GET` | `/orders/:id` | `service.read` | Reception order detail. |

Order requires exactly one of `customerId`/`customer` and `vehicleId`/`vehicle`, plus `serviceType`, `complaint`, `odometer`, `checklist`, and `idempotencyKey`.

## Security Matrix

| Scenario | Expected result |
| --- | --- |
| Anonymous search/context/order | `401 UNAUTHENTICATED` |
| Cashier search/create/order | allowed by `service.read` / `service.create` |
| Mechanic create order | `403 FORBIDDEN` |
| Warehouse search/create order | `403 FORBIDDEN` |
| Cross-origin customer create | `403 ORIGIN_DENIED` |
| Same key, same order request | original order returned |
| Same key, changed order request | `409 IDEMPOTENCY_CONFLICT` |
| Customer A with vehicle B | `404 VEHICLE_NOT_FOUND` tanpa membocorkan kepemilikan |
| Lower odometer without reason | `422 ODOMETER_CORRECTION_REASON_REQUIRED` |
| Lower odometer with reason | order, immutable log, and audit created |
| Nested customer + duplicate vehicle plate | `409 VEHICLE_PLATE_EXISTS`; customer/order rollback |

## Execution

```powershell
$env:SERVICE_RECEPTION_E2E_ENABLED = "true"
npm test -- src/app/api/v1/operations/service-reception/service-reception.e2e.test.ts

$env:SERVICE_RECEPTION_E2E_ENABLED = "true"
npm run e2e:api

$env:SERVICE_RECEPTION_SECURITY_ENABLED = "true"
npm run security:api
```

## Integrity Decisions

1. Aggregate `POST /orders` provides atomic and idempotent customer, vehicle, and Service Order creation. Standalone helpers rely on phone and canonical-plate uniqueness.
2. Duplicate pre-check races map PostgreSQL `23505` to stable domain conflicts.
3. Vehicle ownership mismatch returns the same `404 VEHICLE_NOT_FOUND` response as an unknown vehicle.
4. Order idempotency is scoped to receiving actor and request hashes use recursively sorted object keys.
5. Cross-origin mutations are denied. SameSite session cookies remain the browser CSRF boundary when non-browser clients omit `Origin`.
6. Reception and odometer-ledger RLS reads are limited to owner, admin, cashier, and mechanic.

Atomic nested creation, transaction rollback, odometer correction log, audit events, server-generated order numbers, and vehicle row locking are implemented.
