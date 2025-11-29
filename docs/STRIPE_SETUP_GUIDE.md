# 🔧 Stripe Setup Guide

## Quick Fix for "Cannot read properties of undefined" Error

If you encounter the error: `Cannot read properties of undefined (reading 'match')` from Stripe, follow these steps:

### 1. Add Your Stripe Keys to Environment Variables

Create or update your `.env.local` file with your Stripe keys:

```bash
# Test Keys (for development)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET_HERE

# Price IDs (create in Stripe Dashboard)
NEXT_PUBLIC_STRIPE_PRICE_BASIC=price_YOUR_BASIC_PRICE_ID
NEXT_PUBLIC_STRIPE_PRICE_PRO=price_YOUR_PRO_PRICE_ID
NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE=price_YOUR_ENTERPRISE_PRICE_ID
```

### 2. Get Your Keys from Stripe Dashboard

1. Log in to [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Developers → API keys**
3. Copy your **Publishable key** (starts with `pk_test_` for test mode)
4. Copy your **Secret key** (starts with `sk_test_` for test mode)

### 3. Create Products and Prices

1. Go to **Products** in Stripe Dashboard
2. Create three products:
   - Basic Plan ($49/month)
   - Professional Plan ($99/month)
   - Enterprise Plan ($299/month)
3. Copy each product's price ID (starts with `price_`)

### 4. Set Up Webhook Endpoint

1. Go to **Developers → Webhooks**
2. Click **Add endpoint**
3. Enter URL: `https://yourdomain.com/api/v2/stripe/webhook`
4. Select these events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the **Signing secret** (starts with `whsec_`)

### 5. Restart Your Development Server

After updating environment variables, restart the server:

```bash
# Kill existing process
pkill -f "next dev"

# Restart
npm run dev
```

## Test Credit Cards

Use these test cards in development:

| Card Number | Description |
|------------|-------------|
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 0002` | Generic decline |
| `4000 0025 0000 3155` | Requires authentication |

Use any future date for expiry and any 3-digit CVC.

## Troubleshooting

### Error: Stripe is not configured

**Solution**: The component will show a yellow warning box with instructions. Add your Stripe publishable key to `.env.local`.

### Error: Payment fails

**Possible causes**:
1. Using live keys in test mode (or vice versa)
2. Incorrect price IDs
3. Network issues

### Error: Webhook signature verification failed

**Solution**: Make sure your webhook secret in `.env.local` matches the one in Stripe Dashboard.

## Security Best Practices

⚠️ **NEVER commit real API keys to version control**

1. Always use `.env.local` for sensitive keys
2. Use test keys during development
3. Set production keys only in your hosting environment
4. Rotate keys regularly
5. Use webhook signature verification

## Need Help?

- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Support](https://support.stripe.com)
- Check `/docs/STRIPE_SUBSCRIPTIONS.md` for integration details

---
*Last Updated: November 24, 2024*
