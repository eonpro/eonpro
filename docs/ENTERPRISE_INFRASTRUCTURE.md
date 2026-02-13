# EONPRO Enterprise Infrastructure Guide

## Overview

This document describes the enterprise-grade infrastructure setup for the EONPRO telehealth
platform, including deployment, monitoring, security, and operational procedures.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Deployment Options](#deployment-options)
3. [Security Configuration](#security-configuration)
4. [Monitoring & Alerting](#monitoring--alerting)
5. [CI/CD Pipeline](#cicd-pipeline)
6. [Disaster Recovery](#disaster-recovery)
7. [Operational Runbooks](#operational-runbooks)

---

## Architecture Overview

### High-Level Architecture

```
                                    ┌─────────────────┐
                                    │   CloudFlare    │
                                    │   (CDN + WAF)   │
                                    └────────┬────────┘
                                             │
                              ┌──────────────┼──────────────┐
                              │              │              │
                        ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
                        │  Ingress  │  │  Ingress  │  │  Ingress  │
                        │ (Zone A)  │  │ (Zone B)  │  │ (Zone C)  │
                        └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
                              │              │              │
                        ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
                        │   App     │  │   App     │  │   App     │
                        │ Pod (3+)  │  │ Pod (3+)  │  │ Pod (3+)  │
                        └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
                              │              │              │
                              └──────────────┼──────────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
        ┌─────▼─────┐                  ┌─────▼─────┐                  ┌─────▼─────┐
        │ PostgreSQL│                  │   Redis   │                  │    S3     │
        │ (Primary) │◄────────────────►│  Cluster  │                  │  Bucket   │
        └─────┬─────┘                  └───────────┘                  └───────────┘
              │
        ┌─────▼─────┐
        │ PostgreSQL│
        │ (Replica) │
        └───────────┘
```

### Component Summary

| Component      | Purpose                       | Technology                  |
| -------------- | ----------------------------- | --------------------------- |
| CDN + WAF      | Edge caching, DDoS protection | CloudFlare / AWS CloudFront |
| Load Balancer  | Traffic distribution          | Kubernetes Ingress (NGINX)  |
| Application    | Next.js application           | Node.js 20                  |
| Database       | Primary data store            | PostgreSQL 14+              |
| Cache          | Session & data cache          | Redis 7                     |
| Object Storage | Document storage              | AWS S3                      |
| Job Queue      | Background processing         | BullMQ + Redis              |
| Monitoring     | Observability                 | Prometheus + Grafana        |
| Logging        | Centralized logs              | Elasticsearch / CloudWatch  |

---

## Deployment Options

### Option 1: Vercel (Recommended for Most Cases)

**Pros:** Zero-ops, automatic scaling, global edge network **Cons:** Limited customization,
potential vendor lock-in

```bash
# Deploy to Vercel
vercel --prod
```

### Option 2: Kubernetes

**Pros:** Full control, multi-cloud capable, enterprise features **Cons:** Higher operational
complexity

```bash
# Apply Kubernetes manifests
kubectl apply -f infrastructure/kubernetes/

# Verify deployment
kubectl get pods -n eonpro
kubectl get svc -n eonpro
```

### Option 3: Docker Compose (Development/Small Scale)

**Pros:** Simple, portable, good for development **Cons:** Single host, limited scaling

```bash
# Start all services
docker-compose -f infrastructure/docker/docker-compose.production.yml up -d

# Check status
docker-compose ps
```

---

## Security Configuration

### Required Environment Variables

```bash
# Generate secure secrets
openssl rand -base64 32  # JWT_SECRET
openssl rand -hex 32     # ENCRYPTION_KEY

# Required for production
JWT_SECRET=<32+ character secret>
ENCRYPTION_KEY=<64 hex characters>
DATABASE_URL=postgresql://...?sslmode=require
```

### Security Headers (Configured in vercel.json)

- Strict-Transport-Security (HSTS)
- Content-Security-Policy (CSP)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy

### Authentication Security

1. **JWT Tokens**: Short-lived (15 min production)
2. **2FA**: Required for admin/provider accounts
3. **Session Management**: 15-minute inactivity timeout
4. **Rate Limiting**: 3 attempts before 30-minute lockout

### Data Encryption

- **At Rest**: AES-256-GCM for PHI
- **In Transit**: TLS 1.3 enforced
- **Database**: SSL/TLS required

---

## Monitoring & Alerting

### Health Endpoints

```
GET /api/health     - Basic health check
GET /api/ready      - Readiness check (includes dependencies)
```

### Key Metrics

| Metric            | Alert Threshold | Severity |
| ----------------- | --------------- | -------- |
| Error Rate        | > 5%            | Critical |
| P95 Latency       | > 2s            | Warning  |
| CPU Usage         | > 80%           | Warning  |
| Memory Usage      | > 85%           | Warning  |
| Failed Logins     | > 10/min        | Warning  |
| PHI Access Denied | > 5/min         | Critical |

### Grafana Dashboards

1. **Application Overview**: Request rate, errors, latency
2. **Infrastructure**: CPU, memory, disk, network
3. **Security**: Auth events, access patterns
4. **Business**: Orders, prescriptions, revenue

---

## CI/CD Pipeline

### Pipeline Stages

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  Lint   │───►│ Security│───►│  Test   │───►│  Build  │───►│ Deploy  │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
     │              │              │              │              │
     ▼              ▼              ▼              ▼              ▼
  ESLint       npm audit      Vitest        Next.js       Vercel/K8s
  TypeScript   Snyk           Playwright    Docker
  Prettier     Semgrep
```

### Quality Gates

- [ ] All linting checks pass
- [ ] No critical/high security vulnerabilities
- [ ] Test coverage > 70% (90% for security modules)
- [ ] Build succeeds
- [ ] E2E smoke tests pass
- [ ] Performance budget met

### Deployment Environments

| Environment | Branch     | Auto-Deploy     | URL                   |
| ----------- | ---------- | --------------- | --------------------- |
| Development | feature/\* | Yes             | PR preview            |
| Staging     | develop    | Yes             | staging.eonpro.health |
| Production  | main       | Manual approval | app.eonpro.health     |

---

## Disaster Recovery

### Backup Strategy

| Data       | Frequency | Retention       | Location          |
| ---------- | --------- | --------------- | ----------------- |
| Database   | Hourly    | 30 days         | Cross-region S3   |
| Documents  | Real-time | Indefinite      | S3 (versioned)    |
| Audit Logs | Real-time | 6 years (HIPAA) | Immutable storage |

### Recovery Procedures

#### Database Recovery

```bash
# List available backups
aws rds describe-db-snapshots --db-instance-identifier eonpro-prod

# Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier eonpro-recovered \
  --db-snapshot-identifier <snapshot-id>
```

#### Application Rollback

```bash
# Kubernetes
kubectl rollout undo deployment/eonpro-app -n eonpro

# Vercel
vercel rollback
```

### RTO/RPO Targets

- **RTO (Recovery Time Objective)**: < 1 hour
- **RPO (Recovery Point Objective)**: < 15 minutes

---

## Operational Runbooks

### High Error Rate

1. Check application logs: `kubectl logs -l app=eonpro -n eonpro`
2. Verify database connectivity
3. Check external service status (Stripe, Lifefile, etc.)
4. Scale up if needed: `kubectl scale deployment/eonpro-app --replicas=5`

### Database Connection Issues

1. Check connection pool status
2. Verify network connectivity
3. Check PostgreSQL logs
4. Restart affected pods if necessary

### Security Incident

1. **IMMEDIATE**: Block suspicious IPs at WAF level
2. **INVESTIGATE**: Review audit logs
3. **CONTAIN**: Revoke compromised tokens
4. **RECOVER**: Reset affected credentials
5. **REPORT**: Document incident per HIPAA requirements

---

## Support Contacts

| Role               | Contact                  | Escalation      |
| ------------------ | ------------------------ | --------------- |
| On-Call Engineer   | PagerDuty                | Automatic       |
| Security Team      | security@eonpro.health   | Slack #security |
| Database Admin     | dba@eonpro.health        | Phone           |
| Compliance Officer | compliance@eonpro.health | Email           |

---

## Appendix

### Useful Commands

```bash
# Check pod status
kubectl get pods -n eonpro -o wide

# View logs
kubectl logs -f deployment/eonpro-app -n eonpro

# Execute in pod
kubectl exec -it <pod-name> -n eonpro -- /bin/sh

# Port forward for debugging
kubectl port-forward svc/eonpro-app 3000:80 -n eonpro

# Database connection
kubectl exec -it <postgres-pod> -- psql -U eonpro -d eonpro_production
```

### Environment Variable Reference

See `env.production.template` for complete list of environment variables.

---

_Last Updated: December 2025_ _Version: 2.0_
