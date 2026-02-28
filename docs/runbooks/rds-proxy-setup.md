# RDS Proxy Setup Runbook

## Prerequisites

- AWS account with access to the `us-east-2` region
- Existing RDS instance: `eonpro-db` (db.t4g.xlarge, PostgreSQL)
- AWS Secrets Manager secret with the database credentials (or create one)

## Step 1: Create a Secret in AWS Secrets Manager

If you don't already have one:

1. Go to **AWS Secrets Manager** > **Store a new secret**
2. Secret type: **Credentials for Amazon RDS database**
3. Enter your DB username (`postgres`) and password
4. Select your RDS instance (`eonpro-db`)
5. Name the secret: `eonpro-db/credentials`
6. Complete the wizard

## Step 2: Create an IAM Role for RDS Proxy

1. Go to **IAM** > **Roles** > **Create role**
2. Trusted entity: **AWS service** > **RDS**
3. Use case: **RDS - Add Role to Database**
4. Attach policy: `SecretsManagerReadWrite` (or create a scoped-down policy)
5. Name: `eonpro-rds-proxy-role`

Alternatively, RDS Proxy will create the role automatically during proxy creation.

## Step 3: Create the RDS Proxy

1. Go to **RDS** > **Proxies** > **Create proxy**
2. Configuration:
   - **Proxy identifier**: `eonpro-proxy`
   - **Engine family**: PostgreSQL
   - **Require TLS**: Yes
   - **Idle client connection timeout**: 1800 seconds (30 min)
3. Target group:
   - **Database**: Select `eonpro-db`
   - **Connection pool maximum connections**: 100 (or 50% of max_connections)
   - **Connection borrow timeout**: 120 seconds
4. Authentication:
   - **Secrets**: Select `eonpro-db/credentials`
   - **IAM authentication**: Optional (recommended for production)
5. Connectivity:
   - **VPC**: Same VPC as `eonpro-db`
   - **Subnets**: Same subnets as `eonpro-db`
   - **Security groups**: Same security group as `eonpro-db` (must allow port 5432 inbound)
6. Click **Create proxy**

Wait 5-10 minutes for the proxy to become `Available`.

## Step 4: Get the Proxy Endpoint

1. Go to **RDS** > **Proxies** > **eonpro-proxy**
2. Copy the **Proxy endpoint** (e.g., `eonpro-proxy.proxy-cx8o24ooodj4.us-east-2.rds.amazonaws.com`)

## Step 5: Update Vercel Environment Variables

In Vercel project settings > Environment Variables:

```
DATABASE_URL=postgresql://postgres:<password>@eonpro-proxy.proxy-cx8o24ooodj4.us-east-2.rds.amazonaws.com:5432/postgres?sslmode=require
USE_RDS_PROXY=true
DATABASE_CONNECTION_LIMIT=25
```

Key changes:
- `DATABASE_URL` now points to the proxy endpoint (not directly to RDS)
- `DATABASE_CONNECTION_LIMIT=25` — proxy handles pooling, so each serverless instance can safely use more connections
- `USE_RDS_PROXY=true` — already set, tells `serverless-pool.ts` to use proxy-optimized settings

## Step 6: Verify

1. Deploy the updated env vars (redeploy the app)
2. Check `/api/health` — should return healthy
3. Check `/api/health?full=true` (super_admin) — verify database connectivity
4. Monitor CloudWatch metrics for the proxy:
   - `DatabaseConnections` — should stay below max_connections
   - `QueryRequests` — should show traffic flowing
   - `ClientConnections` — shows active Vercel connections to the proxy

## Step 7: Create Read Replica (Optional, for Phase 4B)

1. Go to **RDS** > **Databases** > **eonpro-db** > **Actions** > **Create read replica**
2. Configuration:
   - **DB instance identifier**: `eonpro-db-read`
   - **Instance class**: `db.t4g.large` (can be smaller than primary)
   - **Multi-AZ**: No (read replicas don't need Multi-AZ)
   - **Storage**: Auto (inherits from primary)
3. Wait for the replica to become `Available`
4. Add the replica to the RDS Proxy target group:
   - Go to **RDS** > **Proxies** > **eonpro-proxy** > **Target groups**
   - **Add target** > Select `eonpro-db-read` as a **reader** target
5. Create a reader endpoint on the proxy (or use the replica endpoint directly)
6. Add to Vercel:

```
DATABASE_READ_REPLICA_URL=postgresql://postgres:<password>@eonpro-db-read.cx8o24ooodj4.us-east-2.rds.amazonaws.com:5432/postgres?sslmode=require
```

## Rollback

If issues arise after switching to the proxy:

1. Revert `DATABASE_URL` in Vercel to the direct RDS endpoint
2. Set `USE_RDS_PROXY=false`
3. Set `DATABASE_CONNECTION_LIMIT=1`
4. Redeploy

The proxy can remain running — it doesn't affect the direct connection.

## Cost

- RDS Proxy: ~$0.015/vCPU/hour (based on the underlying DB instance)
- For db.t4g.xlarge (4 vCPUs): ~$0.06/hour = ~$43/month
- Read replica: Same as primary instance cost (db.t4g.large: ~$120/month)
