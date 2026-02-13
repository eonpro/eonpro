# Stripe Connect Per-Clinic Integration

## Overview

Each clinic on the platform can connect their own Stripe account for direct payment processing. This
enables a true white-label experience where clinics receive payments directly to their bank
accounts.

## Features

- **OAuth Login**: Users simply log into their existing Stripe account - no new account needed
- **Self-Service**: Clinic admins can connect without super admin intervention
- **Direct Payments**: Funds go directly to the clinic's bank account
- **Full Dashboard Access**: Clinics get their own Stripe dashboard for disputes, refunds, and
  reporting
- **Automatic Status Sync**: Webhook integration keeps account status synchronized

## Connection Flow

### OAuth Flow (Recommended)

The primary flow uses Stripe OAuth, which is the simplest experience:

```
1. Click "Connect with Stripe"
2. Log into your existing Stripe account
3. Click "Authorize" to connect
4. Done! Redirected back with account connected
```

### Standard Onboarding (Fallback)

If OAuth is not configured, falls back to creating a new account:

```
1. Click "Create New Account"
2. Complete Stripe's identity verification
3. Add bank account for payouts
4. Done! Account created and connected
```

## Architecture

### Account Types

We use **Stripe Standard** connected accounts, which provide:

- Full Stripe dashboard access for clinic owners
- All Stripe features (disputes, refunds, subscriptions)
- Clinic manages their own payouts and bank settings
- No application fee percentage required (configurable)

### Database Schema

The `Clinic` model has the following Stripe Connect fields:

```prisma
model Clinic {
  // Stripe Connect Integration
  stripeAccountId          String?   @unique  // Connected account ID (acct_xxx)
  stripeAccountStatus      String?            // 'pending', 'active', 'restricted'
  stripeOnboardingComplete Boolean   @default(false)
  stripeChargesEnabled     Boolean   @default(false)
  stripePayoutsEnabled     Boolean   @default(false)
  stripeDetailsSubmitted   Boolean   @default(false)
  stripePlatformAccount    Boolean   @default(false)  // Is platform account?
  stripeConnectedAt        DateTime?
}
```

## User Flows

### 1. Clinic Admin Connects Stripe

```
1. Go to Admin → Settings → Billing & Payments
2. Click "Connect Stripe Account"
3. Redirected to Stripe's hosted onboarding
4. Complete identity verification and bank setup
5. Redirected back to settings with success message
6. Account status synced automatically
```

### 2. Webhook Auto-Sync

When Stripe account status changes:

```
1. Stripe sends `account.updated` webhook
2. Our webhook handler receives the event
3. Account status synced to database
4. Clinic sees updated status immediately
```

## API Endpoints

### GET /api/stripe/connect

Get connected account status for a clinic.

```bash
GET /api/stripe/connect?clinicId=123
```

**Query Parameters:**

- `clinicId` (required): Clinic ID
- `action` (optional): 'status', 'onboarding', 'dashboard', 'sync'

**Response:**

```json
{
  "clinic": { "id": 123, "name": "My Clinic" },
  "stripe": {
    "hasConnectedAccount": true,
    "accountId": "acct_xxx",
    "status": "active",
    "onboardingComplete": true,
    "chargesEnabled": true,
    "payoutsEnabled": true
  }
}
```

### POST /api/stripe/connect

Create a new connected account for a clinic.

```bash
POST /api/stripe/connect
Content-Type: application/json

{
  "clinicId": 123,
  "email": "admin@clinic.com",
  "businessType": "company",
  "country": "US"
}
```

**Response:**

```json
{
  "success": true,
  "accountId": "acct_xxx",
  "onboardingUrl": "https://connect.stripe.com/setup/..."
}
```

### DELETE /api/stripe/connect

Disconnect a Stripe account from a clinic.

```bash
DELETE /api/stripe/connect?clinicId=123
```

## Webhook Configuration

### Setup Steps

1. In Stripe Dashboard, go to **Developers → Webhooks**
2. Create a new endpoint:
   - URL: `https://yourdomain.com/api/webhooks/stripe-connect`
   - Events: `account.updated`, `account.application.deauthorized`, `capability.updated`
3. Copy the signing secret
4. Set environment variable: `STRIPE_CONNECT_WEBHOOK_SECRET=whsec_xxx`

### Events Handled

| Event                              | Description                                |
| ---------------------------------- | ------------------------------------------ |
| `account.updated`                  | Syncs chargesEnabled, payoutsEnabled, etc. |
| `account.application.deauthorized` | Handles account disconnection              |
| `capability.updated`               | Syncs when capabilities change             |

## Environment Variables

```bash
# Required
STRIPE_SECRET_KEY=sk_live_xxx          # Platform's Stripe secret key
STRIPE_WEBHOOK_SECRET=whsec_xxx        # Regular webhook secret
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_xxx # Connect webhook secret (can be same)

# OAuth (Recommended for best UX)
STRIPE_CONNECT_CLIENT_ID=ca_xxx        # From Dashboard → Connect → Settings

# Optional (for client-side features)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
```

## OAuth Setup

### 1. Enable OAuth in Stripe Dashboard

1. Go to **Stripe Dashboard → Connect → Settings**
2. Under "OAuth settings", note your **Client ID** (starts with `ca_`)
3. Add redirect URI: `https://yourdomain.com/api/stripe/connect/oauth/callback`
4. Set `STRIPE_CONNECT_CLIENT_ID` in your environment

### 2. OAuth Flow Endpoints

| Endpoint                             | Method | Description                        |
| ------------------------------------ | ------ | ---------------------------------- |
| `/api/stripe/connect/oauth`          | GET    | Generate OAuth authorize URL       |
| `/api/stripe/connect/oauth`          | POST   | Exchange code for account (manual) |
| `/api/stripe/connect/oauth/callback` | GET    | Handle Stripe redirect             |

### 3. OAuth Security

- **State parameter**: Includes clinic ID, user ID, and timestamp
- **Time limit**: Authorization expires after 15 minutes
- **User validation**: Verifies the returning user matches who started

## Platform Account Mode

For the main platform clinic (e.g., EONmeds), set `stripePlatformAccount: true` in the database.
This clinic:

- Uses the platform's Stripe account directly
- Does not need to connect a separate account
- All API calls use the main Stripe secret key

## Security Considerations

### Authorization

- Super admins can manage any clinic's Stripe connection
- Clinic admins can only manage their own clinic
- All actions are logged with user ID and timestamp

### Webhook Security

- All webhooks verify Stripe signature
- Invalid signatures return 400 error
- Events are idempotent (safe to replay)

### Data Isolation

- Each clinic's Stripe data is isolated via connected account ID
- API calls include `stripeAccount` header for connected accounts
- No cross-clinic data access possible

## Testing

### Test Mode

1. Use Stripe test mode keys (`sk_test_xxx`, `pk_test_xxx`)
2. Test accounts can complete onboarding instantly
3. Use test card numbers from [Stripe docs](https://stripe.com/docs/testing)

### Test Webhook Events

Use Stripe CLI to test webhooks locally:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe-connect
stripe trigger account.updated
```

## Troubleshooting

### Account Not Syncing

1. Check webhook endpoint is configured
2. Verify `STRIPE_CONNECT_WEBHOOK_SECRET` is set
3. Check webhook logs in Stripe Dashboard

### Onboarding Stuck

1. Use "Continue Setup" button to resume
2. Click "Sync Status" to refresh from Stripe
3. Check Stripe requirements in account dashboard

### Charges Not Enabled

Account may have pending requirements:

1. Go to Stripe Dashboard → Connected Accounts
2. Find the account and view requirements
3. Complete any outstanding verification

## Files Reference

| File                                                 | Description                        |
| ---------------------------------------------------- | ---------------------------------- |
| `src/lib/stripe/connect.ts`                          | Core Stripe Connect library        |
| `src/app/api/stripe/connect/route.ts`                | Connect API endpoints              |
| `src/app/api/stripe/connect/oauth/route.ts`          | OAuth authorize/exchange endpoints |
| `src/app/api/stripe/connect/oauth/callback/route.ts` | OAuth callback handler             |
| `src/app/api/webhooks/stripe-connect/route.ts`       | Connect webhook handler            |
| `src/app/admin/settings/stripe/page.tsx`             | Self-service settings UI           |
| `src/app/admin/stripe-dashboard/page.tsx`            | Financial dashboard                |
