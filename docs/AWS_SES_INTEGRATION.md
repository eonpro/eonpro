# AWS SES Email Integration Guide

## Overview

AWS SES (Simple Email Service) has been integrated into the Lifefile platform to handle all
transactional email communications, including appointment reminders, order confirmations, password
resets, and more.

## ✅ What's Been Implemented

### Core Infrastructure

#### **Email Configuration** (`src/lib/integrations/aws/sesConfig.ts`)

- Feature flag support (`AWS_SES_EMAIL`)
- 25+ pre-built email templates
- Email priority levels (high, normal, low)
- Rate limiting (14 emails/second)
- Bounce and complaint handling
- HIPAA-compliant email policies

#### **Email Service** (`src/lib/integrations/aws/sesService.ts`)

- Single and bulk email sending
- Template rendering with Handlebars
- Retry logic with exponential backoff
- Attachment support
- Email tracking tags
- Mock service for development

### Email Templates

#### Patient Communications

- **Welcome Email** - New patient onboarding
- **Appointment Confirmation** - Booking confirmations
- **Appointment Reminder** - 24-hour reminders
- **Appointment Cancelled** - Cancellation notices
- **Appointment Rescheduled** - Schedule changes

#### Order & Prescription

- **Order Confirmation** - Purchase receipts
- **Order Shipped** - Shipping notifications
- **Order Delivered** - Delivery confirmations
- **Prescription Ready** - Pickup notifications
- **Prescription Expiring** - Renewal reminders
- **Refill Reminder** - Medication reminders

#### Account & Security

- **Password Reset** - Reset instructions
- **Email Verification** - Account verification
- **Two-Factor Code** - 2FA authentication
- **Account Locked** - Security alerts

#### Billing

- **Payment Received** - Payment confirmations
- **Payment Failed** - Failed payment notices
- **Subscription Renewed** - Renewal confirmations
- **Subscription Cancelled** - Cancellation confirmations
- **Invoice** - Billing statements

#### Provider Communications

- **Provider Welcome** - Provider onboarding
- **New Patient Assigned** - Assignment notices
- **Document Received** - Document notifications
- **Signature Required** - Signature requests

### User Interface

#### **Email Communications Center** (`/communications/email`)

- Compose and send emails
- Template library with previews
- Email logs and history
- Real-time send status
- Batch email support

#### **Test Suite** (`/test/ses`)

- 15+ comprehensive test scenarios
- Template preview functionality
- Configuration validation
- Send quota monitoring
- Rate limit testing

### API Endpoints

- `/api/v2/aws/ses/send` - Send single or bulk emails
- `/api/v2/aws/ses/config` - Configuration status
- `/api/v2/aws/ses/quota` - Send quota and usage
- `/api/v2/aws/ses/validate` - Email validation
- `/api/v2/aws/ses/preview` - Template preview

## 🔧 Configuration

### Environment Variables

Add to your `.env.local`:

```env
# Enable SES Feature
AWS_SES_EMAIL=true

# AWS Credentials (same as S3 if using same account)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_SES_REGION=us-east-1

# Email Settings
AWS_SES_FROM_EMAIL=noreply@yourdomain.com
AWS_SES_FROM_NAME=Lifefile Health
AWS_SES_REPLY_TO_EMAIL=support@yourdomain.com

# Optional: Configuration Set for tracking
AWS_SES_CONFIGURATION_SET=your-config-set

# Optional: Send rate limit (emails per second)
AWS_SES_MAX_SEND_RATE=14
```

### Setting Up AWS SES

1. **Verify Your Domain**

   ```bash
   aws ses verify-domain-identity --domain yourdomain.com
   ```

2. **Verify Email Addresses (for sandbox)**

   ```bash
   aws ses verify-email-identity --email-address test@example.com
   ```

3. **Request Production Access**
   - Move out of sandbox mode to send to any email
   - Request through AWS Console → SES → Account dashboard

4. **Set Up DKIM**
   - Enable DKIM signing for better deliverability
   - Add CNAME records to your DNS (see [DNS on Vercel](#dns-for-ses-when-your-domain-is-on-vercel)
     below)

5. **Configure SPF**
   - Add SPF record to DNS: `"v=spf1 include:amazonses.com ~all"`

### DNS for SES when your domain is on Vercel

If **eonpro.io** (or your sending domain) is on Vercel, add the SES records in Vercel’s DNS:

1. **Open Domains in Vercel**
   - Go to [vercel.com](https://vercel.com) → your **Team** → **Settings** → **Domains**
   - Or: **Project** → **Settings** → **Domains** and use **Edit** on the root domain (e.g.
     `eonpro.io`).

2. **Find where to add DNS records**
   - Click the root domain **eonpro.io** (not only `app.eonpro.io`).
   - Look for **DNS Records**, **Manage DNS**, or **Records**.
   - If you don’t see it, the domain may be using external nameservers; add the records at the
     provider that hosts DNS for `eonpro.io`.

3. **Add the 3 DKIM CNAME records** (from SES “Domain DNS records” modal):

   | Type  | Name (host)                                   | Value                                                 |
   | ----- | --------------------------------------------- | ----------------------------------------------------- |
   | CNAME | `ty2xrmci77xerey7rnl6rfcecfdhz55e._domainkey` | `ty2xrmci77xerey7rnl6rfcecfdhz55e.dkim.amazonses.com` |
   | CNAME | `txtjqiu5dr3zehhf5ssdqrnqh373oyit._domainkey` | `txtjqiu5dr3zehhf5ssdqrnqh373oyit.dkim.amazonses.com` |
   | CNAME | `tagrrnmuioyyxqkvuiyrm7aogf3q7jsv._domainkey` | `tagrrnmuioyyxqkvuiyrm7aogf3q7jsv.dkim.amazonses.com` |
   - In Vercel, **Name** is usually the part _before_ `eonpro.io` (e.g.
     `ty2xrmci77xerey7rnl6rfcecfdhz55e._domainkey`). If it asks for a full name, use e.g.
     `ty2xrmci77xerey7rnl6rfcecfdhz55e._domainkey.eonpro.io`.
   - **Value** = the full target (e.g. `ty2xrmci77xerey7rnl6rfcecfdhz55e.dkim.amazonses.com`).

4. **Add the DMARC TXT record**

   | Type | Name (host) | Value               |
   | ---- | ----------- | ------------------- |
   | TXT  | `_dmarc`    | `v=DMARC1; p=none;` |
   - Name: `_dmarc` (or `_dmarc.eonpro.io` if it requires the full name).
   - Value: `v=DMARC1; p=none;` (some UIs add quotes; both are valid).

5. **Save and wait for verification**
   - DNS can take a few minutes to a few hours to propagate.
   - In **AWS SES** → **Verified identities** → **eonpro.io**, DKIM status will change to
     **Verified** once the CNAMEs are visible.

6. **Custom MAIL FROM (fix “MAIL FROM record is not aligned”)**
   - The SES modal showed “No MAIL FROM records found.” Aligning the envelope sender (Return-Path)
     with your domain improves deliverability and
     [DMARC compliance](https://docs.aws.amazon.com/ses/latest/dg/send-email-authentication-dmarc.html).
     **In SES:** Configuration → **Identities** → **eonpro.io** → **Authentication** → **Custom MAIL
     FROM domain** → **Edit**. Enable **Use a custom MAIL FROM domain**, set **MAIL FROM domain** to
     a subdomain of `eonpro.io` not used for sending/receiving (e.g. `bounce.eonpro.io`). **Behavior
     on MX failure:** **Use default MAIL FROM domain**. Save. **In Vercel DNS:** add the MX and TXT
     (SPF) records from SES **Publish DNS records** (MX: name `bounce`, value
     `10 feedback-smtp.us-east-2.amazonses.com`; TXT: name `bounce`, value
     `"v=spf1 include:amazonses.com ~all"`). Exactly one MX on the MAIL FROM subdomain. Verification
     can take minutes to 72 hours.

## 📧 Using the Email Service

### Sending a Single Email

```typescript
// Using a template
await fetch('/api/v2/aws/ses/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: 'patient@example.com',
    template: 'appointment_reminder',
    templateData: {
      patientName: 'John Doe',
      appointmentDate: 'December 25, 2024',
      appointmentTime: '2:00 PM',
      providerName: 'Dr. Smith',
      location: '123 Medical Center',
    },
  }),
});

// Custom email
await fetch('/api/v2/aws/ses/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: 'patient@example.com',
    subject: 'Custom Subject',
    html: '<h1>Custom HTML Content</h1>',
    text: 'Custom text content',
    priority: 'high',
  }),
});
```

### Sending Bulk Emails

```typescript
await fetch('/api/v2/aws/ses/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    recipients: [
      { email: 'user1@example.com', data: { name: 'User 1' } },
      { email: 'user2@example.com', data: { name: 'User 2' } },
    ],
    template: 'welcome',
    defaultData: { companyName: 'Lifefile Health' },
  }),
});
```

### Adding Attachments

```typescript
await fetch('/api/v2/aws/ses/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: 'patient@example.com',
    subject: 'Document Attached',
    html: '<p>Please find the attached document.</p>',
    attachments: [
      {
        filename: 'prescription.pdf',
        content: base64EncodedContent,
        encoding: 'base64',
        contentType: 'application/pdf',
      },
    ],
  }),
});
```

## 🧪 Testing

### Mock Service (Development)

When `AWS_SES_EMAIL=false`, the system uses a mock service that:

- Logs emails to console
- Returns mock message IDs
- Simulates send delays
- Provides test quota limits
- No actual emails are sent

### Test Page Features

Navigate to `/test/ses` to:

- Run comprehensive test suite
- Preview all email templates
- Test single and bulk sending
- Validate email addresses
- Check send quota
- Test rate limiting

### Common Test Scenarios

1. **Feature Flag Check** - Verifies SES is enabled
2. **Configuration Validation** - Checks AWS credentials
3. **Send Quota Check** - Monitors usage limits
4. **Template Rendering** - Previews all templates
5. **Bulk Email Test** - Tests batch sending
6. **High Priority Email** - Tests priority flags
7. **Attachment Test** - Tests file attachments
8. **Rate Limit Test** - Verifies throttling

## 🔒 Security Features

### Email Authentication

- **SPF** - Sender Policy Framework
- **DKIM** - DomainKeys Identified Mail
- **DMARC** - Domain-based Message Authentication

### Bounce & Complaint Handling

- Automatic bounce processing
- Complaint feedback loops
- Blacklist management
- Suppression list updates

### Rate Limiting

- 14 emails per second (default)
- 50,000 emails per day (sandbox)
- Automatic throttling
- Batch processing delays

### Data Protection

- TLS encryption in transit
- HIPAA-compliant policies
- PII data handling
- Audit logging

## 📊 Monitoring & Analytics

### Track Email Metrics

- Delivery rates
- Open rates (with tracking pixel)
- Click rates (with link tracking)
- Bounce rates
- Complaint rates

### Campaign Tags

Add custom tags for tracking:

```typescript
tags: {
  campaign: 'appointment-reminders',
  department: 'cardiology',
  version: 'v1'
}
```

### Configuration Sets

Use AWS SES Configuration Sets for:

- Event publishing to SNS/CloudWatch
- Reputation tracking
- IP pool management

### Set up SES monitoring (Configuration Set + SNS)

This wires SES send/delivery/bounce/complaint events to your app so you can track and react (e.g.
your existing `/api/webhooks/ses-bounce` handler).

**1. Create a Configuration Set in AWS**

1. In **AWS Console** go to **Amazon SES** → **Configuration** → **Configuration sets**.
2. Click **Create configuration set**.
3. **Configuration set name:** e.g. `eonpro-email-events`.
4. Leave event destination empty for now → **Create**.

**2. Create an SNS topic**

1. Go to **Amazon SNS** → **Topics** → **Create topic**.
2. **Type:** Standard.
3. **Name:** e.g. `ses-eonpro-events`.
4. **Create topic**.
5. Copy the **Topic ARN** (e.g. `arn:aws:sns:us-east-2:123456789012:ses-eonpro-events`).

**3. Add an event destination to the Configuration Set**

1. Back in **SES** → **Configuration sets** → open **eonpro-email-events**.
2. **Event destinations** tab → **Add destination**.
3. **Event destination type:** Amazon SNS.
4. **SNS topic:** choose the topic you created (e.g. `ses-eonpro-events`).
5. **Event types:** enable **Send**, **Delivery**, **Bounce**, **Complaint** (and **Reject** if you
   want).
6. **Add destination**.

**4. Subscribe your webhook to the SNS topic**

1. In **SNS** → **Topics** → open **ses-eonpro-events**.
2. **Create subscription**.
3. **Protocol:** HTTPS.
4. **Endpoint:** your app’s webhook URL, e.g. `https://app.eonpro.io/api/webhooks/ses-bounce`.
5. **Create subscription**.
6. AWS will send a **SubscriptionConfirmation** to that URL; your app’s webhook already handles it
   and confirms automatically. In SNS, the subscription status should change to **Confirmed** after
   the first request.

**5. Use the Configuration Set when sending**

Set the configuration set name in your environment so all SES sends use it:

- In **production:** set `AWS_SES_CONFIGURATION_SET=eonpro-email-events` in your deployment env
  (e.g. Vercel → Project → Settings → Environment Variables).
- In **local:** add the same to `.env.local` or `.env.production.local` if you test against
  production SES.

The app only attaches the configuration set to outbound emails when `AWS_SES_CONFIGURATION_SET` is
set; if it’s empty, sends are unchanged.

**6. Verify**

- Send a test email (e.g. from your app or the SES console).
- In **SNS** → **Topics** → **ses-eonpro-events** → **Subscriptions**, the subscription should be
  **Confirmed**.
- Check your app logs or `email_log` (if you log there) for webhook requests; you should see SNS
  notifications for Send/Delivery (and Bounce/Complaint when they occur).

**Optional: CloudWatch**

- In the Configuration Set’s event destination you can also add a **CloudWatch** destination to get
  metrics (e.g. send count, bounce count) in CloudWatch without going through your webhook.

## 🚨 Troubleshooting

### Common Issues

#### "SES is not configured"

- Check all environment variables are set
- Verify AWS credentials have SES permissions
- Ensure region is correct

#### "Email address not verified"

- In sandbox mode, recipient must be verified
- Request production access to send to any email

#### "Rate limit exceeded"

- Reduce sending rate
- Implement batch delays
- Check current quota usage

#### "Invalid email format"

- Validate email addresses before sending
- Check for special characters
- Ensure proper domain format

### SES Sandbox Limitations

- Can only send to verified emails
- Limited to 200 emails/day
- Maximum 1 email/second
- Request production access to remove limits

### Production Best Practices

1. **Warm up IP addresses** gradually
2. **Monitor reputation** dashboard
3. **Handle bounces** promptly
4. **Process complaints** immediately
5. **Maintain list hygiene**
6. **Use dedicated IP pools** for different email types
7. **Implement retry logic** for transient failures
8. **Set up SNS notifications** for events

## 📈 Next Steps

1. **Move to Production**
   - Request SES production access
   - Verify sending domain
   - Set up DKIM and SPF

2. **Advanced Features**
   - Email scheduling
   - A/B testing templates
   - Dynamic personalization
   - Multi-language support

3. **Integrations**
   - Connect to CRM
   - Sync with marketing platform
   - Analytics dashboard
   - Webhook processing

## 🎯 Quick Start Checklist

- [ ] Add AWS credentials to `.env.local`
- [ ] Enable `AWS_SES_EMAIL=true`
- [ ] Verify sender email address
- [ ] Test with `/test/ses` page
- [ ] Send test email from `/communications/email`
- [ ] Review email logs
- [ ] Request production access
- [ ] Configure domain authentication
- [ ] Set up monitoring (Configuration Set + SNS → webhook); see
      [Set up SES monitoring](#set-up-ses-monitoring-configuration-set--sns)
- [ ] Set `AWS_SES_CONFIGURATION_SET` in production env
- [ ] Deploy to production
