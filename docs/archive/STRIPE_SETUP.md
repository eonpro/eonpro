# Stripe Setup Guide

## Current Status: Demo Mode

The billing system is currently operating in **Demo Mode** because Stripe is not configured.

## What Works in Demo Mode:

- ✅ Creating invoices (stored locally in database)
- ✅ Viewing invoice history
- ✅ Managing billing records
- ❌ Processing actual payments
- ❌ Sending invoices to customers
- ❌ Webhook integrations

## To Enable Full Billing Features:

### 1. Get Your Stripe API Keys

1. Sign up for a Stripe account at https://stripe.com
2. Go to https://dashboard.stripe.com/apikeys
3. Copy your test keys (for development) or live keys (for production)

### 2. Add Environment Variables

Add the following to your `.env` file:

```bash
# Required for basic Stripe functionality
STRIPE_SECRET_KEY=sk_test_YOUR_STRIPE_SECRET_KEY_HERE
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_STRIPE_PUBLISHABLE_KEY_HERE

# Optional - for webhook handling
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE

# Optional - for specific products
STRIPE_PRODUCT_CONSULTATION=prod_YOUR_CONSULTATION_PRODUCT_ID
STRIPE_PRODUCT_PRESCRIPTION=prod_YOUR_PRESCRIPTION_PRODUCT_ID
STRIPE_PRODUCT_LAB_WORK=prod_YOUR_LAB_WORK_PRODUCT_ID
```

### 3. Restart Your Development Server

After adding the environment variables, restart your Next.js development server:

```bash
npm run dev
```

## Demo Mode Features

While Stripe is not configured, the system will:

- Create invoices in the local database
- Track billing records
- Display invoice information
- Show a "Demo Mode" indicator when creating invoices

This allows you to develop and test the application without needing Stripe credentials.

## Production Requirements

For production use, you MUST configure Stripe to:

- Process real payments
- Send invoices to patients
- Handle refunds and disputes
- Maintain HIPAA compliance for payment processing
