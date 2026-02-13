# Internal Intake Forms Evaluation

## Overview

This document evaluates the benefits and effort required to integrate the
[weightlossintake codebase](https://github.com/eonpro/weightlossintake) into the main EonPro
platform to provide internal intake form capabilities.

## Current Architecture

Currently, patient intake data flows through external platforms:

```
External Platform (Heyflow/MedLink)
    ↓
Webhook Endpoint (/api/webhooks/*)
    ↓
Normalizer (intakeNormalizer.ts)
    ↓
Patient Record + PDF Document
```

### Pain Points with External Forms

1. **Data Normalization Complexity**: Each form platform sends data in different formats, requiring
   complex normalizers with hardcoded field IDs that break when forms are edited.

2. **No Real-time Feedback**: Cannot guide users through the form or validate responses in
   real-time.

3. **External Dependencies**: Reliance on Heyflow costs, rate limits, and availability.

4. **Limited Customization**: Clinic-specific customizations require separate Heyflow forms.

5. **PDF Storage Issues**: PDFs written to `/tmp` on Vercel are ephemeral (now fixed).

---

## WeightLossIntake Codebase Analysis

### Repository Structure

```
weightlossintake/
├── src/
│   ├── app/            # Next.js pages (intake form UI)
│   ├── components/     # Reusable form components
│   ├── lib/           # Utilities, validation
│   └── locales/       # i18n (en, es)
├── docs/              # Documentation
├── e2e/               # Playwright tests
└── tests/             # Unit tests
```

### Key Features Already Built

1. **Multi-step Form Wizard**: Progressive disclosure of questions
2. **Multilingual Support**: English and Spanish translations
3. **BMI Calculator**: Auto-calculates from height/weight
4. **Address Autocomplete**: Google Places integration
5. **Validation**: Client-side and server-side validation
6. **Responsive Design**: Mobile-first approach

### Technology Stack

- Next.js 14+ (compatible with main platform)
- TypeScript (compatible)
- Tailwind CSS (compatible)
- React Hook Form (form state management)
- Zod (validation)

---

## Integration Approach

### Option A: Direct Integration (Recommended)

Merge key components from weightlossintake into the main platform:

```
lifefile-integration/
├── src/
│   ├── app/
│   │   └── intake/           # NEW: Internal intake pages
│   │       ├── [clinicSlug]/ # Clinic-specific intake
│   │       ├── layout.tsx    # Intake form layout
│   │       └── components/   # Form step components
│   └── lib/
│       └── intake/           # NEW: Intake form logic
│           ├── schema.ts     # Zod validation schemas
│           ├── steps.ts      # Form step definitions
│           └── submit.ts     # Direct database submission
```

**Effort Estimate**: 2-3 days for basic integration

**Pros**:

- Single codebase to maintain
- Shared authentication/authorization
- Direct database access (no webhook)
- Consistent styling

**Cons**:

- Initial migration effort
- Need to maintain form templates in database

### Option B: Separate Deployment (Keep External)

Keep weightlossintake as a separate deployment, connected via improved webhooks.

**Effort Estimate**: 1 day for webhook improvements

**Pros**:

- Already working
- Isolated testing

**Cons**:

- Two codebases
- External dependency
- More complex data flow

---

## Recommended Implementation Plan

### Phase 1: Shared Form Components (1 day)

1. Create `src/components/intake/` directory
2. Port these components from weightlossintake:
   - `FormStep.tsx` - Step container
   - `ProgressBar.tsx` - Multi-step progress
   - `BMICalculator.tsx` - Auto BMI calculation
   - `AddressInput.tsx` - Already exists, enhance it

### Phase 2: Form Schema & Validation (1 day)

1. Create `src/lib/intake/schema.ts` with Zod schemas
2. Define standard intake questions
3. Add clinic-specific question extensions

### Phase 3: Internal Intake Routes (1 day)

1. Create `/intake/[clinicSlug]` route
2. Multi-step form wizard
3. Direct submission to Patient + PatientDocument

### Phase 4: Admin Form Builder (Future)

1. Allow admins to customize intake questions per clinic
2. Form versioning for compliance
3. Analytics on completion rates

---

## Benefits of Internal Forms

| Benefit              | Impact                    |
| -------------------- | ------------------------- |
| No external costs    | Save Heyflow subscription |
| No rate limits       | Handle any volume         |
| Direct data storage  | No normalization bugs     |
| Real-time validation | Better UX                 |
| Multilingual         | Built-in i18n support     |
| Customization        | Per-clinic forms          |
| Single domain        | No redirect confusion     |

---

## Migration Path

For existing patients with external intake data:

1. **Keep webhook endpoints** - Continue accepting external submissions
2. **New patients use internal forms** - Default to internal
3. **Admin option** - Choose internal vs external per clinic
4. **Gradual transition** - Monitor and improve internal forms

---

## Decision

**Recommended**: Proceed with **Option A (Direct Integration)** as it provides long-term benefits
with manageable short-term effort.

The key form components can be integrated incrementally without disrupting current webhook-based
intake.

### Immediate Actions

1. [x] Fix PDF storage (completed)
2. [x] Improve normalizer (completed)
3. [x] Create unified webhook (completed)
4. [ ] Port form components from weightlossintake
5. [ ] Create `/intake/[clinicSlug]` route
6. [ ] Add form submission API

---

## Technical Notes

### Form State Management

Use React Hook Form with Zod validation:

```typescript
const intakeSchema = z.object({
  // Personal Info
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  email: z.string().email(),
  phone: z.string().min(10),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.enum(['male', 'female', 'other']),

  // Address
  address1: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  zip: z.string().min(5),

  // Medical (clinic-customizable)
  currentWeight: z.number().optional(),
  goalWeight: z.number().optional(),
  conditions: z.array(z.string()).optional(),
  medications: z.array(z.string()).optional(),
});
```

### Direct Submission Flow

```typescript
// POST /api/intake/submit
export async function POST(req: Request) {
  const data = await req.json();

  // Validate
  const parsed = intakeSchema.safeParse(data);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
  }

  // Create patient
  const patient = await prisma.patient.create({
    data: {
      ...parsed.data,
      clinicId,
      source: 'internal-intake',
    },
  });

  // Generate PDF and create document
  const pdf = await generateIntakePdf(parsed.data, patient);
  await prisma.patientDocument.create({
    data: {
      patientId: patient.id,
      data: pdf,
      intakeData: parsed.data,
      category: 'MEDICAL_INTAKE_FORM',
    },
  });

  return Response.json({ success: true, patientId: patient.id });
}
```

---

_Document created: 2026-01-19_ _Author: System Architecture Analysis_
