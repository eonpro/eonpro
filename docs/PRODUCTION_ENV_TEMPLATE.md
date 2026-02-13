# EONPRO Production Environment Configuration

Copy these values to your production environment (Vercel, AWS, etc.)

## Required Environment Variables

### Database

**Vercel (serverless):** Use `connection_limit=1` and RDS Proxy or PgBouncer to avoid pool exhaustion (P2024).

```
# With RDS Proxy (recommended - use proxy endpoint, not direct RDS):
DATABASE_URL=postgresql://USER:PASSWORD@PROXY-ENDPOINT.proxy-xxx.region.rds.amazonaws.com:5432/DATABASE?schema=public&sslmode=require&connection_limit=1&pool_timeout=15

# Direct RDS (only if no pooler - cap connections):
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public&sslmode=require&connection_limit=1&pool_timeout=15
```

> The app injects `connection_limit=1` on Vercel automatically. Do NOT set `DATABASE_CONNECTION_LIMIT` > 1 in production.

### Authentication & Security (CRITICAL)

```bash
# Generate with: openssl rand -base64 64
JWT_SECRET=<64-byte-random-string>
NEXTAUTH_SECRET=<64-byte-random-string>
NEXTAUTH_URL=https://your-production-domain.com

# PHI Encryption Key - Generate with: openssl rand -hex 32
ENCRYPTION_KEY=<32-byte-hex-string>
```

### Lifefile Pharmacy Integration

```
LIFEFILE_API_BASE_URL=https://api.lifefilepharmacy.com
LIFEFILE_API_USERNAME=<your_username>
LIFEFILE_API_PASSWORD=<your_password>
LIFEFILE_VENDOR_ID=<vendor_id>
LIFEFILE_PRACTICE_ID=<practice_id>
LIFEFILE_NETWORK_ID=<network_id>
LIFEFILE_LOCATION_ID=<location_id>
LIFEFILE_WEBHOOK_SECRET=<webhook_secret>
```

### OpenAI (Becca AI)

```
OPENAI_API_KEY=sk-<your-api-key>
OPENAI_MODEL=gpt-4-turbo-preview
OPENAI_MAX_TOKENS=4000
```

## Optional Environment Variables

### AWS S3 (File Storage - REQUIRED for document uploads)

```
# Feature flag to enable S3 storage
NEXT_PUBLIC_ENABLE_AWS_S3_STORAGE=true

# AWS credentials
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<access_key>
AWS_SECRET_ACCESS_KEY=<secret_key>
AWS_S3_BUCKET_NAME=<bucket_name>

# Optional: CloudFront CDN and KMS encryption
# AWS_CLOUDFRONT_URL=https://your-cloudfront.com
# AWS_KMS_KEY_ID=<kms_key_id>
```

### Twilio (SMS/Voice)

```
TWILIO_ACCOUNT_SID=<account_sid>
TWILIO_AUTH_TOKEN=<auth_token>
TWILIO_PHONE_NUMBER=+1234567890
```

### Stripe (Payments)

```
STRIPE_SECRET_KEY=sk_live_<key>
STRIPE_WEBHOOK_SECRET=whsec_<secret>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_<key>
```

### Zoom (Telehealth)

```
ZOOM_CLIENT_ID=<client_id>
ZOOM_CLIENT_SECRET=<client_secret>
ZOOM_ACCOUNT_ID=<account_id>
```

### Monitoring

```
SENTRY_DSN=https://<dsn>@sentry.io/<project>
LOG_LEVEL=info
```

### Application

```
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<api_key>
```

## Database Connection Checklist (Vercel)

- [ ] `DATABASE_URL` uses `connection_limit=1` (or omit—app injects it on Vercel)
- [ ] `DATABASE_URL` host is RDS Proxy endpoint (`.proxy-` in hostname) when RDS Proxy is deployed
- [ ] If using RDS Proxy: `USE_RDS_PROXY=true` (optional; auto-detected from `.proxy-` in URL)
- [ ] Do not set `DATABASE_CONNECTION_LIMIT` > 1 in Vercel env

## Security Checklist

- [ ] All secrets are unique and randomly generated
- [ ] Database password is strong (32+ characters)
- [ ] JWT_SECRET is at least 64 bytes
- [ ] ENCRYPTION_KEY is exactly 32 bytes (64 hex chars)
- [ ] All API keys are production keys (not test/sandbox)
- [ ] HTTPS is enabled for NEXTAUTH_URL
- [ ] Webhook secrets are configured for Lifefile and Stripe
