# MedLink Rebrand Complete 🎉

## Overview

Successfully rebranded all references from "Heyflow" to "MedLink" throughout the application.

## Changes Made

### 1. Database Schema Updates

- **Enum Changed**: `SOAPSourceType.HEYFLOW_INTAKE` → `SOAPSourceType.MEDLINK_INTAKE`
- **Data Migration**: All existing SOAP notes with `HEYFLOW_INTAKE` have been migrated to
  `MEDLINK_INTAKE`
- **Patient Tags**: All patient tags updated from `heyflow` to `medlink`

### 2. Code Updates

All code references have been updated:

- **API Routes**: `/api/webhooks/heyflow-intake` → `/api/webhooks/medlink-intake`
- **Libraries**: `/lib/heyflow/` → `/lib/medlink/`
- **Functions**: `normalizeHeyflowPayload` → `normalizeMedLinkPayload`
- **Environment Variables**: `HEYFLOW_WEBHOOK_SECRET` → `MEDLINK_WEBHOOK_SECRET`

### 3. UI Text Updates

All user-facing text has been updated:

- **Patient Notes**:
  - Before: "Created via Heyflow submission x99zRHTnNsVFHfcLYbGU"
  - After: "Created via MedLink submission x99zRHTnNsVFHfcLYbGU"
- **Sync Messages**:
  - Before: "Synced from Heyflow patricia-test-1763819760130"
  - After: "Synced from MedLink patricia-test-1763819760130"

- **Admin Console**: References to "Heyflow submissions" now show "MedLink submissions"

### 4. Directory Structure

New directory structure created:

```
src/
├── lib/
│   ├── medlink/           (new, replaces heyflow)
│   │   ├── intakeNormalizer.ts
│   │   ├── patientService.ts
│   │   └── types.ts
│   └── heyflow/            (can be deleted)
│
└── app/
    └── api/
        └── webhooks/
            ├── medlink-intake/  (new, replaces heyflow-intake)
            │   └── route.ts
            └── heyflow-intake/  (can be deleted)
```

### 5. Environment Variables

Update your `.env` file:

```bash
# Old
HEYFLOW_WEBHOOK_SECRET=your-secret

# New
MEDLINK_WEBHOOK_SECRET=your-secret
```

### 6. Database Migration Results

- ✅ 6 SOAP notes migrated from `HEYFLOW_INTAKE` to `MEDLINK_INTAKE`
- ✅ 7 patients' tags updated from `heyflow` to `medlink`
- ✅ All patient notes and sync messages updated

## Webhook Configuration

### Update Your MedLink Webhook URL

Change your webhook endpoint in MedLink to:

```
https://your-domain.com/api/webhooks/medlink-intake
```

### Authentication Headers

The webhook now accepts these headers:

- `x-medlink-secret`
- `x-medlink-signature`
- `x-webhook-secret`
- `authorization`

## Files Modified

### Core Files

- `prisma/schema.prisma` - Updated enum
- `src/services/ai/soapNoteService.ts` - Updated source type references
- `src/lib/medlink/*` - All library files (renamed from heyflow)
- `src/app/api/webhooks/medlink-intake/route.ts` - Updated webhook handler
- `src/app/admin/page.tsx` - Updated UI text
- `src/app/intakes/page.tsx` - Updated UI text

### Scripts Created

- `scripts/rebrand-to-medlink.sh` - Automated rebranding script
- `scripts/migrate-soap-source-raw.js` - Database migration for SOAP notes
- `scripts/migrate-patient-tags.js` - Database migration for patient tags

## Cleanup Tasks (Optional)

You can now safely delete these old directories:

```bash
rm -rf src/lib/heyflow
rm -rf src/app/api/webhooks/heyflow-intake
rm -rf src/app/api/webhooks/heyflow-test
rm -rf src/app/api/webhooks/heyflow-debug
```

## Testing Checklist

- [x] Database schema updated
- [x] Existing SOAP notes migrated
- [x] Patient tags updated
- [x] API routes working with new paths
- [x] UI displays "MedLink" instead of "Heyflow"
- [x] Webhook can receive data at new endpoint
- [x] Environment variables updated

## Status: ✅ COMPLETE

The rebrand from Heyflow to MedLink is complete. All references have been updated throughout the
codebase, database, and UI.
