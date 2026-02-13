# Enterprise Index Recommendations

For 200+ clinics and 500k+ patients, add these composite indexes to support tenant-scoped list and filter queries. Apply via Prisma migrations.

## Recommended indexes (add if not present)

```prisma
// Patient – list by clinic + status/created
@@index([clinicId, status])
@@index([clinicId, createdAt(sort: Desc)])

// Invoice – list and filters
@@index([clinicId, status, createdAt(sort: Desc)])

// Order – list by status
@@index([clinicId, status])
@@index([clinicId, createdAt(sort: Desc)])

// Payment – list by clinic
@@index([clinicId, createdAt(sort: Desc)])

// Subscription – list by status
@@index([clinicId, status])

// PatientDocument – by patient
@@index([clinicId, patientId])

// LabReport – by patient
@@index([clinicId, patientId])

// SOAPNote – list by patient/time
@@index([clinicId, patientId, createdAt(sort: Desc)])

// Ticket – list views (verify existing)
@@index([clinicId, status, createdAt(sort: Desc)])
@@index([clinicId, status, priority])
```

## Pagination

All list APIs must use `take`/`skip` with a maximum page size (e.g. 100). See `src/lib/pagination.ts` (`normalizePagination`, `MAX_PAGE_SIZE`).

## Connection pooling

- Use RDS Proxy or PgBouncer in production.
- Per-instance `connection_limit=1` or low (2–3) in serverless to avoid pool exhaustion (P2024).
