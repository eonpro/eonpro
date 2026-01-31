# Risk Assessment Policy

**Policy ID:** POL-004  
**Version:** 1.0  
**Effective Date:** January 31, 2026  
**Last Review Date:** January 31, 2026  
**Next Review Date:** January 31, 2027  
**Classification:** INTERNAL  
**Owner:** Chief Information Security Officer (CISO)

---

## Document Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| CEO / Executive Sponsor | _________________ | _________________ | ________ |
| CISO / Security Lead | _________________ | _________________ | ________ |
| Compliance Officer | _________________ | _________________ | ________ |

---

## 1. Purpose

This policy establishes the framework for identifying, assessing, and managing information security risks to EONPRO systems and data, ensuring compliance with HIPAA Security Rule risk analysis requirements and SOC 2 Trust Service Criteria.

## 2. Scope

This policy applies to:
- All information systems processing, storing, or transmitting PHI
- All third-party systems and integrations
- All development, staging, and production environments
- All clinic tenants on the platform

## 3. Risk Assessment Framework

### 3.1 Risk Assessment Types

| Type | Trigger | Scope | Frequency |
|------|---------|-------|-----------|
| **Annual Comprehensive** | Scheduled | All systems and processes | Annually |
| **Targeted Assessment** | New system/integration | Specific system | Before deployment |
| **Change-Driven** | Significant change | Affected systems | Before implementation |
| **Incident-Driven** | Security incident | Related systems | Post-incident |
| **Vulnerability-Driven** | Critical vulnerability | Affected systems | As needed |

### 3.2 Risk Assessment Methodology

#### 3.2.1 Asset Identification

**Asset Categories:**

| Category | Examples | Criticality Factors |
|----------|----------|---------------------|
| **Data Assets** | PHI, credentials, audit logs | Sensitivity, volume, regulatory requirements |
| **Application Assets** | EONPRO platform, APIs | Business function, data processed |
| **Infrastructure Assets** | Servers, databases, networks | Availability requirements, data hosted |
| **Third-Party Assets** | Stripe, Lifefile, AWS | Data shared, integration criticality |

**EONPRO Critical Assets:**

| Asset | Classification | Owner | Technical Location |
|-------|----------------|-------|-------------------|
| Patient PHI | Confidential/PHI | Compliance Officer | PostgreSQL database |
| Authentication System | Critical | Security Team | `src/lib/auth/` |
| PHI Encryption Keys | Critical | Security Team | AWS KMS / Environment |
| Audit Logs | Compliance | Compliance Officer | `HIPAAAuditEntry` table |
| Payment Data | Confidential | Finance | Stripe (tokenized) |

#### 3.2.2 Threat Identification

**Threat Categories:**

| Category | Threats | Likelihood Factors |
|----------|---------|-------------------|
| **External Attackers** | Hackers, nation-state actors, hacktivists | Industry targeting, known vulnerabilities |
| **Insider Threats** | Malicious employees, negligent users | Access levels, monitoring gaps |
| **Third-Party Risks** | Vendor breaches, supply chain attacks | Vendor security posture, data sharing |
| **Natural/Environmental** | Disasters, power outages | Geographic location, redundancy |
| **Technical Failures** | Hardware failure, software bugs | System age, testing coverage |

#### 3.2.3 Vulnerability Assessment

**Assessment Methods:**

| Method | Frequency | Tools | Scope |
|--------|-----------|-------|-------|
| Automated scanning | Continuous (CI/CD) | Snyk, npm audit, Semgrep | Dependencies, code |
| Penetration testing | Annually | Third-party vendor | Full application |
| Configuration review | Quarterly | Manual + automated | Infrastructure |
| Code review | Every PR | CODEOWNERS, peer review | All code changes |

**Technical Implementation:**
- CI/CD security scanning: `.github/workflows/ci.yml`
- Dependency scanning: Snyk integration
- Secret scanning: TruffleHog
- SAST: Semgrep

#### 3.2.4 Risk Calculation

**Risk Score = Likelihood × Impact**

**Likelihood Scale:**

| Rating | Score | Definition | Annual Probability |
|--------|-------|------------|-------------------|
| Very High | 5 | Almost certain | >90% |
| High | 4 | Likely | 50-90% |
| Medium | 3 | Possible | 10-50% |
| Low | 2 | Unlikely | 1-10% |
| Very Low | 1 | Rare | <1% |

**Impact Scale:**

| Rating | Score | Definition | PHI Records | Financial | Reputation |
|--------|-------|------------|-------------|-----------|------------|
| Critical | 5 | Catastrophic | >10,000 | >$1M | National media |
| High | 4 | Major | 1,000-10,000 | $100K-$1M | Industry media |
| Medium | 3 | Moderate | 100-1,000 | $10K-$100K | Local awareness |
| Low | 2 | Minor | 10-100 | $1K-$10K | Internal only |
| Very Low | 1 | Negligible | <10 | <$1K | None |

**Risk Matrix:**

| | Impact 1 | Impact 2 | Impact 3 | Impact 4 | Impact 5 |
|---|----------|----------|----------|----------|----------|
| **Likelihood 5** | 5 (M) | 10 (M) | 15 (H) | 20 (C) | 25 (C) |
| **Likelihood 4** | 4 (L) | 8 (M) | 12 (H) | 16 (H) | 20 (C) |
| **Likelihood 3** | 3 (L) | 6 (M) | 9 (M) | 12 (H) | 15 (H) |
| **Likelihood 2** | 2 (L) | 4 (L) | 6 (M) | 8 (M) | 10 (M) |
| **Likelihood 1** | 1 (L) | 2 (L) | 3 (L) | 4 (L) | 5 (M) |

**Risk Levels:** C = Critical (20-25), H = High (12-19), M = Medium (5-11), L = Low (1-4)

### 3.3 Risk Treatment

#### 3.3.1 Treatment Options

| Option | Description | When to Use |
|--------|-------------|-------------|
| **Mitigate** | Implement controls to reduce risk | Risk exceeds tolerance, controls feasible |
| **Accept** | Document and monitor risk | Risk within tolerance, cost exceeds benefit |
| **Transfer** | Shift risk to third party | Insurance, outsourcing appropriate |
| **Avoid** | Eliminate risk source | Risk unacceptable, elimination possible |

#### 3.3.2 Treatment Timelines

| Risk Level | Treatment Timeline | Review Frequency |
|------------|-------------------|------------------|
| Critical | Immediate (24-72 hours) | Daily until resolved |
| High | 7 days | Weekly |
| Medium | 30 days | Monthly |
| Low | 90 days | Quarterly |

#### 3.3.3 Compensating Controls

When standard controls cannot be implemented:

1. Document control gap and business justification
2. Identify compensating controls
3. Assess residual risk with compensating controls
4. Obtain CISO approval
5. Set review timeline for permanent solution

## 4. Current Risk Register

### 4.1 Active Risks (Example Format)

| Risk ID | Risk Description | Asset | Threat | Likelihood | Impact | Score | Treatment | Owner | Status |
|---------|------------------|-------|--------|------------|--------|-------|-----------|-------|--------|
| R-001 | PHI breach via SQL injection | Patient data | External attacker | 2 | 5 | 10 (M) | Mitigated | Dev Team | Controlled |
| R-002 | Session hijacking | Auth system | External attacker | 2 | 4 | 8 (M) | Mitigated | Security | Controlled |
| R-003 | Third-party data breach | Vendor data | Supply chain | 3 | 4 | 12 (H) | Transferred | Compliance | Monitoring |
| R-004 | Service unavailability | Platform | Technical failure | 3 | 3 | 9 (M) | Mitigated | DevOps | Controlled |

### 4.2 Control Effectiveness

| Control Area | Control | Effectiveness | Evidence |
|--------------|---------|---------------|----------|
| Authentication | MFA, session management | High | `session-manager.ts`, Redis storage |
| Encryption | AES-256-GCM for PHI | High | `phi-encryption.ts`, 10 fields encrypted |
| Authorization | RBAC with 89 permissions | High | `permissions.ts`, middleware enforcement |
| Availability | Circuit breakers (4 services) | High | Stripe, Lifefile, SES, Twilio protected |
| Audit | HIPAA audit logging | High | `hipaa-audit.ts`, SHA-256 integrity |
| Change Mgmt | CI/CD with security gates | High | `.github/workflows/ci.yml` |

## 5. HIPAA Risk Analysis Requirements

### 5.1 Required Elements (45 CFR §164.308(a)(1)(ii)(A))

| Requirement | EONPRO Implementation | Evidence |
|-------------|----------------------|----------|
| Identify all ePHI | PHI fields documented | `DEFAULT_PHI_FIELDS` in phi-encryption.ts |
| Identify threats | Threat identification process | Risk register |
| Assess current controls | Control inventory | This policy, technical documentation |
| Determine likelihood | Risk scoring methodology | Section 3.2.4 |
| Determine impact | Impact assessment | Section 3.2.4 |
| Determine risk level | Risk calculation | Risk matrix |
| Document findings | Risk register | Section 4.1 |
| Implement controls | Treatment plan | Control implementation |
| Periodic review | Annual + triggered | Section 3.1 |

### 5.2 ePHI Inventory

| Data Element | Storage Location | Encryption | Access Control |
|--------------|------------------|------------|----------------|
| firstName | PostgreSQL | AES-256-GCM | Role-based, clinic-isolated |
| lastName | PostgreSQL | AES-256-GCM | Role-based, clinic-isolated |
| email | PostgreSQL | AES-256-GCM | Role-based, clinic-isolated |
| phone | PostgreSQL | AES-256-GCM | Role-based, clinic-isolated |
| dob | PostgreSQL | AES-256-GCM | Role-based, clinic-isolated |
| address1/2 | PostgreSQL | AES-256-GCM | Role-based, clinic-isolated |
| city/state/zip | PostgreSQL | AES-256-GCM | Role-based, clinic-isolated |
| SOAP notes | PostgreSQL | AES-256-GCM | Provider access only |
| Prescriptions | PostgreSQL | AES-256-GCM | Provider access only |

## 6. Third-Party Risk Assessment

### 6.1 Vendor Risk Categories

| Category | Criteria | Assessment Depth |
|----------|----------|------------------|
| **Critical** | PHI access, core functionality | Full security assessment, SOC 2 required |
| **High** | Indirect PHI, significant integration | Security questionnaire, SOC 2 preferred |
| **Medium** | No PHI, operational dependency | Basic due diligence |
| **Low** | No data access, minimal integration | Vendor review |

### 6.2 Current Third-Party Risk Assessment

| Vendor | Category | PHI Access | SOC 2 | Last Assessment | Next Review |
|--------|----------|------------|-------|-----------------|-------------|
| AWS | Critical | Yes (KMS, S3) | Yes | 2026-01 | 2026-07 |
| Stripe | Critical | PCI (tokenized) | Yes | 2026-01 | 2026-07 |
| Lifefile | Critical | Yes (pharmacy) | TBD | 2026-01 | 2026-04 |
| Twilio | High | Phone numbers | Yes | 2026-01 | 2026-07 |
| Vercel | High | Indirect | Yes | 2026-01 | 2026-07 |
| Sentry | Medium | Error data (scrubbed) | Yes | 2026-01 | 2027-01 |

## 7. Risk Reporting

### 7.1 Reporting Requirements

| Report | Audience | Frequency | Content |
|--------|----------|-----------|---------|
| Risk Dashboard | CISO, Executive | Real-time | Critical/high risks, trends |
| Risk Summary | Management | Monthly | Risk status, changes, metrics |
| Detailed Risk Report | Board/Audit | Quarterly | Full risk register, analysis |
| Compliance Report | Auditors | As needed | SOC 2, HIPAA evidence |

### 7.2 Key Risk Indicators (KRIs)

| KRI | Threshold | Current | Trend |
|-----|-----------|---------|-------|
| Open critical risks | 0 | 0 | Stable |
| Open high risks | <3 | 0 | Improved |
| Overdue risk treatments | 0 | 0 | Stable |
| Failed security scans | 0 | 0 | Stable |
| Vendor risks unassessed | 0 | 0 | Stable |

## 8. Roles and Responsibilities

| Role | Responsibilities |
|------|-----------------|
| **CISO** | Risk program ownership, risk acceptance authority |
| **Risk Committee** | Risk review, treatment prioritization |
| **Asset Owners** | Risk identification, treatment implementation |
| **Security Team** | Risk assessment execution, control monitoring |
| **All Employees** | Risk reporting, control compliance |

## 9. Related Documents

| Document | Location |
|----------|----------|
| Information Security Policy | `docs/policies/POL-001-INFORMATION-SECURITY.md` |
| Vendor Management Policy | `docs/policies/POL-005-VENDOR-MANAGEMENT.md` |
| Incident Response Policy | `docs/policies/POL-003-INCIDENT-RESPONSE.md` |
| HIPAA Compliance Evidence | `docs/HIPAA_COMPLIANCE_EVIDENCE.md` |

## 10. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-31 | Security Team | Initial policy creation for SOC 2 Type I |

---

**Document Control:**  
This document is controlled. Printed copies are for reference only.  
Current version maintained at: `docs/policies/POL-004-RISK-ASSESSMENT.md`
