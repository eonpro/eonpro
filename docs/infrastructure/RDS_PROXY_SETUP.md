# AWS RDS Proxy Setup Guide

## Overview

This guide walks through setting up AWS RDS Proxy for the EonPro healthcare platform to solve
connection pooling issues in serverless (Vercel) environments.

## Why RDS Proxy?

| Problem                                          | Solution                               |
| ------------------------------------------------ | -------------------------------------- |
| Serverless functions create too many connections | RDS Proxy pools and reuses connections |
| Connections exhaust RDS limits (79 max)          | Proxy manages connection multiplexing  |
| Cold starts create connection spikes             | Proxy maintains warm connection pool   |
| Database credentials in app code                 | IAM authentication available           |

## Prerequisites

- AWS CLI configured with appropriate permissions
- Existing RDS instance (`eonpro-db`)
- VPC with private subnets
- AWS Secrets Manager secret for database credentials

---

## Step 1: Create Secrets Manager Secret

RDS Proxy requires credentials stored in AWS Secrets Manager.

```bash
# Create secret for database credentials
aws secretsmanager create-secret \
  --name "eonpro-db-credentials" \
  --description "EonPro RDS PostgreSQL credentials" \
  --secret-string '{
    "username": "postgres",
    "password": "YOUR_DATABASE_PASSWORD",
    "engine": "postgres",
    "host": "eonpro-db.cx8o24ooodj4.us-east-2.rds.amazonaws.com",
    "port": 5432,
    "dbname": "postgres"
  }' \
  --region us-east-2
```

**Note:** Replace `YOUR_DATABASE_PASSWORD` with the actual password.

---

## Step 2: Create IAM Role for RDS Proxy

```bash
# Create trust policy file
cat > rds-proxy-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "rds.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create the IAM role
aws iam create-role \
  --role-name "eonpro-rds-proxy-role" \
  --assume-role-policy-document file://rds-proxy-trust-policy.json \
  --description "Role for EonPro RDS Proxy to access Secrets Manager"

# Create policy for Secrets Manager access
cat > rds-proxy-secrets-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-2:*:secret:eonpro-db-credentials*"
    }
  ]
}
EOF

# Attach the policy
aws iam put-role-policy \
  --role-name "eonpro-rds-proxy-role" \
  --policy-name "SecretsManagerAccess" \
  --policy-document file://rds-proxy-secrets-policy.json

# Clean up temp files
rm rds-proxy-trust-policy.json rds-proxy-secrets-policy.json
```

---

## Step 3: Get VPC and Security Group Information

```bash
# Get the RDS instance's VPC Security Group and Subnets
aws rds describe-db-instances \
  --db-instance-identifier eonpro-db \
  --query 'DBInstances[0].{VpcSecurityGroups:VpcSecurityGroups[*].VpcSecurityGroupId, Subnets:DBSubnetGroup.Subnets[*].SubnetIdentifier}' \
  --output json

# Note the security group ID and subnet IDs for the next step
```

---

## Step 4: Create the RDS Proxy

```bash
# Replace these with your actual values from Step 3
VPC_SECURITY_GROUP="sg-xxxxxxxxx"
SUBNET_1="subnet-xxxxxxxxx"
SUBNET_2="subnet-xxxxxxxxx"
ROLE_ARN="arn:aws:iam::YOUR_ACCOUNT_ID:role/eonpro-rds-proxy-role"
SECRET_ARN="arn:aws:secretsmanager:us-east-2:YOUR_ACCOUNT_ID:secret:eonpro-db-credentials-xxxxx"

# Create the RDS Proxy
aws rds create-db-proxy \
  --db-proxy-name "eonpro-proxy" \
  --engine-family POSTGRESQL \
  --auth '[{
    "AuthScheme": "SECRETS",
    "SecretArn": "'$SECRET_ARN'",
    "IAMAuth": "DISABLED"
  }]' \
  --role-arn "$ROLE_ARN" \
  --vpc-subnet-ids "$SUBNET_1" "$SUBNET_2" \
  --vpc-security-group-ids "$VPC_SECURITY_GROUP" \
  --require-tls \
  --idle-client-timeout 1800 \
  --debug-logging \
  --region us-east-2
```

---

## Step 5: Create Target Group and Register RDS Instance

```bash
# Create target group
aws rds register-db-proxy-targets \
  --db-proxy-name "eonpro-proxy" \
  --target-group-name "default" \
  --db-instance-identifiers "eonpro-db" \
  --region us-east-2
```

---

## Step 6: Wait for Proxy to Become Available

```bash
# Check proxy status (wait until Status is "available")
aws rds describe-db-proxies \
  --db-proxy-name "eonpro-proxy" \
  --query 'DBProxies[0].{Status:Status, Endpoint:Endpoint}' \
  --region us-east-2

# This may take 5-10 minutes
```

---

## Step 7: Get the Proxy Endpoint

```bash
# Get the proxy endpoint URL
aws rds describe-db-proxies \
  --db-proxy-name "eonpro-proxy" \
  --query 'DBProxies[0].Endpoint' \
  --output text \
  --region us-east-2

# Output will look like:
# eonpro-proxy.proxy-cx8o24ooodj4.us-east-2.rds.amazonaws.com
```

---

## Step 8: Update Application Configuration

### Update Vercel Environment Variables

```bash
# In Vercel Dashboard or CLI:
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@eonpro-proxy.proxy-cx8o24ooodj4.us-east-2.rds.amazonaws.com:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=15"
USE_RDS_PROXY="true"
```

### Connection String Format

```
postgresql://username:password@PROXY_ENDPOINT:5432/database?sslmode=require&connection_limit=1&pool_timeout=15
```

> `connection_limit=1` keeps each Vercel function instance to one DB connection. The app injects these params if omitted.

---

## Step 9: Configure Proxy Settings (Optional Tuning)

```bash
# Modify proxy settings for optimal performance
aws rds modify-db-proxy \
  --db-proxy-name "eonpro-proxy" \
  --idle-client-timeout 1800 \
  --region us-east-2

# Modify target group for connection pooling
aws rds modify-db-proxy-target-group \
  --db-proxy-name "eonpro-proxy" \
  --target-group-name "default" \
  --connection-pool-config '{
    "MaxConnectionsPercent": 100,
    "MaxIdleConnectionsPercent": 50,
    "ConnectionBorrowTimeout": 120
  }' \
  --region us-east-2
```

---

## Monitoring & Verification

### Check Proxy Connections

```bash
# View proxy target health
aws rds describe-db-proxy-targets \
  --db-proxy-name "eonpro-proxy" \
  --region us-east-2
```

### CloudWatch Metrics

Monitor these metrics in CloudWatch:

- `DatabaseConnections` - Active connections to RDS
- `ClientConnections` - Client connections to proxy
- `QueryRequests` - Queries processed
- `QueryDatabaseResponseLatency` - Query latency

```bash
# Get connection metrics
aws cloudwatch get-metric-statistics \
  --namespace "AWS/RDS" \
  --metric-name "DatabaseConnections" \
  --dimensions Name=DBProxyName,Value=eonpro-proxy \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 \
  --statistics Average \
  --region us-east-2
```

---

## Rollback Plan

If issues arise, revert to direct RDS connection:

```bash
# In Vercel:
DATABASE_URL="postgresql://postgres:PASSWORD@eonpro-db.cx8o24ooodj4.us-east-2.rds.amazonaws.com:5432/postgres?sslmode=require"
USE_RDS_PROXY="false"
```

---

## Cost Estimate

RDS Proxy pricing (us-east-2):

- **vCPU hours**: $0.015 per vCPU per hour
- For a db.t3.micro equivalent: ~$10-15/month

This is minimal compared to the cost of connection-related downtime.

---

## Security Considerations

1. **TLS Required**: Proxy enforces TLS connections
2. **IAM Auth Option**: Can enable IAM authentication for additional security
3. **Secrets Rotation**: Secrets Manager supports automatic rotation
4. **VPC Isolation**: Proxy runs in your VPC, not publicly accessible

---

## Troubleshooting

### Connection Timeout

```bash
# Check target group health
aws rds describe-db-proxy-targets \
  --db-proxy-name "eonpro-proxy" \
  --query 'Targets[*].{State:TargetHealth.State, Description:TargetHealth.Description}'
```

### Authentication Failures

```bash
# Verify secret format
aws secretsmanager get-secret-value \
  --secret-id "eonpro-db-credentials" \
  --query 'SecretString' \
  --output text | jq .
```

### Proxy Not Available

```bash
# Check proxy status and events
aws rds describe-db-proxies \
  --db-proxy-name "eonpro-proxy" \
  --query 'DBProxies[0].{Status:Status, DebugLogging:DebugLogging}'
```

---

## Quick Reference

| Item         | Value          |
| ------------ | -------------- |
| Proxy Name   | `eonpro-proxy` |
| Region       | `us-east-2`    |
| Engine       | PostgreSQL     |
| Port         | 5432           |
| Idle Timeout | 1800 seconds   |
| TLS          | Required       |

---

## Next Steps After Setup

1. Deploy application with new `DATABASE_URL`
2. Monitor CloudWatch metrics for 24-48 hours
3. Verify connection pool utilization via `/api/health?full=true`
4. Consider enabling IAM authentication for additional security
5. Set up CloudWatch alarms for connection thresholds
