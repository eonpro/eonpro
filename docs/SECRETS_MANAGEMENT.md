# Secrets Management Guide

**Document Version:** 1.0  
**Last Updated:** January 21, 2026  
**Classification:** INTERNAL - DevOps Team  

---

## 1. Overview

This document outlines the secrets management strategy for the EONPRO Telehealth Platform. It covers local development, staging, and production environments.

### Security Principles

1. **No secrets in code** - Never commit secrets to version control
2. **Least privilege** - Applications only access secrets they need
3. **Rotation support** - All secrets must be rotatable without downtime
4. **Audit trail** - All secret access is logged

---

## 2. Secret Classification

| Classification | Examples | Storage | Rotation |
|---------------|----------|---------|----------|
| **Critical** | ENCRYPTION_KEY, JWT_SECRET | AWS KMS | Annual + incident |
| **High** | DATABASE_URL, API keys | AWS Secrets Manager | Quarterly |
| **Medium** | SMTP credentials | Secrets Manager | Semi-annual |
| **Low** | Feature flags | Environment variables | As needed |

---

## 3. Development Environment

### 3.1 Local Development Setup

Create a `.env.local` file (gitignored):

```bash
# Copy from template
cp env.example .env.local

# Generate secure values for development
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env.local
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env.local
```

### 3.2 Required Secrets

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/eonpro_dev

# Authentication (generate with openssl rand -hex 32)
JWT_SECRET=your-64-char-hex-string-here
ENCRYPTION_KEY=your-64-char-hex-string-here

# External Services (use test/sandbox keys)
STRIPE_SECRET_KEY=sk_test_...
TWILIO_AUTH_TOKEN=test-token
LIFEFILE_API_KEY=sandbox-key
```

### 3.3 Validation

Run the secrets validation script:

```bash
npm run validate:secrets
```

---

## 4. Staging Environment

### 4.1 Vercel Configuration

Secrets are stored in Vercel Environment Variables:

1. Go to Project Settings > Environment Variables
2. Add each secret for the "Preview" environment
3. Mark sensitive values as "Secret" (hidden in UI)

### 4.2 Required Secrets

Same as production but with staging service credentials.

---

## 5. Production Environment

### 5.1 AWS Secrets Manager (Recommended)

Production secrets are stored in AWS Secrets Manager for:
- Automatic rotation
- Fine-grained IAM access control
- Audit logging via CloudTrail
- Cross-region replication

#### Setup

```bash
# Create secret
aws secretsmanager create-secret \
  --name eonpro/prod/database \
  --secret-string '{"url":"postgresql://..."}' \
  --region us-east-1

# Enable rotation (example for RDS)
aws secretsmanager rotate-secret \
  --secret-id eonpro/prod/database \
  --rotation-lambda-arn arn:aws:lambda:...
```

#### Application Integration

```typescript
// src/lib/secrets/aws-secrets.ts
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: process.env.AWS_REGION });

export async function getSecret(secretId: string): Promise<string> {
  const command = new GetSecretValueCommand({ SecretId: secretId });
  const response = await client.send(command);
  return response.SecretString || '';
}
```

### 5.2 Kubernetes External Secrets (Alternative)

For Kubernetes deployments, use External Secrets Operator:

```yaml
# infrastructure/kubernetes/external-secrets.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: eonpro-secrets
  namespace: eonpro
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: eonpro-app-secrets
    creationPolicy: Owner
  data:
    - secretKey: DATABASE_URL
      remoteRef:
        key: eonpro/prod/database
        property: url
    - secretKey: JWT_SECRET
      remoteRef:
        key: eonpro/prod/auth
        property: jwt_secret
    - secretKey: ENCRYPTION_KEY
      remoteRef:
        key: eonpro/prod/encryption
        property: key
```

### 5.3 Vercel Production

For Vercel deployments:

1. Use Vercel CLI to add secrets:
```bash
vercel secrets add jwt-secret $(openssl rand -hex 32)
vercel env add JWT_SECRET production < <(vercel secrets ls | grep jwt-secret)
```

2. Or use Vercel Integration with AWS Secrets Manager

---

## 6. Secret Rotation

### 6.1 Rotation Schedule

| Secret | Frequency | Method |
|--------|-----------|--------|
| JWT_SECRET | Annual | Blue-green with overlap |
| ENCRYPTION_KEY | On-incident | Re-encrypt all PHI |
| DATABASE_URL | Quarterly | RDS automatic rotation |
| API Keys | Quarterly | Regenerate in service |

### 6.2 JWT Secret Rotation

To rotate JWT_SECRET without invalidating all sessions:

1. Add new secret as `JWT_SECRET_NEW`
2. Update code to accept both secrets (overlap period)
3. Deploy with overlap support
4. After 24h, move `JWT_SECRET_NEW` to `JWT_SECRET`
5. Remove old secret support

```typescript
// Support multiple JWT secrets during rotation
const JWT_SECRETS = [
  process.env.JWT_SECRET,
  process.env.JWT_SECRET_OLD, // Remove after rotation
].filter(Boolean);

function verifyToken(token: string) {
  for (const secret of JWT_SECRETS) {
    try {
      return jwt.verify(token, secret);
    } catch {
      continue;
    }
  }
  throw new Error('Invalid token');
}
```

### 6.3 Encryption Key Rotation

⚠️ **CRITICAL**: Encryption key rotation requires re-encrypting all PHI data.

1. Generate new key in KMS
2. Run migration script to re-encrypt data
3. Update application to use new key
4. Verify all data accessible
5. Archive old key (do not delete - needed for audit)

```bash
# Generate new key
aws kms create-key --description "PHI Encryption Key v2"

# Run re-encryption migration
DATABASE_URL=... OLD_KEY=... NEW_KEY=... npm run migrate:reencrypt-phi
```

---

## 7. Incident Response

### 7.1 Suspected Secret Compromise

1. **Immediately rotate** the compromised secret
2. **Audit access logs** for unauthorized use
3. **Notify security team** and document incident
4. **Update dependent services** with new credentials
5. **Review access patterns** to prevent recurrence

### 7.2 Emergency Contacts

| Role | Contact |
|------|---------|
| Security Lead | [PHONE] |
| DevOps On-Call | [PHONE] |
| AWS Support | [ACCOUNT #] |

---

## 8. Compliance

### 8.1 HIPAA Requirements

- §164.312(a)(2)(iv): Encryption of PHI
- §164.312(d): Authentication controls
- §164.312(b): Audit controls for key access

### 8.2 SOC2 Requirements

- CC6.1: Logical access controls
- CC6.6: Encryption key management
- CC6.7: Protection of secrets

---

## 9. Validation Checklist

Before deployment, verify:

- [ ] No secrets in source code
- [ ] All secrets in appropriate secret store
- [ ] Secrets have appropriate access controls
- [ ] Rotation schedule documented
- [ ] Emergency rotation procedure tested
- [ ] Audit logging enabled

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-21 | DevOps | Initial document |
