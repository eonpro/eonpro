# AWS Infrastructure Setup for EONPRO

## 1. RDS PostgreSQL Setup

### Create Database

1. AWS Console → RDS → Create Database
2. PostgreSQL 15.4, Production Template
3. Instance: db.t3.small (upgradeable)
4. Storage: 20GB GP3 SSD with autoscaling
5. Enable encryption (required for HIPAA)
6. Enable automated backups (7 days)

### Security Configuration

```sql
-- After database creation, run these:
CREATE SCHEMA IF NOT EXISTS eonpro;
CREATE USER eonpro_app WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON SCHEMA eonpro TO eonpro_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA eonpro TO eonpro_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA eonpro GRANT ALL ON TABLES TO eonpro_app;
```

### Connection String Format

```env
DATABASE_URL="postgresql://eonpro_app:password@your-instance.region.rds.amazonaws.com:5432/eonpro?schema=eonpro&sslmode=require"
```

## 2. S3 for File Storage (PHI Documents)

### Create S3 Bucket

```bash
aws s3 mb s3://eonpro-phi-storage --region us-east-1
```

### Enable Encryption

```bash
aws s3api put-bucket-encryption \
  --bucket eonpro-phi-storage \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'
```

### Bucket Policy for HIPAA

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RequireSecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::eonpro-phi-storage/*", "arn:aws:s3:::eonpro-phi-storage"],
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    }
  ]
}
```

## 3. ElastiCache Redis (Session Management)

### Create Redis Cluster

```yaml
Cluster Mode: Disabled
Node Type: cache.t3.micro
Number of Replicas: 1 (for HA)
Multi-AZ: Enabled
Encryption at Rest: Enabled
Encryption in Transit: Enabled
Auth Token: Generate secure token
```

### Connection String

```env
REDIS_URL="rediss://default:auth_token@your-cluster.cache.amazonaws.com:6379"
```

## 4. CloudFront CDN

### Create Distribution

```yaml
Origin: Your Vercel deployment
Viewer Protocol: Redirect HTTP to HTTPS
Allowed Methods: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE
Cache Behaviors:
  - /api/*: No cache
  - /_next/static/*: Cache 1 year
  - /*: Cache 1 hour
Compress: Yes
Price Class: Use All Edge Locations
```

## 5. AWS Secrets Manager

Store sensitive configuration:

```bash
aws secretsmanager create-secret \
  --name eonpro/production \
  --secret-string '{
    "ENCRYPTION_KEY":"your-key",
    "JWT_SECRET":"your-secret",
    "DATABASE_URL":"your-db-url"
  }'
```

## 6. IAM Roles and Policies

### Application Role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "rds:Describe*",
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "secretsmanager:GetSecretValue",
        "kms:Decrypt"
      ],
      "Resource": "*"
    }
  ]
}
```

## 7. Environment Variables for Vercel

```env
# Database
DATABASE_URL=postgresql://user:pass@xxx.rds.amazonaws.com/eonpro

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=eonpro-phi-storage

# Redis
REDIS_URL=rediss://...

# Security (from Secrets Manager)
ENCRYPTION_KEY=4699d057a5cd6cb4f0e13fbf9202bd65ff5adefb1bd7276bd0c1d5fae4eb3887
JWT_SECRET=UK4YNzllUae4+t388TBJBpjJdizalOT7nXuPXMa6gCc=
```

## 8. Estimated Monthly Costs

| Service         | Configuration     | Monthly Cost      |
| --------------- | ----------------- | ----------------- |
| RDS PostgreSQL  | db.t3.small, 20GB | $25-35            |
| S3 Storage      | 100GB PHI docs    | $2-5              |
| ElastiCache     | cache.t3.micro    | $15-20            |
| CloudFront      | 100GB transfer    | $8-12             |
| Secrets Manager | 5 secrets         | $2                |
| **Total**       |                   | **~$52-74/month** |

## 9. HIPAA Compliance Checklist

- [x] Sign AWS Business Associate Agreement (BAA)
- [x] Enable encryption at rest (RDS, S3, ElastiCache)
- [x] Enable encryption in transit (SSL/TLS)
- [x] Configure automated backups
- [x] Enable CloudTrail audit logging
- [x] Set up CloudWatch monitoring
- [x] Configure VPC security groups
- [x] Implement IAM access controls
- [x] Enable MFA for AWS root account

## 10. Quick Setup Script

```bash
#!/bin/bash

# Set region
export AWS_REGION=us-east-1

# Create RDS instance
aws rds create-db-instance \
  --db-instance-identifier eonpro-production \
  --db-instance-class db.t3.small \
  --engine postgres \
  --engine-version 15.4 \
  --master-username eonpro_admin \
  --master-user-password $DB_PASSWORD \
  --allocated-storage 20 \
  --storage-encrypted \
  --backup-retention-period 7 \
  --multi-az \
  --no-publicly-accessible

# Create S3 bucket
aws s3 mb s3://eonpro-phi-storage
aws s3api put-bucket-encryption --bucket eonpro-phi-storage \
  --server-side-encryption-configuration file://encryption.json

# Output connection details
echo "Database Endpoint: $(aws rds describe-db-instances \
  --db-instance-identifier eonpro-production \
  --query 'DBInstances[0].Endpoint.Address' --output text)"
```

## Support

For AWS support: https://console.aws.amazon.com/support For HIPAA compliance:
https://aws.amazon.com/compliance/hipaa-compliance/
