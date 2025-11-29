# 🎯 Stripe Invoicing Integration - Complete

## ✅ What Has Been Implemented

### 1. **Database Schema**
- ✅ Added `stripeCustomerId` field to Patient model
- ✅ Created `Invoice` model with full Stripe integration fields
- ✅ Created `Payment` model for payment tracking
- ✅ Added enums for `InvoiceStatus` and `PaymentStatus`

### 2. **Stripe Configuration** (`src/lib/stripe.ts`)
- ✅ Stripe SDK initialization with API keys
- ✅ Configuration constants for currency, payment methods, invoice settings
- ✅ Helper functions for currency formatting
- ✅ Dynamic loading to prevent build-time errors

### 3. **Service Layer**

#### Customer Service (`src/services/stripe/customerService.ts`)
- ✅ Get or create Stripe customers for patients
- ✅ Auto-sync patient data to Stripe
- ✅ Customer portal URL generation
- ✅ Bulk patient sync capability

#### Invoice Service (`src/services/stripe/invoiceService.ts`)
- ✅ Create invoices with line items
- ✅ Auto-send invoices via email
- ✅ Void and mark uncollectible functions
- ✅ Webhook update handlers
- ✅ Pre-built invoice types (consultation, prescription, lab work)

#### Payment Service (`src/services/stripe/paymentService.ts`)
- ✅ Create payment intents
- ✅ Process payments with saved methods
- ✅ Refund processing
- ✅ Payment method management
- ✅ Payment history tracking

### 4. **API Endpoints**

#### `/api/stripe/invoices`
- `POST`: Create new invoice
- `GET`: List patient invoices

#### `/api/stripe/invoices/[id]`
- `GET`: Get specific invoice
- `POST`: Perform actions (send, void, mark uncollectible)

#### `/api/stripe/payments`
- `POST`: Create payment or payment intent
- `GET`: List patient payments

#### `/api/stripe/customer-portal`
- `POST`: Generate customer portal session URL

#### `/api/stripe/webhook`
- `POST`: Handle Stripe webhook events
- Processes invoice and payment updates
- Syncs data back to database

### 5. **UI Components**

#### Patient Billing View (`src/components/PatientBillingView.tsx`)
- ✅ Invoice listing with status badges
- ✅ Payment history display
- ✅ Create invoice form with line items
- ✅ Invoice actions (send, void, view PDF)
- ✅ Customer portal access button
- ✅ Tabbed interface (Invoices/Payments)

### 6. **Patient Profile Integration**
- ✅ Added "Billing" tab to patient profile
- ✅ Integrated billing view component
- ✅ Seamless navigation between profile sections

## 🚀 How to Use

### 1. **Set Up Stripe Account**
1. Create a Stripe account at https://stripe.com
2. Get your API keys from the Dashboard
3. Create webhook endpoint pointing to `/api/stripe/webhook`

### 2. **Configure Environment Variables**
Add these to your `.env` file:
```env
# Required
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Optional (for client-side features)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here

# Optional product IDs
STRIPE_PRODUCT_CONSULTATION=prod_xxx
STRIPE_PRODUCT_PRESCRIPTION=prod_xxx
STRIPE_PRODUCT_LAB_WORK=prod_xxx
```

### 3. **Creating Invoices**

#### Via UI:
1. Navigate to patient profile
2. Click "Billing" tab
3. Click "Create Invoice"
4. Add line items with descriptions and amounts
5. Choose to auto-send or save as draft

#### Via API:
```javascript
POST /api/stripe/invoices
{
  "patientId": 1,
  "description": "Medical Services",
  "lineItems": [
    {
      "description": "Consultation",
      "amount": 15000  // $150.00 in cents
    }
  ],
  "autoSend": true
}
```

### 4. **Processing Payments**

#### Create Payment Intent:
```javascript
POST /api/stripe/payments
{
  "patientId": 1,
  "amount": 15000,
  "description": "Consultation Payment"
}
// Returns clientSecret for Stripe Elements
```

#### With Saved Payment Method:
```javascript
POST /api/stripe/payments
{
  "patientId": 1,
  "amount": 15000,
  "paymentMethodId": "pm_xxx"
}
```

### 5. **Customer Portal**
Patients can manage their payment methods and billing:
```javascript
POST /api/stripe/customer-portal
{
  "patientId": 1,
  "returnUrl": "https://yoursite.com/patients/1"
}
// Returns portal URL
```

## 🔧 Webhook Configuration

1. In Stripe Dashboard, create webhook endpoint:
   - URL: `https://yourdomain.com/api/stripe/webhook`
   - Events to listen for:
     - `invoice.*`
     - `payment_intent.*`
     - `customer.*`
     - `charge.*`

2. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`

## 📊 Invoice Types

### Consultation Invoice
```javascript
await StripeInvoiceService.createConsultationInvoice(
  patientId,
  15000, // $150.00
  { autoSend: true }
);
```

### Prescription Invoice
```javascript
await StripeInvoiceService.createPrescriptionInvoice(
  patientId,
  orderId,
  [
    { name: "Semaglutide", amount: 30000 },
    { name: "B12", amount: 5000 }
  ]
);
```

### Lab Work Invoice
```javascript
await StripeInvoiceService.createLabWorkInvoice(
  patientId,
  [
    { name: "Comprehensive Panel", amount: 25000 },
    { name: "Thyroid Panel", amount: 15000 }
  ]
);
```

## 🔒 Security Features

- ✅ Webhook signature verification
- ✅ Server-side only API keys
- ✅ Dynamic imports to prevent key exposure
- ✅ Graceful handling of missing configuration
- ✅ Automatic customer data sync
- ✅ Audit trail via webhook events

## 📈 Status Tracking

### Invoice Statuses:
- `DRAFT`: Created but not sent
- `OPEN`: Sent and awaiting payment
- `PAID`: Successfully paid
- `VOID`: Cancelled
- `UNCOLLECTIBLE`: Marked as bad debt

### Payment Statuses:
- `PENDING`: Awaiting confirmation
- `PROCESSING`: Being processed
- `SUCCEEDED`: Payment complete
- `FAILED`: Payment failed
- `CANCELED`: Cancelled by user
- `REFUNDED`: Refunded to customer

## 🎨 UI Features

- Clean, tabbed interface in patient profile
- Real-time status badges
- Quick actions (send, void, view)
- Line item management
- Customer portal access
- Payment history with invoice links
- Responsive design

## 🚨 Important Notes

1. **Test Mode**: Always use test keys during development
2. **PCI Compliance**: Never store card details directly
3. **Webhooks**: Essential for real-time updates
4. **Idempotency**: Use idempotency keys for critical operations
5. **Error Handling**: All services include comprehensive error handling

## 📝 Next Steps (Optional Enhancements)

1. **Payment Collection UI**:
   - Add Stripe Elements for card collection
   - Implement payment form in patient portal

2. **Subscription Billing**:
   - Set up recurring billing for programs
   - Manage subscription lifecycles

3. **Advanced Features**:
   - Payment plans/installments
   - Discounts and coupons
   - Tax calculation by location
   - Multi-currency support

4. **Reporting**:
   - Revenue dashboards
   - Outstanding balance reports
   - Payment analytics

5. **Automation**:
   - Auto-invoice on prescription approval
   - Payment reminders
   - Dunning management

## 🛠️ Troubleshooting

### Container Not Starting:
```bash
docker logs lifefile-platform
```

### Stripe Not Working:
- Check environment variables are set
- Verify webhook secret is correct
- Ensure Stripe account is activated

### Database Issues:
```bash
npx prisma db push --accept-data-loss
npx prisma generate
```

## 📞 Support Resources

- Stripe Documentation: https://stripe.com/docs
- API Reference: https://stripe.com/docs/api
- Testing Cards: https://stripe.com/docs/testing
- Webhook Testing: https://dashboard.stripe.com/test/webhooks

---

The Stripe invoicing integration is now fully operational and ready for use. The system provides a complete billing solution with invoice creation, payment processing, and customer management capabilities.
