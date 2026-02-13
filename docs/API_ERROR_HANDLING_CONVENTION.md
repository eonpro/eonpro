# API Error Handling Convention

**Goal:** All API routes return a consistent error shape and use the centralized handler so clients and monitoring get predictable responses and proper status codes.

---

## Standard error response shape

All error responses should follow this structure (from `handleApiError`):

```json
{
  "error": "Human-readable message",
  "code": "ERROR_CODE",
  "statusCode": 400,
  "timestamp": "2026-02-08T12:00:00.000Z",
  "requestId": "optional-uuid",
  "errors": []
}
```

- **error:** Short message for UI/logs (no PHI).
- **code:** Stable code for client handling (e.g. `VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN`).
- **statusCode:** HTTP status (400, 401, 403, 404, 409, 500, 503).
- **errors:** Optional; used for validation (e.g. Zod `flatten()`).

---

## Required pattern for route handlers

1. **Use auth wrappers:** `withAuth`, `withClinicalAuth`, `withAdminAuth`, or `withAuthParams` so the handler receives a guaranteed user.
2. **Validate input:** Prefer Zod; throw `ValidationError` or `BadRequestError` for invalid input.
3. **Throw domain errors:** Use `NotFoundError`, `ForbiddenError`, `ConflictError`, etc. from `@/domains/shared/errors`.
4. **Catch and return:** In the handler’s `catch`, return `handleApiError(error, { route: 'METHOD /api/path' })`.

### Example

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { handleApiError, NotFoundError, ValidationError } from '@/domains/shared/errors';
import { z } from 'zod';

const schema = z.object({ name: z.string().min(1) });

async function handler(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', parsed.error.flatten());
    }
    // ... business logic ...
    return NextResponse.json({ data });
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/example' });
  }
}

export const POST = withAuth(handler);
```

---

## Domain errors (throw these, don’t construct JSON by hand)

| Error              | Code               | HTTP |
|--------------------|--------------------|------|
| `BadRequestError`  | BAD_REQUEST        | 400  |
| `ValidationError`  | VALIDATION_ERROR   | 400  |
| `NotFoundError`    | NOT_FOUND          | 404  |
| `ForbiddenError`   | FORBIDDEN          | 403  |
| `ConflictError`    | CONFLICT           | 409  |
| `DatabaseError`    | DATABASE_ERROR     | 500  |
| `ServiceUnavailableError` | SERVICE_UNAVAILABLE | 503 |
| `InternalError`    | INTERNAL_ERROR     | 500  |

Import from `@/domains/shared/errors`. Unrecognized errors are normalized to 500 with a generic message.

---

## What to avoid

- **Don’t** return ad-hoc `NextResponse.json({ error: '...' }, { status: 500 })` in catch blocks; use `handleApiError` so code, statusCode, and timestamp are consistent.
- **Don’t** log PHI in error context; use IDs only (e.g. `patientId`, `clinicId`, `route`).
- **Don’t** swallow errors (e.g. empty `catch`); always return a response or rethrow.

---

## Reference implementation

- **Patients:** `src/app/api/patients/route.ts`, `src/app/api/patients/[id]/route.ts`
- **Orders:** `src/app/api/orders/route.ts`
- **Tickets:** `src/app/api/tickets/route.ts`, `src/app/api/tickets/[id]/route.ts`
- **Handler:** `src/domains/shared/errors/handler.ts`

---

## Migrating an existing route

1. Add: `import { handleApiError } from '@/domains/shared/errors';`
2. In the route’s `catch`, replace `NextResponse.json({ error: '...' }, { status: 500 })` with:
   `return handleApiError(error, { route: 'METHOD /api/your/path' });`
3. Where appropriate, throw `NotFoundError`, `ValidationError`, etc. instead of returning JSON manually.

See also: `.cursor/rules/04-api-routes.mdc`, `docs/ENTERPRISE_READINESS_ROADMAP.md`.
