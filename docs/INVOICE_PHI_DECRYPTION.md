# Invoice PHI Decryption

## Overview

Patient data (firstName, lastName, email, phone) is stored **encrypted at rest** for HIPAA compliance. All API routes that return invoice data with patient information must **decrypt PHI before sending** to the frontend.

## Routes Updated (Comprehensive)

| Route | Purpose | PHI Decrypted |
|-------|---------|---------------|
| `GET /api/invoices` | Admin finance invoices list | patient.firstName, lastName, email |
| `GET /api/finance/incoming-payments` | Payment reconciliation stream | patient.firstName, lastName, email |
| `GET /api/pay/[invoiceId]` | Public payment page | patient.firstName, lastName |
| `GET /api/finance/activity` | Recent financial activity | payments/invoices/subscriptions patient names |
| `GET /api/admin/payment-reconciliation` | Admin reconciliation records | patient.firstName, lastName, email |
| `GET /api/v2/invoices` | Provider invoice list | patient.firstName, lastName, email, phone |
| `GET /api/v2/invoices/[id]` | Single invoice detail | patient.firstName, lastName, email, phone |
| `GET /api/v2/invoices/summary` | Invoice summary & overdue | recent/overdue patient names, email, phone |
| `GET /api/stripe/invoices/[id]` | Stripe invoice detail page | patient.firstName, lastName, email, phone |
| `POST /api/invoices/[id]/sync` | Invoice Stripe sync result | patient.firstName, lastName, email |

## Implementation Pattern

```typescript
import { decryptPatientPHI } from '@/lib/security/phi-encryption';

// Before returning invoice/patient data:
if (invoice.patient) {
  try {
    invoice.patient = decryptPatientPHI(invoice.patient as Record<string, unknown>, [
      'firstName',
      'lastName',
      'email',
      'phone',
    ]) as typeof invoice.patient;
  } catch (decryptErr) {
    logger.warn('[Route] Failed to decrypt patient PHI', {
      patientId: invoice.patient?.id,
      error: decryptErr instanceof Error ? decryptErr.message : String(decryptErr),
    });
  }
}
```

## PHI Fields

- **firstName** – Patient first name
- **lastName** – Patient last name  
- **email** – Patient email
- **phone** – Patient phone (when included)

## Production Checklist

- **ENCRYPTION_KEY** must be set in Vercel (or production env). Generate with: `openssl rand -hex 32`
- Must match the key used when the data was encrypted
- If missing or wrong: decryption fails and encrypted blobs are shown (or request may 500)

## Notes

- `decryptPatientPHI` decrypts values in format `base64:base64:base64` (iv:authTag:ciphertext)
- Plain text values (legacy/unmigrated data) pass through unchanged
- On decryption failure, log a warning; UI may show placeholder or fallback
- **Never log decrypted PHI** – only log patientId and error message

## Adding New Invoice Routes

When adding a new API route that returns invoice or payment data with patient info:

1. Import `decryptPatientPHI` from `@/lib/security/phi-encryption`
2. Before returning the response, decrypt patient PHI fields
3. Wrap in try/catch with logging on failure
4. Add the route to this document
