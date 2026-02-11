# Clinic Configurations

This directory contains configuration documentation for each clinic using EONPRO.

## Active Clinics

| Clinic       | ID  | Status    | Domain                | Documentation                |
| ------------ | --- | --------- | --------------------- | ---------------------------- |
| **EONMEDS**  | 3   | ✅ Active | eonmeds.eonpro.io     | [EONMEDS.md](./EONMEDS.md)   |
| **WELLMEDR** | 7   | ✅ Active | wellmedr.eonpro.io    | [WELLMEDR.md](./WELLMEDR.md) |
| **OVERTIME** | 8   | ✅ Active | ot.eonpro.io          | [OVERTIME.md](./OVERTIME.md) |

## Adding a New Clinic

When onboarding a new clinic:

1. **Create clinic in EONPRO database**
   - Add to `Clinic` table with unique subdomain
   - Note the assigned `clinicId`

2. **Set up intake platform** (if custom)
   - Deploy intake form
   - Configure environment variables

3. **Configure webhook** (choose one approach):

   ### Option A: Dedicated Webhook Endpoint

   Create a new webhook at `/api/webhooks/{clinic-name}` with:
   - Clinic-specific secret
   - Hardcoded clinic ID

   ### Option B: Shared Webhook with Clinic Parameter

   Use existing `/api/webhooks/weightlossintake` with:
   - Clinic identifier in payload
   - Lookup clinic by subdomain/name

4. **Create documentation**
   - Copy `_TEMPLATE.md` to `{CLINIC_NAME}.md`
   - Fill in all configuration details
   - Verify and test

5. **Test thoroughly**
   - Submit test patient
   - Verify PDF generation
   - Verify SOAP note generation
   - Verify clinic isolation

## Configuration Structure

Each clinic configuration includes:

- **Webhook Settings**: URLs, secrets, endpoints
- **Data Flow**: How data moves from intake to EONPRO
- **Features**: What's enabled for this clinic
- **Verification Commands**: How to test the connection
- **History**: Changes and when they were made

## Security Notes

- Each clinic SHOULD have its own webhook secret
- Secrets should be rotated periodically
- Never commit secrets to version control
- Store secrets only in Vercel environment variables

## Clinic Isolation

All webhooks MUST ensure clinic isolation:

```typescript
// In webhook handler:
const clinic = await prisma.clinic.findFirst({
  where: { subdomain: 'clinic-subdomain' },
});

// All patient/document operations use clinic.id
await prisma.patient.create({
  data: {
    ...patientData,
    clinicId: clinic.id, // REQUIRED!
  },
});
```

## Troubleshooting

If submissions aren't appearing for a clinic:

1. Check environment variables on intake platform
2. Verify webhook secret matches
3. Check clinic ID is being set correctly
4. Review Vercel logs for errors
5. Use health check endpoint for diagnostics
