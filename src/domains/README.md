# Domain Architecture

This directory contains domain-driven modules that encapsulate business logic for the LifeFile healthcare platform.

## Architecture Overview

```
src/domains/
├── shared/              # Cross-cutting concerns
│   ├── errors/          # Error classes & API error handler
│   └── types.ts         # Shared types (UserContext, Pagination)
├── patient/             # Patient domain
│   ├── repositories/    # Data access layer (Prisma)
│   ├── services/        # Business logic layer
│   └── types/           # Domain entities & DTOs
├── provider/            # Provider domain
│   ├── repositories/    # Data access layer
│   ├── services/        # Business logic layer
│   ├── types.ts         # Domain types
│   └── validation.ts    # Zod schemas
└── index.ts             # Central export point
```

## Design Principles

### Repository Pattern
- **Single Responsibility**: Repositories handle ONLY data access
- **Audit Logging**: All mutations create audit trail
- **PHI Handling**: Encryption/decryption at repository boundary
- **Clinic Isolation**: Explicit clinicId filtering

### Service Pattern
- **Business Logic**: Validation, authorization, orchestration
- **Error Handling**: Throws domain-specific errors
- **UserContext**: Authorization based on caller context
- **Stateless**: No internal state, pure functions

### Shared Module
- **Error Classes**: `NotFoundError`, `ValidationError`, `ForbiddenError`, etc.
- **Error Handler**: `handleApiError()` for consistent API responses
- **Types**: `UserContext`, `PaginationOptions`, `PaginatedResult`

## Usage Examples

### Importing from Domains

```typescript
// Import everything from domain
import { patientService, type Patient } from '@/domains/patient';

// Import shared utilities
import { handleApiError, NotFoundError } from '@/domains/shared';

// Import from central index
import { patientService, providerService, Errors } from '@/domains';
```

### Using Services in Routes

```typescript
// src/app/api/patients/[id]/route.ts
import { patientService, type UserContext } from '@/domains/patient';
import { handleApiError } from '@/domains/shared/errors';

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    
    const userContext: UserContext = {
      id: user.id,
      email: user.email,
      role: user.role,
      clinicId: user.clinicId,
    };

    const patient = await patientService.getById(Number(id), userContext);
    return Response.json({ patient });
  } catch (error) {
    return handleApiError(error);
  }
}
```

### Creating New Domains

Follow this template for new domains:

```
src/domains/[domain]/
├── index.ts              # Public exports
├── types.ts              # Domain types
├── validation.ts         # Zod schemas (optional)
├── repositories/
│   ├── index.ts
│   └── [domain].repository.ts
└── services/
    ├── index.ts
    └── [domain].service.ts
```

## Available Domains

### Patient Domain (`@/domains/patient`)

**Service Methods:**
- `getById(id, userContext)` - Get patient with access control
- `listPatients(userContext, options)` - List with filtering
- `createPatient(input, userContext)` - Create with PHI encryption
- `updatePatient(id, input, userContext)` - Update with audit
- `deletePatient(id, userContext)` - Soft delete with cascade

**Key Features:**
- PHI encryption (email, phone, DOB)
- Multi-tenant isolation
- Audit logging
- Duplicate email detection

### Provider Domain (`@/domains/provider`)

**Service Methods:**
- `getById(id, userContext)` - Get provider with access control
- `listProviders(userContext)` - List based on visibility rules
- `createProvider(input, userContext)` - Create with NPI verification
- `updateProvider(id, input, userContext)` - Update with audit
- `deleteProvider(id, userContext)` - Admin-only deletion
- `verifyNpi(npi)` - NPI registry lookup
- `setPassword(id, input, actor)` - Set provider password

**Key Features:**
- NPI format & checksum validation
- NPI registry verification
- Shared provider support (clinicId=null)
- Provider-user linking

### Shared (`@/domains/shared`)

**Error Classes:**
- `AppError` - Base error class
- `NotFoundError` - Resource not found (404)
- `ValidationError` - Invalid input (400)
- `ForbiddenError` - Access denied (403)
- `ConflictError` - Duplicate resource (409)
- `BadRequestError` - Malformed request (400)
- `UnauthorizedError` - Not authenticated (401)

**Error Handler:**
```typescript
import { handleApiError } from '@/domains/shared/errors';

try {
  // ... business logic
} catch (error) {
  return handleApiError(error, { context: { route: 'GET /api/...' } });
}
```

**Types:**
- `UserContext` - Authenticated user context
- `PaginationOptions` - Pagination parameters
- `PaginatedResult<T>` - Paginated response wrapper

## Testing

### Unit Tests
```bash
npm test -- tests/unit/domains/
```

### Characterization Tests
```bash
npm test -- tests/characterization/
```

### Integration Tests
```bash
npm test -- tests/integration/routes/
```

### All Domain Tests
```bash
npm test -- tests/unit/domains/ tests/characterization/ tests/integration/routes/
```

## Migration Status

| Domain | Repository | Service | Routes | Tests |
|--------|------------|---------|--------|-------|
| Patient | ✅ | ✅ | ✅ 5/5 | 138 |
| Provider | ✅ | ✅ | ✅ 6/6 | 88 |
| Order | ⬜ | ⬜ | ⬜ | — |
| Clinic | ⬜ | ⬜ | ⬜ | — |

## Security Considerations

### PHI Handling
- All PHI fields encrypted at rest
- Decryption only for authorized users
- Graceful degradation if decryption fails

### Multi-Tenant Isolation
- Explicit `clinicId` filtering on all queries
- Super admin bypass with audit logging
- Defense-in-depth (filter at query AND application level)

### Audit Logging
- All mutations logged with actor email
- Field-level diff tracking
- Sensitive fields excluded from logs

## Contributing

1. Follow the repository/service pattern
2. Add characterization tests BEFORE refactoring
3. Export all public types from domain index
4. Use `handleApiError()` in all routes
5. Document breaking changes in commit messages
