# Disaster Recovery Procedures

**Document Version:** 1.0  
**Last Updated:** January 21, 2026  
**Classification:** INTERNAL - Operations Team

---

## 1. Overview

This document outlines the disaster recovery (DR) procedures for the EONPRO Telehealth Platform. It
covers backup strategies, recovery procedures, and business continuity plans.

### Recovery Objectives

| Metric                             | Target  | Notes                          |
| ---------------------------------- | ------- | ------------------------------ |
| **RTO** (Recovery Time Objective)  | 4 hours | Maximum acceptable downtime    |
| **RPO** (Recovery Point Objective) | 1 hour  | Maximum acceptable data loss   |
| **MTTR** (Mean Time To Recovery)   | 2 hours | Expected average recovery time |

---

## 2. Database Backups

### 2.1 PostgreSQL Database

**Backup Strategy:**

- **Provider:** [AWS RDS / Vercel Postgres / Supabase - specify in deployment]
- **Frequency:** Continuous WAL archiving + Daily full snapshots
- **Retention:**
  - Daily snapshots: 7 days
  - Weekly snapshots: 4 weeks
  - Monthly snapshots: 12 months
- **Point-in-time Recovery:** Up to 7 days

**Backup Verification:**

```
Last verified restore: [DATE - update quarterly]
Next scheduled test: [DATE]
Verification result: [PASS/FAIL]
```

### 2.2 Automated Backup Schedule

| Time (UTC)   | Type            | Retention |
| ------------ | --------------- | --------- |
| Continuous   | WAL Archive     | 7 days    |
| 02:00        | Full Snapshot   | 7 days    |
| Sunday 03:00 | Weekly Archive  | 4 weeks   |
| 1st of Month | Monthly Archive | 12 months |

### 2.3 Database Restore Procedure

**Prerequisites:**

- AWS/Cloud console access
- Database administrator credentials
- Application deployment access

**Steps:**

1. **Assess the Situation**

   ```bash
   # Check current database status
   psql $DATABASE_URL -c "SELECT 1;"

   # Review recent errors
   # Check cloud provider console for database health
   ```

2. **Initiate Recovery**

   ```bash
   # Option A: Point-in-time recovery (data corruption)
   # Use cloud provider console to restore to specific timestamp

   # Option B: Snapshot restore (complete failure)
   # Create new instance from snapshot
   ```

3. **Restore from Snapshot**
   - Access cloud provider console
   - Navigate to Database > Backups
   - Select appropriate snapshot (closest to incident without corruption)
   - Initiate restore to new instance
   - Estimated time: 15-60 minutes depending on size

4. **Update Application Configuration**

   ```bash
   # Update DATABASE_URL in environment/secrets
   # For Kubernetes:
   kubectl edit secret eonpro-secrets -n eonpro

   # For Vercel:
   vercel env rm DATABASE_URL production
   vercel env add DATABASE_URL production
   ```

5. **Verify Data Integrity**

   ```sql
   -- Check record counts
   SELECT 'patients' as table_name, COUNT(*) FROM "Patient"
   UNION ALL SELECT 'users', COUNT(*) FROM "User"
   UNION ALL SELECT 'orders', COUNT(*) FROM "Order";

   -- Check latest records (ensure recent data present)
   SELECT MAX("createdAt") as latest FROM "Patient";
   SELECT MAX("createdAt") as latest FROM "Order";
   ```

6. **Switch Traffic**
   - Update DNS/Load balancer if needed
   - Restart application pods
   - Monitor for errors

---

## 3. Redis Cache Recovery

### 3.1 Cache Strategy

Redis is used for:

- Session storage
- Rate limiting
- Query caching
- Job queues

**Important:** Redis data is ephemeral by design. Loss results in:

- Cold cache (temporary performance impact)
- Session invalidation (users must re-login)
- Rate limit reset

### 3.2 Recovery Procedure

**No action required for data recovery.** Cache rebuilds automatically.

**If Redis instance fails:**

1. The application gracefully degrades to LRU in-memory cache
2. Provision new Redis instance
3. Update `REDIS_URL` environment variable
4. Restart application pods
5. Cache repopulates on demand

---

## 4. File Storage (S3)

### 4.1 Current Configuration

- **Versioning:** Enabled (allows recovery of deleted/overwritten files)
- **Cross-Region Replication:** [Yes/No - specify in deployment]
- **Lifecycle Policy:**
  - Current: Indefinite retention
  - Archive to Glacier: After 90 days (optional)

### 4.2 File Recovery Procedure

**Recover Deleted File:**

```bash
# List deleted objects
aws s3api list-object-versions \
  --bucket $S3_BUCKET \
  --prefix "path/to/file" \
  --query 'DeleteMarkers[]'

# Restore by removing delete marker
aws s3api delete-object \
  --bucket $S3_BUCKET \
  --key "path/to/file" \
  --version-id "DELETE_MARKER_VERSION_ID"
```

**Recover Previous Version:**

```bash
# List versions
aws s3api list-object-versions \
  --bucket $S3_BUCKET \
  --prefix "path/to/file"

# Copy specific version to restore
aws s3api copy-object \
  --bucket $S3_BUCKET \
  --copy-source "$S3_BUCKET/path/to/file?versionId=VERSION_ID" \
  --key "path/to/file"
```

---

## 5. Secrets Recovery

### 5.1 Critical Secrets

| Secret              | Storage             | Backup Location  |
| ------------------- | ------------------- | ---------------- |
| `JWT_SECRET`        | K8s Secret / Vercel | Password Manager |
| `ENCRYPTION_KEY`    | K8s Secret / Vercel | Password Manager |
| `DATABASE_URL`      | K8s Secret / Vercel | Password Manager |
| `STRIPE_SECRET_KEY` | K8s Secret / Vercel | Stripe Dashboard |
| `TWILIO_AUTH_TOKEN` | K8s Secret / Vercel | Twilio Console   |

### 5.2 Secret Recovery

**If secrets are lost:**

1. Access secure password manager (1Password/Vault)
2. Retrieve backed-up values
3. Re-apply to environment

**If ENCRYPTION_KEY is lost:** ⚠️ **CRITICAL:** Loss of encryption key means PHI data cannot be
decrypted.

- Always maintain backup of ENCRYPTION_KEY
- Consider AWS KMS for key management with built-in durability

---

## 6. Application Recovery

### 6.1 Kubernetes Deployment

**Full Application Restore:**

```bash
# Apply all manifests
kubectl apply -f infrastructure/kubernetes/

# Verify deployment
kubectl get pods -n eonpro
kubectl get svc -n eonpro

# Check logs
kubectl logs -n eonpro -l app=eonpro --tail=100
```

**Rollback to Previous Version:**

```bash
# List rollout history
kubectl rollout history deployment/eonpro-app -n eonpro

# Rollback to previous
kubectl rollout undo deployment/eonpro-app -n eonpro

# Rollback to specific revision
kubectl rollout undo deployment/eonpro-app -n eonpro --to-revision=3
```

### 6.2 Vercel Deployment

**Rollback:**

1. Access Vercel Dashboard
2. Navigate to Deployments
3. Find last known good deployment
4. Click "..." → "Promote to Production"

---

## 7. Incident Response

### 7.1 Severity Levels

| Level | Definition       | Response Time | Examples                        |
| ----- | ---------------- | ------------- | ------------------------------- |
| P1    | Production down  | 15 minutes    | Database unavailable, App crash |
| P2    | Feature degraded | 1 hour        | Payment failures, Slow queries  |
| P3    | Minor issue      | 4 hours       | UI bugs, Non-critical errors    |
| P4    | Improvement      | Next sprint   | Performance optimization        |

### 7.2 Escalation Path

1. **On-Call Engineer** - Initial response
2. **Engineering Lead** - P1/P2 escalation
3. **CTO** - Extended outage (>1 hour)
4. **CEO** - Customer communication needed

### 7.3 Communication Template

```
[INCIDENT] EONPRO - [P1/P2/P3] - [Brief Description]

Status: [Investigating/Identified/Monitoring/Resolved]
Impact: [Describe user impact]
Start Time: [UTC timestamp]
Current Actions: [What is being done]
ETA: [Expected resolution time]
Updates: [Link to status page]
```

---

## 8. Testing Schedule

| Test Type           | Frequency | Last Test | Next Test |
| ------------------- | --------- | --------- | --------- |
| Database Restore    | Quarterly | [DATE]    | [DATE]    |
| Redis Failover      | Quarterly | [DATE]    | [DATE]    |
| Full DR Drill       | Annually  | [DATE]    | [DATE]    |
| Backup Verification | Monthly   | [DATE]    | [DATE]    |

---

## 9. Contact Information

| Role            | Name   | Phone   | Email   |
| --------------- | ------ | ------- | ------- |
| Primary On-Call | [Name] | [Phone] | [Email] |
| Database Admin  | [Name] | [Phone] | [Email] |
| Infrastructure  | [Name] | [Phone] | [Email] |
| Security Lead   | [Name] | [Phone] | [Email] |

---

## 10. Post-Incident Review

After any P1/P2 incident:

1. **Timeline** - Document what happened and when
2. **Root Cause** - Identify underlying cause
3. **Impact** - Quantify user/business impact
4. **Resolution** - Document how it was fixed
5. **Prevention** - Identify improvements to prevent recurrence
6. **Action Items** - Assign owners and deadlines

Template: See `docs/templates/POST_INCIDENT_REVIEW.md`

---

## Revision History

| Version | Date       | Author            | Changes          |
| ------- | ---------- | ----------------- | ---------------- |
| 1.0     | 2026-01-21 | Architecture Team | Initial document |

---

_This document should be reviewed and updated quarterly, or after any significant infrastructure
change._
