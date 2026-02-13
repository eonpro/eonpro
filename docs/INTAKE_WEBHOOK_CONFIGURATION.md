# Intake Webhook Configuration - General Guide

> ⚠️ **NOTE**: For clinic-specific configurations, see the `/docs/clinics/` directory.

## Clinic Configurations

| Clinic      | Documentation                                   |
| ----------- | ----------------------------------------------- |
| **EONMEDS** | [docs/clinics/EONMEDS.md](./clinics/EONMEDS.md) |

---

## Overview

This document provides general information about intake webhook configuration. Each clinic has its
own configuration file in `/docs/clinics/`.

---

## Working Configuration

### EONPRO (app.eonpro.io) - Vercel Environment Variables

| Variable                          | Value                                          | Environment |
| --------------------------------- | ---------------------------------------------- | ----------- |
| `WEIGHTLOSSINTAKE_WEBHOOK_SECRET` | `C7mozz29cbRMC2Px3pX+r7uchnSfYRorb4KaOq3dfYM=` | All         |

### Intake Platform (intake.eonmeds.com) - Vercel Environment Variables

| Variable                | Value                                                 | Environment |
| ----------------------- | ----------------------------------------------------- | ----------- |
| `EONPRO_WEBHOOK_URL`    | `https://app.eonpro.io/api/webhooks/weightlossintake` | All         |
| `EONPRO_WEBHOOK_SECRET` | `C7mozz29cbRMC2Px3pX+r7uchnSfYRorb4KaOq3dfYM=`        | All         |

---

## Data Flow

```
┌─────────────────────────┐
│  intake.eonmeds.com     │
│  (Patient fills form)   │
└───────────┬─────────────┘
            │
            │ POST /api/airtable
            ▼
┌─────────────────────────┐
│  Intake Platform        │
│  /api/airtable route    │
│  - Saves to Airtable    │
│  - Calls sendToEonpro() │
└───────────┬─────────────┘
            │
            │ POST with x-webhook-secret header
            ▼
┌─────────────────────────────────────────────────┐
│  app.eonpro.io                                  │
│  /api/webhooks/weightlossintake                 │
│                                                 │
│  Actions:                                       │
│  1. Authenticate (verify secret)               │
│  2. Create/Update Patient (EONMEDS clinic)     │
│  3. Generate PDF Intake Form                   │
│  4. Generate SOAP Note (complete submissions)  │
│  5. Track referral codes                       │
│  6. Create audit log                           │
└─────────────────────────────────────────────────┘
```

---

## Endpoints

### EONPRO Endpoints

| Endpoint                         | Method   | Purpose                                     |
| -------------------------------- | -------- | ------------------------------------------- |
| `/api/webhooks/weightlossintake` | POST     | Main webhook for intake submissions         |
| `/api/webhooks/health`           | GET      | Health check and diagnostics                |
| `/api/webhooks/test`             | POST     | Test webhook without creating real patients |
| `/api/webhooks/ping`             | GET/POST | Simple connectivity test                    |
| `/api/v1/health`                 | GET      | API health check for EMR client             |
| `/api/v1/intakes`                | POST     | Alternative intake submission endpoint      |

### Authentication

All webhook requests must include the secret in one of these headers:

- `x-webhook-secret: <secret>`
- `x-api-key: <secret>`
- `Authorization: Bearer <secret>`

---

## Verification Commands

### Test EONPRO is reachable:

```bash
curl -s "https://app.eonpro.io/api/webhooks/ping" | jq '.'
```

### Check webhook health:

```bash
curl -s "https://app.eonpro.io/api/webhooks/health" \
  -H "X-Webhook-Secret: C7mozz29cbRMC2Px3pX+r7uchnSfYRorb4KaOq3dfYM=" | jq '.'
```

### Test a submission (creates test patient):

```bash
curl -s -X POST "https://app.eonpro.io/api/webhooks/test" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: C7mozz29cbRMC2Px3pX+r7uchnSfYRorb4KaOq3dfYM=" \
  -d '{"testMode": true}' | jq '.'
```

### Check intake platform EMR configuration:

```bash
curl -s "https://intake.eonmeds.com/api/emr/health" | jq '.'
# Should show: "configured": true
```

---

## Troubleshooting

### Issue: Submissions not appearing in EONPRO

1. **Check intake platform logs** (Vercel → weightlossintake → Logs)
   - Look for POST to `/api/airtable`
   - Check if `eonproTriggered: true` in response

2. **Check EONPRO webhook health**
   - Run health check command above
   - Look at `last24hCount` - should increase with each submission

3. **Verify environment variables**
   - Intake platform MUST have both `EONPRO_WEBHOOK_URL` AND `EONPRO_WEBHOOK_SECRET`
   - Values must match exactly (no extra spaces)

### Issue: Authentication failures

1. Verify secrets match exactly on both platforms
2. Check for leading/trailing spaces in env vars
3. Ensure env vars are set for "Production" environment

---

## Files Involved (DO NOT DELETE)

### EONPRO Codebase

- `src/app/api/webhooks/weightlossintake/route.ts` - Main webhook handler
- `src/app/api/webhooks/health/route.ts` - Health check endpoint
- `src/app/api/webhooks/test/route.ts` - Test endpoint
- `src/app/api/webhooks/ping/route.ts` - Ping endpoint
- `src/app/api/v1/health/route.ts` - V1 health endpoint
- `src/app/api/v1/intakes/route.ts` - V1 intakes endpoint
- `src/lib/medlink/intakeNormalizer.ts` - Payload normalization
- `src/services/intakePdfService.ts` - PDF generation
- `src/services/ai/soapNoteService.ts` - SOAP note generation

### Intake Platform Codebase

- `src/app/api/airtable/route.ts` - Contains `sendToEonpro()` function
- `src/lib/emr-client.ts` - EMR client for alternative submission path

---

## History

| Date       | Change                                                    | Result                |
| ---------- | --------------------------------------------------------- | --------------------- |
| 2026-01-18 | Fixed `EONPRO_WEBHOOK_URL` env var (was using wrong name) | ✅ Connection working |
| 2026-01-18 | Added v1 API endpoints for EMR client compatibility       | ✅ Health checks pass |
| 2026-01-18 | First successful submission: Winnie French                | ✅ Verified working   |

---

## Contact

If something breaks, check:

1. Vercel deployment status for both projects
2. Environment variables haven't changed
3. No code changes to the files listed above

**Last verified working: 2026-01-18 18:13 UTC** **Test patient: Winnie French (ID: 52)**
