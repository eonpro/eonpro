# EONPRO Platform Deployment Guide

## 🚀 Production Deployment Checklist

### Prerequisites
- Node.js 20+ installed
- PostgreSQL 14+ database
- Redis server (optional but recommended)
- Domain name with SSL certificate
- Email service account (SendGrid/AWS SES)
- Cloud hosting account (Vercel/AWS/Digital Ocean)

## 1. Database Setup (PostgreSQL)

### Option A: Supabase (Recommended for Quick Setup)
```bash
# 1. Create account at https://supabase.com
# 2. Create new project
# 3. Get connection string from Settings > Database
# 4. Add to .env.production.local:
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
```

### Option B: AWS RDS
```bash
# 1. Create RDS PostgreSQL instance
# 2. Enable SSL requirement
# 3. Configure security groups
# 4. Get connection string:
DATABASE_URL="postgresql://username:password@your-db.region.rds.amazonaws.com:5432/eonpro?sslmode=require"
```

### Option C: Digital Ocean Managed Database
```bash
# 1. Create PostgreSQL cluster
# 2. Download CA certificate
# 3. Configure connection pool
# 4. Get connection string with SSL:
DATABASE_URL="postgresql://username:password@your-db.ondigitalocean.com:25060/defaultdb?sslmode=require"
```

### Run Database Migration
```bash
# 1. Set production database URL
export DATABASE_URL="your-production-database-url"

# 2. Run migrations
npx prisma migrate deploy

# 3. Seed initial data (optional)
npx prisma db seed
```

## 2. Environment Configuration

### Create Production Environment File
```bash
cp env.production.template .env.production.local
```

### Required Environment Variables
```env
# Security (REQUIRED)
ENCRYPTION_KEY=         # Generate: openssl rand -hex 32
JWT_SECRET=            # Generate: openssl rand -base64 32
JWT_REFRESH_SECRET=    # Generate: openssl rand -base64 32
NEXTAUTH_SECRET=       # Generate: openssl rand -base64 32

# Database (REQUIRED)
DATABASE_URL="postgresql://..."

# Application (REQUIRED)
NODE_ENV=production
NEXTAUTH_URL=https://yourdomain.com
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# Email Service (REQUIRED for password reset)
SENDGRID_API_KEY=your-sendgrid-key
SENDGRID_FROM_EMAIL=noreply@yourdomain.com

# Optional Services
STRIPE_SECRET_KEY=sk_live_...
TWILIO_ACCOUNT_SID=...
OPENAI_API_KEY=sk-...
```

## 3. Email Service Setup

### Option A: SendGrid
1. Create account at https://sendgrid.com
2. Verify sender domain
3. Create API key with Mail Send permission
4. Add to environment:
```env
SENDGRID_API_KEY=SG.your-api-key
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
SENDGRID_FROM_NAME="EONPRO Health"
```

### Option B: AWS SES
1. Verify domain in AWS SES
2. Move out of sandbox (for production)
3. Create SMTP credentials or use SDK
4. Configure in environment

### Option C: Resend
1. Create account at https://resend.com
2. Add and verify domain
3. Get API key
4. Add to environment:
```env
RESEND_API_KEY=re_your-api-key
```

## 4. Build for Production

```bash
# Install dependencies
npm ci --production=false

# Build application
npm run build

# Test production build locally
npm start
```

## 5. Deployment Options

### Option A: Vercel (Recommended)
```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Deploy
vercel --prod

# 3. Set environment variables in Vercel dashboard
# Settings > Environment Variables
```

### Option B: Railway
```bash
# 1. Install Railway CLI
npm i -g @railway/cli

# 2. Login and initialize
railway login
railway init

# 3. Deploy
railway up
```

### Option C: Docker
```dockerfile
# Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./
RUN npm ci --production
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
# Build and run
docker build -t eonpro .
docker run -p 3000:3000 --env-file .env.production eonpro
```

### Option D: Traditional VPS
```bash
# 1. Setup server (Ubuntu/Debian)
sudo apt update
sudo apt install nodejs npm nginx certbot

# 2. Clone repository
git clone your-repo
cd eonpro

# 3. Install dependencies and build
npm ci
npm run build

# 4. Setup PM2 for process management
npm install -g pm2
pm2 start npm --name "eonpro" -- start
pm2 save
pm2 startup

# 5. Configure Nginx reverse proxy
sudo nano /etc/nginx/sites-available/eonpro
```

Nginx configuration:
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# 6. Enable site and SSL
sudo ln -s /etc/nginx/sites-available/eonpro /etc/nginx/sites-enabled/
sudo certbot --nginx -d yourdomain.com
sudo nginx -s reload
```

## 6. Post-Deployment Tasks

### Configure Monitoring
```bash
# 1. Setup Sentry for error tracking
SENTRY_DSN=your-sentry-dsn
SENTRY_ORG=your-org
SENTRY_PROJECT=eonpro

# 2. Setup uptime monitoring (UptimeRobot, Pingdom)
# 3. Configure log aggregation (Datadog, New Relic)
```

### Security Hardening
```bash
# 1. Enable rate limiting
ENABLE_RATE_LIMITING=true
RATE_LIMIT_MAX_REQUESTS=100

# 2. Configure CSP headers
ENABLE_SECURITY_HEADERS=true
ENABLE_CSP=true

# 3. Set up WAF (Cloudflare, AWS WAF)
# 4. Enable DDoS protection
# 5. Configure backup strategy
```

### Database Backups
```bash
# Automated daily backups
# 1. Create backup script
cat > backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump $DATABASE_URL > backup_$DATE.sql
# Upload to S3 or other storage
aws s3 cp backup_$DATE.sql s3://your-backup-bucket/
# Keep only last 30 days
find . -name "backup_*.sql" -mtime +30 -delete
EOF

# 2. Add to crontab
crontab -e
# Add: 0 2 * * * /path/to/backup.sh
```

## 7. Health Checks

### Application Health Endpoint
The platform includes health check endpoints:
- `/api/health` - Basic health check
- `/api/health/detailed` - Detailed system status

### Database Health
```bash
# Check database connection
npx prisma db pull

# Verify migrations
npx prisma migrate status
```

## 8. Troubleshooting

### Common Issues

#### Build Failures
```bash
# Clear cache and rebuild
rm -rf .next node_modules
npm install
npm run build
```

#### Database Connection Issues
```bash
# Test connection
npx prisma db pull

# Check SSL requirement
DATABASE_URL="...?sslmode=require"
```

#### Memory Issues
```bash
# Increase Node memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

## 9. Performance Optimization

### CDN Setup
```bash
# Cloudflare
1. Add domain to Cloudflare
2. Configure caching rules
3. Enable Auto Minify
4. Set up Page Rules for static assets

# AWS CloudFront
1. Create distribution
2. Set origin to your application
3. Configure behaviors for /static/*
4. Enable compression
```

### Redis for Sessions
```env
REDIS_URL=redis://username:password@your-redis-server:6379
REDIS_PREFIX=eonpro:
REDIS_SESSION_TTL=900
```

## 10. Compliance & Legal

### Before Launch
- [ ] Terms of Service reviewed by legal
- [ ] Privacy Policy HIPAA-compliant
- [ ] Business Associate Agreements ready
- [ ] Data Processing Agreements prepared
- [ ] Cookie consent implemented
- [ ] Audit logging enabled
- [ ] PHI encryption verified
- [ ] Access controls tested
- [ ] Incident response plan documented

## Support

For deployment assistance:
- Documentation: [docs.eonpro.com](https://docs.eonpro.com)
- Support: support@eonpro.com
- Emergency: +1-xxx-xxx-xxxx

## Quick Start Commands

```bash
# Development
npm run dev

# Production build
npm run build
npm start

# Database
npx prisma migrate dev
npx prisma studio
npx prisma migrate deploy

# Security audit
npm run security:audit
npm run security:scan

# Testing
npm test
npm run test:e2e
```

---

Last updated: November 2024
Version: 1.0.0
