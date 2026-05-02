/**
 * GET /api/super-admin/ot-nonrx-overrides/sales-reps
 *
 * Convenience endpoint that returns the same list the Rx editor uses, so the
 * non-Rx tab can fetch from a route that lives next to its other endpoints
 * without adding a second source of truth. Re-exports the canonical handler
 * from `/api/super-admin/ot-overrides/sales-reps` to guarantee parity.
 */
export { GET } from '@/app/api/super-admin/ot-overrides/sales-reps/route';
