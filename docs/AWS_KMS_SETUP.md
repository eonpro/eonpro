# AWS KMS Setup Guide for EONPRO

## Overview

This guide explains how to set up AWS Key Management Service (KMS) for HIPAA-compliant encryption
key management in EONPRO.

## Why Use AWS KMS?

1. **HIPAA Compliance**: AWS KMS is HIPAA-eligible and provides audit trails for all key usage
2. **Key Security**: Master keys never leave AWS hardware security modules (HSMs)
3. **Automatic Rotation**: Enable automatic key rotation without re-encrypting data
4. **Access Control**: Fine-grained IAM policies for key access
5. **Audit Logging**: CloudTrail integration for compliance reporting

---

## Step 1: Create a Customer Managed Key (CMK)

### Using AWS Console

1. Go to AWS Console → KMS → Customer managed keys
2. Click "Create key"
3. Key type: **Symmetric**
4. Key usage: **Encrypt and decrypt**
5. Key alias: `alias/eonpro-phi-key`
6. Description: "EONPRO PHI encryption key for HIPAA compliance"
7. Key administrators: Select your admin IAM users/roles
8. Key users: Select the IAM role/user that will run EONPRO

### Using AWS CLI

```bash
# Create the key
aws kms create-key \
  --description "EONPRO PHI encryption key for HIPAA compliance" \
  --tags TagKey=Application,TagValue=EONPRO TagKey=Environment,TagValue=Production

# Note the KeyId from the output, then create an alias
aws kms create-alias \
  --alias-name alias/eonpro-phi-key \
  --target-key-id YOUR_KEY_ID
```

---

## Step 2: Configure Key Policy

Ensure your KMS key policy allows the necessary operations:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Allow administration of the key",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::YOUR_ACCOUNT:user/admin"
      },
      "Action": [
        "kms:Create*",
        "kms:Describe*",
        "kms:Enable*",
        "kms:List*",
        "kms:Put*",
        "kms:Update*",
        "kms:Revoke*",
        "kms:Disable*",
        "kms:Get*",
        "kms:Delete*",
        "kms:ScheduleKeyDeletion",
        "kms:CancelKeyDeletion"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Allow use of the key for EONPRO",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::YOUR_ACCOUNT:role/eonpro-app-role"
      },
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:GenerateDataKey",
        "kms:GenerateDataKeyWithoutPlaintext",
        "kms:DescribeKey"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## Step 3: Create IAM Policy for EONPRO

Create an IAM policy for the EONPRO application:

```json
{
  "Version": "2012-10-17",
  "PolicyName": "EONPROKMSAccess",
  "PolicyDocument": {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
        "Resource": "arn:aws:kms:us-east-1:YOUR_ACCOUNT:key/YOUR_KEY_ID"
      }
    ]
  }
}
```

---

## Step 4: Generate the PHI Encryption Key

Run the key generation script:

```bash
# Set your AWS credentials
export AWS_REGION=us-east-1
export AWS_KMS_KEY_ID=arn:aws:kms:us-east-1:YOUR_ACCOUNT:key/YOUR_KEY_ID

# Generate the data encryption key
npx tsx scripts/generate-phi-key.ts
```

The script will output:

- `ENCRYPTED_PHI_KEY`: The encrypted data key (safe to store in environment)

---

## Step 5: Configure Environment Variables

Add to your production environment:

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_KMS_KEY_ID=arn:aws:kms:us-east-1:YOUR_ACCOUNT:key/YOUR_KEY_ID

# Encrypted PHI Key (from Step 4)
ENCRYPTED_PHI_KEY=AQIDAHh...base64...==
```

### For Vercel

```bash
vercel env add AWS_KMS_KEY_ID production
vercel env add ENCRYPTED_PHI_KEY production
```

### For AWS (ECS/EKS)

Use AWS Secrets Manager or Parameter Store to store these values, then reference them in your task
definition.

---

## Step 6: Enable Key Rotation (Recommended)

Enable automatic key rotation for the CMK:

```bash
aws kms enable-key-rotation --key-id YOUR_KEY_ID
```

This automatically rotates the backing key annually while maintaining backward compatibility.

---

## Step 7: Enable CloudTrail Logging

Ensure CloudTrail is enabled to log all KMS API calls:

```bash
aws cloudtrail create-trail \
  --name eonpro-audit-trail \
  --s3-bucket-name eonpro-cloudtrail-logs \
  --include-global-service-events
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        EONPRO Application                        │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    phi-encryption.ts                      │   │
│  │                                                           │   │
│  │  1. Request data encryption key                          │   │
│  │  2. KMS decrypts ENCRYPTED_PHI_KEY                       │   │
│  │  3. Use plaintext key for AES-256-GCM encryption        │   │
│  │  4. Key cached in memory (5 min TTL)                     │   │
│  └──────────────────────────────┬───────────────────────────┘   │
│                                 │                                │
└─────────────────────────────────┼────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                         AWS KMS                                  │
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │   CMK (Master)   │    │  Hardware HSM    │                   │
│  │                  │───▶│  (Never leaves)  │                   │
│  │  Auto-rotates    │    │                  │                   │
│  └──────────────────┘    └──────────────────┘                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AWS CloudTrail                              │
│                                                                  │
│  • All KMS API calls logged                                     │
│  • Who accessed which key, when                                 │
│  • Required for HIPAA audit                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Envelope Encryption Flow

1. **Setup (one-time)**:
   - Generate data encryption key (DEK) using KMS `GenerateDataKey`
   - Store the encrypted DEK as `ENCRYPTED_PHI_KEY`

2. **Runtime**:
   - App starts, calls KMS `Decrypt` with `ENCRYPTED_PHI_KEY`
   - KMS returns plaintext DEK
   - DEK cached in memory (5 min TTL)
   - DEK used for AES-256-GCM encryption of PHI

3. **Benefits**:
   - Master key never leaves KMS/HSM
   - DEK rotation doesn't require re-encrypting all data
   - Fast encryption (symmetric key in memory)
   - Audit trail for key access

---

## Troubleshooting

### "AccessDeniedException"

Check:

1. IAM policy attached to user/role
2. KMS key policy allows the IAM principal
3. Correct AWS region configured

### "KMS key not found"

Check:

1. `AWS_KMS_KEY_ID` format (should be ARN or alias)
2. Key exists in the specified region
3. Key is not disabled or pending deletion

### "Encryption key not initialized"

Check:

1. `ENCRYPTED_PHI_KEY` is set in environment
2. AWS credentials are available
3. Network connectivity to AWS KMS

---

## Security Best Practices

1. **Least Privilege**: Only grant necessary KMS permissions
2. **Key Rotation**: Enable automatic rotation
3. **Audit Logs**: Enable CloudTrail and retain for 6+ years
4. **Access Review**: Regularly review who has key access
5. **Multi-Region**: Consider multi-region keys for DR
6. **Backup**: KMS keys can't be exported, but encrypted DEKs can be backed up

---

## Cost Considerations

- **KMS Key**: $1/month per CMK
- **API Calls**: $0.03 per 10,000 requests
- **Caching**: 5-minute TTL minimizes API calls

Estimated monthly cost: ~$5-10 for typical usage

---

## Compliance Checklist

- [ ] CMK created with appropriate alias
- [ ] Key policy restricts access
- [ ] IAM policy follows least privilege
- [ ] Automatic key rotation enabled
- [ ] CloudTrail logging enabled
- [ ] `ENCRYPTED_PHI_KEY` generated and stored securely
- [ ] Application tested with KMS integration
- [ ] Key access reviewed quarterly

---

_Last Updated: December 2025_
