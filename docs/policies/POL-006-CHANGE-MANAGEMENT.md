# Change Management Policy

**Policy ID:** POL-006  
**Version:** 1.0  
**Effective Date:** January 31, 2026  
**Last Review Date:** January 31, 2026  
**Next Review Date:** January 31, 2027  
**Classification:** INTERNAL  
**Owner:** Chief Technology Officer (CTO)

---

## Document Approval

| Role                    | Name               | Signature          | Date         |
| ----------------------- | ------------------ | ------------------ | ------------ |
| CEO / Executive Sponsor | ********\_******** | ********\_******** | **\_\_\_\_** |
| CTO / Technical Lead    | ********\_******** | ********\_******** | **\_\_\_\_** |
| CISO / Security Lead    | ********\_******** | ********\_******** | **\_\_\_\_** |

---

## 1. Purpose

This policy establishes the change management process for all modifications to EONPRO production
systems, ensuring changes are properly tested, approved, documented, and reversible to maintain
system integrity and availability.

## 2. Scope

This policy applies to:

- Application code changes
- Infrastructure and configuration changes
- Database schema changes
- Third-party integration changes
- Security control modifications
- All environments: development, staging, and production

## 3. Change Categories

### 3.1 Change Types

| Type          | Definition                       | Approval               | Testing            | Examples                                  |
| ------------- | -------------------------------- | ---------------------- | ------------------ | ----------------------------------------- |
| **Emergency** | Critical fix for active incident | Post-implementation    | Expedited          | Security patches, P1 bug fixes            |
| **Standard**  | Pre-approved, low-risk changes   | Pre-approved procedure | Normal             | Dependency updates, config changes        |
| **Normal**    | Typical development changes      | CAB/Peer review        | Full CI/CD         | New features, bug fixes                   |
| **Major**     | Significant system changes       | CAB + Executive        | Extended + Staging | Database migrations, architecture changes |

### 3.2 Risk Classification

| Risk Level   | Criteria                              | Approval Authority |
| ------------ | ------------------------------------- | ------------------ |
| **Critical** | Security controls, PHI handling, auth | CISO + CTO         |
| **High**     | Database schema, payment processing   | CTO + Team Lead    |
| **Medium**   | New features, API changes             | Team Lead + Peer   |
| **Low**      | UI changes, documentation             | Peer review        |

## 4. Change Management Process

### 4.1 Process Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Request   │───▶│   Review    │───▶│   Approve   │───▶│   Build     │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                                               │
┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│   Close     │◀───│   Verify    │◀───│   Deploy    │◀─────────┘
└─────────────┘    └─────────────┘    └─────────────┘
```

### 4.2 Change Request

#### 4.2.1 Request Requirements

| Element          | Description                  | Required For  |
| ---------------- | ---------------------------- | ------------- |
| Description      | What is being changed        | All changes   |
| Justification    | Why the change is needed     | All changes   |
| Risk assessment  | Potential impact             | Normal, Major |
| Testing plan     | How change will be validated | All changes   |
| Rollback plan    | How to revert if needed      | All changes   |
| Affected systems | Components impacted          | All changes   |
| Scheduled time   | When change will occur       | Normal, Major |

#### 4.2.2 Pull Request Template

```markdown
## Description

[Describe the change]

## Type of Change

- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Breaking change (fix or feature causing existing functionality to change)
- [ ] Security fix (change addressing a vulnerability)
- [ ] Database migration

## Risk Level

- [ ] Low - UI/documentation changes
- [ ] Medium - New features, API changes
- [ ] High - Database schema, payment processing
- [ ] Critical - Security controls, PHI handling

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed
- [ ] Staging deployment verified

## Security Checklist (if applicable)

- [ ] No secrets in code
- [ ] Input validation implemented
- [ ] PHI handling follows encryption policy
- [ ] Audit logging added for sensitive operations

## Rollback Plan

[Describe how to revert this change]
```

### 4.3 Review Process

#### 4.3.1 Code Review Requirements

| Change Type       | Required Reviewers   | CODEOWNERS    |
| ----------------- | -------------------- | ------------- |
| Security-critical | Security team + Peer | Required      |
| Database changes  | Data team + Security | Required      |
| API changes       | API owner + Peer     | Required      |
| Standard changes  | 1 peer reviewer      | If applicable |

**CODEOWNERS Enforcement:**

```
# .github/CODEOWNERS
/src/lib/auth/           @security-team
/src/lib/security/       @security-team
/prisma/                 @data-team @security-team
/.github/workflows/      @devops-team @security-team
```

#### 4.3.2 Review Checklist

| Category          | Review Items                                        |
| ----------------- | --------------------------------------------------- |
| **Security**      | No hardcoded secrets, proper auth, input validation |
| **Code Quality**  | Follows standards, no obvious bugs, maintainable    |
| **Testing**       | Adequate test coverage, tests pass                  |
| **Documentation** | API docs updated, comments where needed             |
| **Performance**   | No obvious performance issues                       |
| **Compliance**    | PHI handling correct, audit logging present         |

### 4.4 Approval Process

#### 4.4.1 Approval Authority Matrix

| Risk Level | Approvers               | Quorum        |
| ---------- | ----------------------- | ------------- |
| Critical   | CISO + CTO              | Both required |
| High       | CTO or Team Lead        | 1 required    |
| Medium     | Team Lead or Senior Dev | 1 required    |
| Low        | Any team member         | 1 required    |

#### 4.4.2 Emergency Change Approval

| Step | Action                            | Timeline         |
| ---- | --------------------------------- | ---------------- |
| 1    | Verbal approval from on-call lead | Immediate        |
| 2    | Change implemented                | As needed        |
| 3    | Documentation completed           | Within 24 hours  |
| 4    | Post-implementation review        | Within 48 hours  |
| 5    | CAB retrospective                 | Next CAB meeting |

### 4.5 Build and Test

#### 4.5.1 CI/CD Pipeline

**Pipeline Stages (`.github/workflows/ci.yml`):**

| Stage                | Purpose                     | Gate Type           |
| -------------------- | --------------------------- | ------------------- |
| Lint & Type Check    | Code quality                | Blocking            |
| Security Scan        | Vulnerability detection     | Blocking            |
| Unit Tests           | Functional verification     | Blocking            |
| Integration Tests    | System verification         | Blocking            |
| Build                | Compilation check           | Blocking            |
| Deploy to Staging    | Pre-production verification | Manual gate (major) |
| Deploy to Production | Release                     | Manual gate         |

#### 4.5.2 Security Gates

| Gate                       | Tool            | Threshold            |
| -------------------------- | --------------- | -------------------- |
| Dependency vulnerabilities | npm audit, Snyk | No high/critical     |
| Secret scanning            | TruffleHog      | No secrets           |
| SAST                       | Semgrep         | No critical findings |
| Type checking              | TypeScript      | No errors            |
| Linting                    | ESLint          | No errors            |

**Technical Implementation:**

```yaml
# .github/workflows/ci.yml
- name: Run npm audit
  run: npm audit --production --audit-level=high

- name: Run Snyk security scan
  uses: snyk/actions/node@master

- name: Run Semgrep SAST
  uses: returntocorp/semgrep-action@v1

- name: Run TruffleHog secret scan
  uses: trufflesecurity/trufflehog@main
```

### 4.6 Deployment

#### 4.6.1 Deployment Process

| Environment | Trigger                | Approval        | Rollback              |
| ----------- | ---------------------- | --------------- | --------------------- |
| Development | Push to feature branch | Automatic       | Git revert            |
| Staging     | Merge to develop       | Automatic       | Git revert + redeploy |
| Production  | Merge to main          | Manual approval | Immediate rollback    |

#### 4.6.2 Production Deployment Checklist

```
Pre-Deployment:
□ All CI/CD gates passed
□ Staging verification complete
□ Database migration tested (if applicable)
□ Rollback plan documented
□ Monitoring dashboards ready
□ On-call team notified

Deployment:
□ Deploy during approved window
□ Monitor error rates
□ Verify health checks passing
□ Spot check critical functionality

Post-Deployment:
□ Verify deployment successful
□ Monitor for 30 minutes minimum
□ Update change record
□ Close change ticket
```

### 4.7 Verification and Closure

#### 4.7.1 Post-Deployment Verification

| Check          | Method                 | Timeout    |
| -------------- | ---------------------- | ---------- |
| Health check   | `/api/health` endpoint | 5 minutes  |
| Error rate     | Sentry dashboard       | 30 minutes |
| Critical paths | Manual smoke test      | 15 minutes |
| Performance    | Response time metrics  | 30 minutes |

#### 4.7.2 Change Closure

| Element               | Requirement                 |
| --------------------- | --------------------------- |
| Deployment confirmed  | Health checks passing       |
| Documentation updated | If applicable               |
| Change record closed  | With actual completion time |
| Stakeholders notified | If user-facing change       |

## 5. Database Change Management

### 5.1 Migration Process

| Step | Action                     | Verification         |
| ---- | -------------------------- | -------------------- |
| 1    | Create migration file      | Prisma migrate dev   |
| 2    | Review migration SQL       | Peer review          |
| 3    | Test on local database     | Local verification   |
| 4    | Deploy to staging          | Staging verification |
| 5    | Create rollback script     | Test rollback        |
| 6    | Schedule production window | CAB approval         |
| 7    | Deploy to production       | Post-migration check |

### 5.2 Migration Requirements

| Requirement         | Description                    |
| ------------------- | ------------------------------ |
| Backward compatible | Old code works with new schema |
| Rollback script     | Tested before production       |
| Data preservation   | No data loss                   |
| Index review        | Performance impact assessed    |
| PHI considerations  | Encryption for new PHI fields  |

**Technical Implementation:**

- Migration files: `prisma/migrations/`
- Migration guide: `docs/database/MIGRATION_GUIDELINES.md`

## 6. Emergency Changes

### 6.1 Emergency Change Criteria

| Criteria                 | Examples                        |
| ------------------------ | ------------------------------- |
| Active security incident | Vulnerability being exploited   |
| Production outage        | Critical service unavailable    |
| Data integrity issue     | PHI at risk                     |
| Regulatory requirement   | Immediate compliance fix needed |

### 6.2 Emergency Change Process

| Step | Action                            | Timeline           |
| ---- | --------------------------------- | ------------------ |
| 1    | Declare emergency                 | Incident commander |
| 2    | Verbal approval from on-call lead | < 15 minutes       |
| 3    | Implement minimal fix             | As needed          |
| 4    | Deploy with expedited testing     | < 1 hour           |
| 5    | Verify fix                        | Immediate          |
| 6    | Document change                   | Within 24 hours    |
| 7    | Post-incident review              | Within 48 hours    |

### 6.3 Emergency Change Documentation

| Element                    | Timeline        |
| -------------------------- | --------------- |
| Change description         | Within 24 hours |
| Business justification     | Within 24 hours |
| Testing performed          | Within 24 hours |
| Approval record            | Within 24 hours |
| Post-implementation review | Within 5 days   |

## 7. Configuration Management

### 7.1 Configuration Items

| Item                  | Location               | Change Process        |
| --------------------- | ---------------------- | --------------------- |
| Application config    | `src/lib/config/`      | Normal change process |
| Environment variables | `.env.example`, Vercel | Secure change process |
| Feature flags         | Database/config        | Normal change process |
| Infrastructure        | `infrastructure/`      | Major change process  |

### 7.2 Environment Separation

| Environment | Purpose                | Data       | Access     |
| ----------- | ---------------------- | ---------- | ---------- |
| Development | Local development      | Synthetic  | Developers |
| Staging     | Pre-production testing | Anonymized | Team       |
| Production  | Live system            | Real PHI   | Restricted |

## 8. Compliance

### 8.1 SOC 2 Alignment

| SOC 2 Criteria | This Policy                           |
| -------------- | ------------------------------------- |
| CC6.8          | Change management process (Section 4) |
| CC7.1          | Change authorization (Section 4.4)    |
| CC7.2          | Change testing (Section 4.5)          |
| CC7.3          | Change implementation (Section 4.6)   |
| CC7.4          | Emergency changes (Section 6)         |
| CC8.1          | Configuration management (Section 7)  |

### 8.2 Audit Trail

All changes tracked via:

- Git commit history
- Pull request records
- CI/CD pipeline logs
- Deployment records
- Change tickets

## 9. Roles and Responsibilities

| Role           | Responsibilities                               |
| -------------- | ---------------------------------------------- |
| **CTO**        | Policy ownership, major change approval        |
| **CISO**       | Security change approval, compliance oversight |
| **DevOps**     | CI/CD pipeline, deployment execution           |
| **Team Leads** | Change review, normal approval                 |
| **Developers** | Change request, implementation, testing        |

## 10. Related Documents

| Document                    | Location                                        |
| --------------------------- | ----------------------------------------------- |
| Information Security Policy | `docs/policies/POL-001-INFORMATION-SECURITY.md` |
| Incident Response Policy    | `docs/policies/POL-003-INCIDENT-RESPONSE.md`    |
| Technical Change Guide      | `docs/CHANGE_MANAGEMENT.md`                     |
| Migration Guidelines        | `docs/database/MIGRATION_GUIDELINES.md`         |

## 11. Revision History

| Version | Date       | Author      | Changes                                  |
| ------- | ---------- | ----------- | ---------------------------------------- |
| 1.0     | 2026-01-31 | DevOps Team | Initial policy creation for SOC 2 Type I |

---

**Document Control:**  
This document is controlled. Printed copies are for reference only.  
Current version maintained at: `docs/policies/POL-006-CHANGE-MANAGEMENT.md`
