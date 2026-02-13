# OpenAPI specs (Phase 3 C6)

Foundational request/response schemas for v2 APIs and critical webhooks. No codegen or runtime validation yet.

- **v2-invoices.yaml** – GET/POST `/api/v2/invoices`, GET `/api/v2/invoices/{id}`
- **webhooks-stripe.yaml** – POST `/api/stripe/webhook`

Future: add contract validation in CI (e.g. schema lint, response shape tests).
