# AWS Aurora Connection Setup

## 1. Get Your Endpoint (After Creation)

Go to RDS Console → Clusters → eonpro-production → Connectivity & Security

You'll see:
- **Writer endpoint**: `eonpro-production.cluster-xxxxx.us-east-1.rds.amazonaws.com`
- **Reader endpoint**: `eonpro-production.cluster-ro-xxxxx.us-east-1.rds.amazonaws.com`

## 2. Security Group Configuration

### If "Public Access = No" (Recommended):

**Option A: Bastion Host**
```bash
# Create EC2 t2.micro bastion in same VPC
# SSH to bastion, then connect to Aurora
ssh -i your-key.pem ec2-user@bastion-ip
psql -h eonpro-production.cluster-xxxxx.rds.amazonaws.com -U postgres
```

**Option B: VPC Peering with Vercel** (Advanced)
- Contact Vercel Enterprise support

**Option C: Temporary Public Access** (For Setup Only)
1. Modify cluster → Enable public access
2. Add your IP to security group
3. Connect directly
4. Disable public access after setup

### Security Group Rules

Add these inbound rules to your Aurora security group:

| Type | Protocol | Port | Source | Description |
|------|----------|------|--------|-------------|
| PostgreSQL | TCP | 5432 | Your IP/32 | Admin access |
| PostgreSQL | TCP | 5432 | Vercel IPs | App access |
| PostgreSQL | TCP | 5432 | sg-bastion | Bastion access |

## 3. Connection Strings

### For Development (Local Testing)
```env
DATABASE_URL="postgresql://eonpro_app:password@eonpro-production.cluster-xxxxx.rds.amazonaws.com:5432/eonpro_db?schema=eonpro&sslmode=require"
```

### For Production (Vercel)
```env
DATABASE_URL="postgresql://eonpro_app:password@eonpro-production.cluster-xxxxx.rds.amazonaws.com:5432/eonpro_db?schema=eonpro&sslmode=require&pool_timeout=60&connection_limit=20"
```

### With AWS Secrets Manager (Recommended)
```javascript
// In your code
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({ region: "us-east-1" });
const response = await client.send(
  new GetSecretValueCommand({ SecretId: "eonpro/aurora/credentials" })
);
const secret = JSON.parse(response.SecretString);
const DATABASE_URL = `postgresql://${secret.username}:${secret.password}@${secret.host}:${secret.port}/${secret.dbname}`;
```

## 4. Test Connection

### From Command Line
```bash
# Test with psql
psql "postgresql://postgres@eonpro-production.cluster-xxxxx.rds.amazonaws.com:5432/postgres?sslmode=require"

# Test with Prisma
export DATABASE_URL="your-connection-string"
npx prisma db pull  # Tests connection and shows schema
```

### From Application
```bash
# Run migrations
npx prisma migrate deploy

# Seed initial data
npx prisma db seed
```

## 5. Vercel Environment Variables

In Vercel Dashboard → Settings → Environment Variables:

```env
# Database (Aurora)
DATABASE_URL=postgresql://eonpro_app:xxx@eonpro-production.cluster-xxx.rds.amazonaws.com:5432/eonpro_db?schema=eonpro&sslmode=require

# If using Secrets Manager
AWS_REGION=us-east-1
AWS_SECRET_NAME=eonpro/aurora/credentials
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

## 6. Connection Pooling (Important!)

Aurora has connection limits. Use PgBouncer or Prisma's connection pooling:

```javascript
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // Connection pool settings
  connectionLimit = 20
  pool_timeout = 60
}
```

## 7. Monitoring Connections

```sql
-- Check current connections
SELECT count(*) FROM pg_stat_activity;

-- See connection details
SELECT datname, usename, application_name, client_addr, state 
FROM pg_stat_activity 
WHERE datname = 'eonpro_db';

-- Kill idle connections
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = 'eonpro_db' 
  AND state = 'idle' 
  AND state_change < current_timestamp - INTERVAL '10 minutes';
```

## Troubleshooting

### "Connection timed out"
- Check security group rules
- Verify public/private access settings
- Confirm VPC and subnet configuration

### "Password authentication failed"
- Reset password in AWS Secrets Manager
- Verify username is correct
- Check database exists

### "Too many connections"
- Increase max_connections in parameter group
- Implement connection pooling
- Check for connection leaks

### "SSL connection required"
- Always use `sslmode=require` in connection string
- Verify RDS certificate is valid
