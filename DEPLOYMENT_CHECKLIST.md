# 🚀 Deployment Checklist

## Pre-Deployment Verification

### 🔐 Security Checklist
- [ ] JWT_SECRET is set and secure (32+ characters)
- [ ] ENCRYPTION_KEY is set and secure
- [ ] All API keys are configured
- [ ] CORS settings reviewed
- [ ] CSP headers configured
- [ ] Rate limiting enabled
- [ ] Authentication middleware active
- [ ] No hardcoded secrets in code
- [ ] Environment variables validated

### 🧪 Testing Checklist
- [ ] All unit tests passing (`npm test`)
- [ ] TypeScript compilation successful (`npx tsc --noEmit`)
- [ ] No critical vulnerabilities (`npm audit`)
- [ ] Load testing completed (`npx ts-node scripts/load-test.ts`)
- [ ] API endpoints tested manually
- [ ] Database migrations applied
- [ ] Indexes created (`npx ts-node scripts/add-indexes.ts`)

### 📊 Performance Checklist
- [ ] Build size < 5MB
- [ ] Initial page load < 3s
- [ ] API response time < 500ms average
- [ ] Database queries optimized
- [ ] Caching strategy implemented
- [ ] CDN configured for static assets
- [ ] Image optimization enabled

### 🏗️ Infrastructure Checklist
- [ ] PostgreSQL database ready
- [ ] Redis cache configured (if using)
- [ ] SSL certificates valid
- [ ] DNS configured correctly
- [ ] Backup strategy in place
- [ ] Monitoring tools setup
- [ ] Error tracking (Sentry) configured
- [ ] Logging aggregation ready

## Deployment Steps

### 1️⃣ Staging Deployment

```bash
# 1. Checkout staging branch
git checkout staging

# 2. Merge changes from develop
git merge develop

# 3. Run tests locally
npm test
npm run build

# 4. Push to trigger deployment
git push origin staging

# 5. Verify staging deployment
curl https://staging.lifefile.com/api/health
curl https://staging.lifefile.com/api/ready
```

### 2️⃣ Production Deployment

```bash
# 1. Checkout main branch
git checkout main

# 2. Merge from staging
git merge staging --no-ff

# 3. Tag the release
git tag -a v1.0.0 -m "Release version 1.0.0"

# 4. Push with tags
git push origin main --tags

# 5. Monitor deployment
# Check GitHub Actions: https://github.com/[your-org]/lifefile/actions
```

### 3️⃣ Post-Deployment Verification

```bash
# Health checks
curl https://app.lifefile.com/api/health
curl https://app.lifefile.com/api/ready

# Load test production (with caution)
TEST_URL=https://app.lifefile.com \
CONCURRENT_USERS=5 \
REQUESTS_PER_USER=5 \
npx ts-node scripts/load-test.ts

# Check logs
vercel logs --prod --since 1h

# Monitor metrics
# - Check Sentry for errors
# - Monitor API response times
# - Check database performance
```

## Environment Variables

### Required for Production

```env
# Security (REQUIRED)
JWT_SECRET=
ENCRYPTION_KEY=
NEXTAUTH_SECRET=
NEXTAUTH_URL=https://app.lifefile.com

# Database (REQUIRED)
DATABASE_URL=postgresql://...
REDIS_URL=redis://... (optional but recommended)

# Lifefile API (REQUIRED)
LIFEFILE_BASE_URL=
LIFEFILE_USERNAME=
LIFEFILE_PASSWORD=
LIFEFILE_VENDOR_ID=
LIFEFILE_PRACTICE_ID=

# Third-Party Services
OPENAI_API_KEY=
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
GOOGLE_MAPS_SERVER_KEY=

# Monitoring
SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
```

## Rollback Procedure

If issues are detected after deployment:

### Immediate Rollback (< 5 minutes)

```bash
# Vercel instant rollback
vercel rollback

# Or via dashboard
# https://vercel.com/[your-org]/lifefile/deployments
```

### Git-based Rollback

```bash
# 1. Find previous stable commit
git log --oneline -10

# 2. Create rollback branch
git checkout -b rollback/v1.0.0 [commit-hash]

# 3. Force deploy
git push origin rollback/v1.0.0:main --force-with-lease
```

## Monitoring Checklist

### Real-time Monitoring
- [ ] Application logs streaming
- [ ] Error rate < 1%
- [ ] Response time P95 < 1s
- [ ] Database connection pool healthy
- [ ] Memory usage < 80%
- [ ] CPU usage < 70%

### First 24 Hours
- [ ] No critical errors in Sentry
- [ ] All webhooks processing correctly
- [ ] Payment processing functional
- [ ] User registrations working
- [ ] Email notifications sending
- [ ] SMS notifications delivering

### Performance Metrics
- [ ] Page load time < 3s
- [ ] API response time < 500ms
- [ ] Database query time < 100ms
- [ ] Cache hit rate > 80%
- [ ] CDN hit rate > 90%

## Communication Plan

### Pre-Deployment
- [ ] Notify team of deployment window
- [ ] Update status page
- [ ] Prepare rollback plan

### During Deployment
- [ ] Monitor deployment progress
- [ ] Test critical paths immediately
- [ ] Watch error rates

### Post-Deployment
- [ ] Announce successful deployment
- [ ] Document any issues encountered
- [ ] Update runbook with learnings
- [ ] Schedule retrospective if needed

## Emergency Contacts

- **DevOps Lead**: [Contact]
- **Database Admin**: [Contact]
- **Security Team**: [Contact]
- **Lifefile API Support**: [Contact]
- **On-Call Engineer**: [Contact]

## Useful Commands

```bash
# View recent logs
vercel logs --prod --since 1h

# Check deployment status
vercel ls

# Database operations
npx prisma migrate deploy
npx prisma db seed

# Clear cache
redis-cli FLUSHALL

# Restart services
vercel dev --force

# Generate status report
curl https://app.lifefile.com/api/ready | jq
```

## Sign-off

- [ ] Development Team
- [ ] QA Team
- [ ] Security Team
- [ ] Product Owner
- [ ] DevOps Team

---

**Last Updated**: November 26, 2024
**Version**: 1.0.0
**Status**: Ready for Deployment 🚀
