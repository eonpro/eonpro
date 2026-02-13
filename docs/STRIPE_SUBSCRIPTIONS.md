# 💳 Stripe Subscriptions Integration

## Overview

Enhanced Stripe integration extracted from EONPRO EHR system, adding subscription billing
capabilities to the Lifefile platform.

## ✅ What's Been Added

### 1. Feature Flag System

- **Location**: `src/lib/features.ts`
- **Purpose**: Safe rollout of new features
- **Usage**: All new integrations are behind feature flags

### 2. Subscription Components

- **Location**: `src/components/stripe/SubscriptionForm.tsx`
- **Features**:
  - Plan selection UI
  - Secure payment collection
  - Subscription management
  - Feature-flag protected

### 3. API Routes

- **Create Subscription**: `/api/v2/stripe/create-subscription`
- **Webhook Handler**: `/api/v2/stripe/webhook`
- **Features**:
  - Customer creation
  - Subscription lifecycle management
  - Payment processing
  - Event handling

## 🚀 How to Enable

### 1. Environment Variables

Add to your `.env.local`:

```env
# Enable Stripe Subscriptions
NEXT_PUBLIC_ENABLE_STRIPE_SUBSCRIPTIONS=true

# Stripe Keys (if not already set)
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Price IDs (create in Stripe Dashboard)
NEXT_PUBLIC_STRIPE_PRICE_BASIC=price_...
NEXT_PUBLIC_STRIPE_PRICE_PRO=price_...
NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE=price_...
```

### 2. Database Schema (Optional)

If you want to track subscriptions in your database:

```prisma
model Subscription {
  id                   Int      @id @default(autoincrement())
  stripeSubscriptionId String   @unique
  stripeCustomerId     String
  patientId           Int?
  status              String
  priceId             String
  currentPeriodStart  DateTime
  currentPeriodEnd    DateTime
  cancelledAt         DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  patient Patient? @relation(fields: [patientId], references: [id])
}
```

### 3. Configure Webhook

In Stripe Dashboard:

1. Go to Developers → Webhooks
2. Add endpoint: `https://yourdomain.com/api/v2/stripe/webhook`
3. Select events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `checkout.session.completed`

## 📖 Usage

### Basic Implementation

```tsx
import SubscriptionForm from '@/components/stripe/SubscriptionForm';

export default function BillingPage() {
  return (
    <div>
      <h1>Upgrade Your Plan</h1>
      <SubscriptionForm />
    </div>
  );
}
```

### With Custom Plans

```tsx
// Modify SUBSCRIPTION_PLANS in SubscriptionForm.tsx
const SUBSCRIPTION_PLANS = [
  {
    id: 'custom',
    name: 'Custom Plan',
    priceId: 'price_xxx',
    amount: 15000, // $150.00
    interval: 'month',
    features: ['Your features here'],
  },
];
```

### Check Subscription Status

```tsx
// In your API route or server component
const subscription = await stripe.subscriptions.retrieve(subscriptionId);
const isActive = subscription.status === 'active';
```

## 🔒 Security Considerations

1. **Never expose secret keys** - Use environment variables
2. **Validate webhooks** - Always verify Stripe signatures
3. **Feature flags** - Keep disabled in production until tested
4. **PCI Compliance** - Use Stripe Elements for card collection
5. **Error handling** - Log errors but don't expose details to users

## 🧪 Testing

### Test Mode

1. Use Stripe test keys (start with `sk_test_` and `pk_test_`)
2. Test cards:
   - Success: `4242 4242 4242 4242`
   - Decline: `4000 0000 0000 0002`
   - Authentication: `4000 0025 0000 3155`

### Local Testing

```bash
# Enable feature flag
echo "NEXT_PUBLIC_ENABLE_STRIPE_SUBSCRIPTIONS=true" >> .env.local

# Start development server
npm run dev

# Visit subscription page
http://localhost:5000/billing/subscriptions
```

### Webhook Testing

Use Stripe CLI for local webhook testing:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local
stripe listen --forward-to localhost:5000/api/v2/stripe/webhook
```

## 📊 Monitoring

### Key Metrics

- Subscription conversion rate
- Churn rate
- Payment failure rate
- Average revenue per user (ARPU)

### Stripe Dashboard

Monitor in real-time:

- Active subscriptions
- Revenue
- Failed payments
- Customer lifetime value

## 🔄 Rollback Plan

If issues arise:

1. Set `NEXT_PUBLIC_ENABLE_STRIPE_SUBSCRIPTIONS=false`
2. Subscriptions form will show "Coming soon" message
3. Existing subscriptions continue working in Stripe
4. No data loss or service interruption

## 🚧 TODO

- [ ] Add subscription status to user profile
- [ ] Implement usage-based billing
- [ ] Add invoice download functionality
- [ ] Create customer portal integration
- [ ] Add subscription analytics dashboard
- [ ] Implement trial periods
- [ ] Add coupon/discount support

## 📚 Resources

- [Stripe Subscriptions Guide](https://stripe.com/docs/billing/subscriptions/overview)
- [Stripe React Elements](https://stripe.com/docs/stripe-js/react)
- [Webhook Best Practices](https://stripe.com/docs/webhooks/best-practices)
- [PCI Compliance](https://stripe.com/docs/security/guide)

---

_Integration Date: November 24, 2024_ _Source: EONPRO INDIA EHR (Stage Branch)_
