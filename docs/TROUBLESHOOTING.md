# Troubleshooting Guide

Solutions to common issues encountered during development and deployment.

## Table of Contents

- [Development Issues](#development-issues)
- [Database Issues](#database-issues)
- [Authentication Issues](#authentication-issues)
- [Build & Deployment Issues](#build--deployment-issues)
- [Integration Issues](#integration-issues)
- [Performance Issues](#performance-issues)

---

## Development Issues

### Application Won't Start

#### Port Already in Use

**Error:**
```
Error: listen EADDRINUSE: address already in use :::3001
```

**Solution:**
```bash
# Find and kill the process
lsof -i :3001
kill -9 <PID>

# Or use a different port
PORT=3002 npm run dev
```

#### Module Not Found

**Error:**
```
Module not found: Can't resolve '@/lib/...'
```

**Solution:**
```bash
# Reinstall dependencies
rm -rf node_modules
npm install

# Regenerate Prisma client
npx prisma generate

# Clear Next.js cache
rm -rf .next
```

#### Environment Variables Not Loading

**Symptoms:** App starts but features don't work, empty values

**Solutions:**

1. Check file name (must be `.env.local` for development)
2. Restart the dev server after changes
3. Verify no syntax errors in .env file:
   ```bash
   # Bad (spaces around =)
   DATABASE_URL = "postgresql://..."
   
   # Good
   DATABASE_URL="postgresql://..."
   ```

### TypeScript Errors

#### "Cannot find module" for Prisma

**Error:**
```
Cannot find module '@prisma/client'
```

**Solution:**
```bash
npx prisma generate
```

#### Type Errors After Schema Change

**Solution:**
```bash
# Regenerate types
npx prisma generate

# Restart TypeScript server in VS Code
# Cmd/Ctrl + Shift + P → "TypeScript: Restart TS Server"
```

---

## Database Issues

### Connection Failed

#### PostgreSQL

**Error:**
```
Error: P1001: Can't reach database server
```

**Solutions:**

1. Check PostgreSQL is running:
   ```bash
   # macOS
   brew services list | grep postgres
   
   # Linux
   systemctl status postgresql
   
   # Docker
   docker ps | grep postgres
   ```

2. Verify connection string:
   ```bash
   # Test connection
   psql "postgresql://user:pass@localhost:5432/dbname"
   ```

3. Check firewall/port access

#### SQLite

**Error:**
```
Error: P1003: Database file not found
```

**Solution:**
```bash
# Create database with migration
npm run db:migrate:dev
```

### Migration Issues

#### Migration Failed

**Error:**
```
Error: P3006: Migration failed to apply
```

**Solutions:**

1. Check migration SQL for errors
2. Reset database (development only):
   ```bash
   npm run db:reset
   ```
3. Manual fix:
   ```bash
   # Mark migration as applied
   npx prisma migrate resolve --applied <migration_name>
   ```

#### Schema Drift

**Error:**
```
Error: P3005: Database schema is not in sync
```

**Solution:**
```bash
# Development: reset and re-migrate
npm run db:reset

# Production: create corrective migration
npx prisma migrate dev --name fix_drift
```

### Prisma Studio Won't Open

**Error:**
```
Error: Could not start Prisma Studio
```

**Solution:**
```bash
# Kill existing studio process
pkill -f "prisma studio"

# Try different port
npx prisma studio --port 5556
```

---

## Authentication Issues

### "Invalid token" Error

**Causes:**
1. Token expired
2. JWT_SECRET changed
3. Token format invalid

**Solutions:**

1. Clear browser cookies and re-login
2. Check JWT_SECRET matches across environments
3. Verify token format:
   ```javascript
   // Token should be: header.payload.signature
   console.log(token.split('.').length === 3);
   ```

### "Unauthorized" on Protected Routes

**Debugging steps:**

1. Check if token exists:
   ```javascript
   console.log(document.cookie);
   ```

2. Verify middleware is applied:
   ```typescript
   // Route should use withAuth
   export const GET = withAuth(async (req, user) => {
     // user is guaranteed to exist here
   });
   ```

3. Check user role permissions:
   ```typescript
   // In route handler
   console.log('User role:', user.role);
   console.log('Required role:', 'admin');
   ```

### Session Expires Too Quickly

**Check these settings:**

```bash
# .env.local
SESSION_TIMEOUT=3600        # 1 hour in seconds
JWT_EXPIRES_IN=7d          # Token lifetime
```

### 2FA Not Working

**Solutions:**

1. Verify system time is correct (TOTP is time-based)
2. Check TOTP secret is stored correctly
3. Try backup codes if available

---

## Build & Deployment Issues

### Build Fails

#### Out of Memory

**Error:**
```
FATAL ERROR: Reached heap limit
```

**Solution:**
```bash
# Increase Node.js memory
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

#### TypeScript Errors in Build

**Solutions:**

1. Run type check first:
   ```bash
   npm run type-check
   ```

2. Check for missing dependencies:
   ```bash
   npm install
   ```

3. Clear cache and rebuild:
   ```bash
   rm -rf .next
   npm run build
   ```

### Docker Issues

#### Container Won't Start

**Check logs:**
```bash
docker logs eonpro-app
```

**Common fixes:**

1. Environment variables not set:
   ```bash
   # Check env file exists
   ls -la .env.production
   ```

2. Port conflict:
   ```bash
   # Check port availability
   lsof -i :3001
   ```

#### Database Connection in Docker

**Error:**
```
Error: Can't connect to database at localhost
```

**Solution:** Use Docker network hostname:
```bash
# In docker-compose.yml, use service name
DATABASE_URL="postgresql://user:pass@postgres:5432/db"
# NOT localhost
```

### Vercel Deployment Issues

#### Build Timeout

**Solutions:**

1. Increase build timeout in Vercel settings
2. Optimize build:
   ```bash
   # Add to package.json
   "build": "next build --no-lint"
   # Run lint separately in CI
   ```

#### Environment Variables Missing

**Check:**
1. Variables are set in Vercel dashboard
2. Names match exactly (case-sensitive)
3. Redeploy after adding variables

---

## Integration Issues

### Stripe

#### Webhook Signature Invalid

**Error:**
```
Error: Webhook signature verification failed
```

**Solutions:**

1. Use correct webhook secret:
   ```bash
   # Local development (Stripe CLI)
   stripe listen --forward-to localhost:3001/api/webhooks/stripe
   # Use the secret printed by CLI
   ```

2. Don't parse body before verification:
   ```typescript
   // Correct: use raw body
   const rawBody = await request.text();
   const event = stripe.webhooks.constructEvent(
     rawBody,
     signature,
     webhookSecret
   );
   ```

#### Test Mode vs Live Mode

**Symptoms:** Payments work in test but not production

**Solution:** Ensure you're using the correct API keys:
- Test: `sk_test_...`, `pk_test_...`
- Live: `sk_live_...`, `pk_live_...`

### Twilio

#### SMS Not Sending

**Debugging:**

1. Check credentials:
   ```bash
   curl -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json" \
     -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
     -d "To=+1234567890" \
     -d "From=$TWILIO_PHONE_NUMBER" \
     -d "Body=Test"
   ```

2. Verify phone number is verified (test accounts)
3. Check Twilio console for error logs

### AWS S3

#### Access Denied

**Solutions:**

1. Check IAM permissions include:
   - `s3:PutObject`
   - `s3:GetObject`
   - `s3:DeleteObject`

2. Verify bucket policy allows access
3. Check bucket region matches config

#### CORS Errors

**Add CORS configuration to bucket:**
```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://your-domain.com"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

---

## Performance Issues

### Slow API Responses

**Debugging:**

1. Enable query logging:
   ```typescript
   // In prisma client initialization
   const prisma = new PrismaClient({
     log: ['query', 'info', 'warn', 'error'],
   });
   ```

2. Check for N+1 queries:
   ```typescript
   // Bad: N+1
   const patients = await prisma.patient.findMany();
   for (const p of patients) {
     const orders = await prisma.order.findMany({ where: { patientId: p.id } });
   }
   
   // Good: Include relation
   const patients = await prisma.patient.findMany({
     include: { orders: true },
   });
   ```

3. Use database metrics endpoint:
   ```bash
   curl /api/admin/database-metrics
   ```

### High Memory Usage

**Solutions:**

1. Check for memory leaks:
   ```bash
   node --inspect npm run dev
   # Open chrome://inspect
   ```

2. Optimize large data queries:
   ```typescript
   // Use pagination
   const patients = await prisma.patient.findMany({
     take: 50,
     skip: (page - 1) * 50,
   });
   ```

### Slow Dashboard Load

**Solutions:**

1. Use data preloader:
   ```typescript
   import { dataPreloader } from '@/lib/database';
   
   const dashboard = await dataPreloader.preloadClinicDashboard(clinicId);
   ```

2. Check cache hit rate:
   ```bash
   GET /api/admin/database-metrics
   # Look for cacheHitRate
   ```

3. Warm cache on startup:
   ```typescript
   await dataPreloader.warmCache([clinicId]);
   ```

---

## Getting More Help

### Collect Debug Information

When reporting issues, include:

1. **Error message** (full stack trace)
2. **Steps to reproduce**
3. **Environment details:**
   ```bash
   node -v
   npm -v
   cat .env.local | grep -v SECRET | grep -v KEY
   ```
4. **Recent changes** (git diff)

### Log Locations

- **Application logs:** Console output / Vercel logs
- **Database logs:** PostgreSQL logs or Prisma debug
- **Build logs:** `.next/` folder or CI output

### Useful Commands

```bash
# Full system check
npm run validate

# Check specific subsystem
npm run type-check
npm run lint
npm run test

# Database health
npm run db:validate
npx prisma studio

# Clear everything and start fresh
rm -rf node_modules .next
npm install
npm run db:reset
npm run dev
```

---

If your issue isn't covered here, check the [GitHub Issues](https://github.com/your-org/eonpro/issues) or ask in the team Slack channel.
