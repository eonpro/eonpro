# 🔐 EONPRO Environment Variables

Complete documentation of all environment variables required for EONPRO platform.

## Required Variables (Must Have)

### Database
| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db?sslmode=require` |

### Security
| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | JWT signing key (32+ chars) | Generate: `openssl rand -base64 32` |
| `NEXTAUTH_SECRET` | NextAuth secret | Generate: `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | PHI encryption (64 hex chars) | Generate: `openssl rand -hex 32` |

### Application
| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_APP_URL` | Public URL | `https://app.eonpro.io` |
| `NEXTAUTH_URL` | Auth callback URL | `https://app.eonpro.io` |

---

## Integration Variables

### Stripe (Payments)
| Variable | Description | Required |
|----------|-------------|----------|
| `STRIPE_SECRET_KEY` | API secret key | ✅ |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Public key | ✅ |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature | ✅ |

### Twilio (SMS/Chat)
| Variable | Description | Required |
|----------|-------------|----------|
| `TWILIO_ACCOUNT_SID` | Account SID | ✅ |
| `TWILIO_AUTH_TOKEN` | Auth token | ✅ |
| `TWILIO_PHONE_NUMBER` | SMS sender | ✅ |

### AWS
| Variable | Description | Required |
|----------|-------------|----------|
| `AWS_ACCESS_KEY_ID` | IAM key ID | For S3/SES |
| `AWS_SECRET_ACCESS_KEY` | IAM secret | For S3/SES |
| `AWS_REGION` | Region | `us-east-1` |
| `AWS_S3_BUCKET` | S3 bucket name | For uploads |

### Redis (Rate Limiting)
| Variable | Description | Required |
|----------|-------------|----------|
| `UPSTASH_REDIS_REST_URL` | Upstash URL | Recommended |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash token | Recommended |
| `REDIS_URL` | Standard Redis | Alternative |

### AI
| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI key | For AI features |

### Monitoring
| Variable | Description | Required |
|----------|-------------|----------|
| `SENTRY_DSN` | Sentry DSN | Recommended |
| `NEXT_PUBLIC_SENTRY_DSN` | Client Sentry | Recommended |

---

## Vercel Setup

1. Go to **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**
2. Add each variable
3. Select environments: **Production**, **Preview**, **Development**
4. Enable **Sensitive** flag for secrets

---

## Generate Secrets

```bash
# JWT Secret
openssl rand -base64 32

# Encryption Key (HIPAA)
openssl rand -hex 32

# NextAuth Secret
openssl rand -base64 32
```

---

## Checklist

- [ ] `DATABASE_URL` - PostgreSQL configured
- [ ] `JWT_SECRET` - Generated and secure
- [ ] `ENCRYPTION_KEY` - 64 hex characters
- [ ] `STRIPE_*` - All Stripe keys
- [ ] `TWILIO_*` - All Twilio credentials
- [ ] `UPSTASH_*` - Redis for rate limiting
- [ ] `SENTRY_DSN` - Error tracking
- [ ] `OPENAI_API_KEY` - AI features
