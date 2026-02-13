# Vendor Management Policy

**Policy ID:** POL-005  
**Version:** 1.0  
**Effective Date:** January 31, 2026  
**Last Review Date:** January 31, 2026  
**Next Review Date:** January 31, 2027  
**Classification:** INTERNAL  
**Owner:** Chief Information Security Officer (CISO)

---

## Document Approval

| Role                    | Name               | Signature          | Date         |
| ----------------------- | ------------------ | ------------------ | ------------ |
| CEO / Executive Sponsor | ********\_******** | ********\_******** | **\_\_\_\_** |
| CISO / Security Lead    | ********\_******** | ********\_******** | **\_\_\_\_** |
| Compliance Officer      | ********\_******** | ********\_******** | **\_\_\_\_** |

---

## 1. Purpose

This policy establishes requirements for evaluating, selecting, managing, and monitoring third-party
vendors who have access to EONPRO systems or data, with particular emphasis on vendors handling
Protected Health Information (PHI).

## 2. Scope

This policy applies to:

- All third-party vendors, suppliers, and service providers
- All systems and services that process, store, or transmit EONPRO data
- All Business Associates under HIPAA
- SaaS, PaaS, and IaaS providers
- Contractors and consultants with system access

## 3. Vendor Classification

### 3.1 Risk Tiers

| Tier                  | Criteria                                               | Due Diligence                           | Review Cycle  |
| --------------------- | ------------------------------------------------------ | --------------------------------------- | ------------- |
| **Tier 1 - Critical** | PHI access, core platform function, >$100K/year        | Full assessment, SOC 2 Type II required | Semi-annually |
| **Tier 2 - High**     | Indirect PHI, significant integration, $25K-$100K/year | Security questionnaire, SOC 2 preferred | Annually      |
| **Tier 3 - Medium**   | No PHI, operational dependency, $5K-$25K/year          | Basic questionnaire                     | Annually      |
| **Tier 4 - Low**      | No data access, minimal integration, <$5K/year         | Vendor review                           | Biannually    |

### 3.2 Current Vendor Inventory

| Vendor       | Service                             | Tier | PHI Access     | BAA Required | SOC 2   | Status |
| ------------ | ----------------------------------- | ---- | -------------- | ------------ | ------- | ------ |
| **AWS**      | Cloud infrastructure (KMS, S3, SES) | 1    | Yes            | Yes          | Type II | Active |
| **Stripe**   | Payment processing                  | 1    | No (tokenized) | No (PCI)     | Type II | Active |
| **Lifefile** | Pharmacy fulfillment                | 1    | Yes            | Yes          | Pending | Active |
| **Vercel**   | Application hosting                 | 1    | Indirect       | Yes          | Type II | Active |
| **Twilio**   | SMS communications                  | 2    | Phone numbers  | Yes          | Type II | Active |
| **Sentry**   | Error monitoring                    | 2    | Scrubbed       | Yes          | Type II | Active |
| **OpenAI**   | AI services                         | 2    | Anonymized     | No           | Type II | Active |
| **GitHub**   | Source control                      | 2    | No             | No           | Type II | Active |
| **Snyk**     | Security scanning                   | 3    | Code only      | No           | Type II | Active |

## 4. Vendor Selection Process

### 4.1 Pre-Engagement Assessment

#### 4.1.1 Security Assessment Requirements

| Tier       | Required Documentation                                                  |
| ---------- | ----------------------------------------------------------------------- |
| **Tier 1** | SOC 2 Type II, penetration test, security questionnaire, BAA, insurance |
| **Tier 2** | SOC 2 (Type I or II), security questionnaire, BAA if PHI                |
| **Tier 3** | Security questionnaire, privacy policy review                           |
| **Tier 4** | Privacy policy review, basic due diligence                              |

#### 4.1.2 Security Questionnaire Topics

| Category                | Assessment Areas                                         |
| ----------------------- | -------------------------------------------------------- |
| **Access Control**      | Authentication, authorization, MFA, privileged access    |
| **Data Protection**     | Encryption (rest/transit), key management, data handling |
| **Network Security**    | Firewalls, segmentation, intrusion detection             |
| **Incident Response**   | IR plan, breach notification, SLAs                       |
| **Business Continuity** | DR plan, backups, RTO/RPO                                |
| **Compliance**          | SOC 2, HIPAA, PCI, certifications                        |
| **Subcontractors**      | Fourth-party management, flow-down requirements          |

#### 4.1.3 Technical Security Review

For Tier 1 and 2 vendors with API integration:

| Review Area    | Assessment                                             |
| -------------- | ------------------------------------------------------ |
| API security   | Authentication method, rate limiting, input validation |
| Data exchange  | Encryption, data minimization, format validation       |
| Error handling | Error exposure, logging practices                      |
| Availability   | SLA, circuit breaker integration                       |

**EONPRO Implementation:**

```
Vendor integrations protected by circuit breakers:
- Stripe: src/services/stripe/paymentService.ts
- Lifefile: src/lib/lifefile.ts
- AWS SES: src/lib/integrations/aws/sesService.ts
- Twilio: src/lib/integrations/twilio/smsService.ts
```

### 4.2 Contract Requirements

#### 4.2.1 Required Contract Provisions

| Provision                  | Tier 1   | Tier 2      | Tier 3      | Tier 4      |
| -------------------------- | -------- | ----------- | ----------- | ----------- |
| Security requirements      | Required | Required    | Recommended | Optional    |
| Breach notification SLA    | Required | Required    | Required    | Optional    |
| Right to audit             | Required | Required    | Recommended | Optional    |
| Subcontractor restrictions | Required | Required    | Recommended | Optional    |
| Data handling/return       | Required | Required    | Required    | Recommended |
| Insurance minimums         | Required | Recommended | Optional    | Optional    |
| Termination rights         | Required | Required    | Required    | Required    |

#### 4.2.2 Business Associate Agreements (BAA)

**Required when vendor:**

- Accesses, creates, maintains, or transmits PHI
- Provides services involving PHI on behalf of EONPRO
- Acts as a subcontractor to another Business Associate

**BAA Required Elements:**

- Permitted uses and disclosures of PHI
- Safeguards requirement
- Reporting requirements
- Subcontractor requirements
- Access to PHI for accounting
- Amendment of PHI
- Return/destruction of PHI
- Breach notification (within 24-72 hours)

### 4.3 Approval Process

| Step | Action                       | Owner                               | Timeline  |
| ---- | ---------------------------- | ----------------------------------- | --------- |
| 1    | Business need documented     | Requestor                           | -         |
| 2    | Vendor classification        | Procurement                         | 2 days    |
| 3    | Security assessment          | Security Team                       | 5-10 days |
| 4    | Legal review                 | Legal                               | 5 days    |
| 5    | BAA execution (if required)  | Legal                               | 5 days    |
| 6    | Technical integration review | DevOps                              | 3-5 days  |
| 7    | Final approval               | CISO (Tier 1-2), Manager (Tier 3-4) | 2 days    |
| 8    | Vendor onboarding            | IT                                  | 3 days    |

## 5. Ongoing Vendor Management

### 5.1 Monitoring Requirements

| Activity               | Tier 1      | Tier 2      | Tier 3    | Tier 4    |
| ---------------------- | ----------- | ----------- | --------- | --------- |
| SOC 2 report review    | Semi-annual | Annual      | N/A       | N/A       |
| Security questionnaire | Annual      | Annual      | Biannual  | N/A       |
| Performance review     | Quarterly   | Semi-annual | Annual    | Annual    |
| Access review          | Quarterly   | Semi-annual | Annual    | Annual    |
| Incident review        | Continuous  | Continuous  | As needed | As needed |

### 5.2 Vendor Performance Metrics

| Metric                 | Target                             | Measurement         |
| ---------------------- | ---------------------------------- | ------------------- |
| Uptime SLA             | Per contract (typically 99.9%)     | Monthly monitoring  |
| Incident response      | Per contract (typically 1-4 hours) | Incident tracking   |
| Breach notification    | 24-72 hours                        | Contract/BAA        |
| Security scan findings | No critical/high                   | SOC 2 report review |

### 5.3 Issue Management

| Issue Severity             | Response                                      | Escalation     |
| -------------------------- | --------------------------------------------- | -------------- |
| Critical (active breach)   | Immediate containment, executive notification | CISO → CEO     |
| High (compliance gap)      | 7-day remediation plan                        | CISO           |
| Medium (performance issue) | 30-day remediation                            | Vendor Manager |
| Low (minor issue)          | 90-day remediation                            | Vendor Manager |

## 6. Vendor Security Integration

### 6.1 Technical Controls

| Control            | Implementation                     | Vendor Application    |
| ------------------ | ---------------------------------- | --------------------- |
| Circuit breakers   | Timeout, fallback, error threshold | All API integrations  |
| Rate limiting      | Request throttling                 | Outbound API calls    |
| Secret management  | Environment variables, KMS         | API keys, credentials |
| Webhook validation | HMAC signature verification        | Inbound webhooks      |
| Audit logging      | All vendor interactions logged     | All integrations      |

**Technical Implementation:**

```typescript
// Circuit breaker configuration (src/lib/resilience/circuitBreaker.ts)
const circuitBreakers = {
  stripe: { timeout: 30s, errorThreshold: 30% },
  lifefile: { timeout: 20s, errorThreshold: 40% },
  email: { timeout: 10s, errorThreshold: 80% },
  sms: { timeout: 10s, errorThreshold: 70% },
};
```

### 6.2 Data Minimization

| Vendor   | Data Shared         | Minimization Controls                       |
| -------- | ------------------- | ------------------------------------------- |
| Stripe   | Payment info        | Tokenization, no PHI                        |
| Lifefile | Patient info for Rx | Required for fulfillment, encrypted transit |
| Twilio   | Phone numbers       | SMS content anonymized                      |
| Sentry   | Error data          | PHI scrubbed before transmission            |
| OpenAI   | Prompts             | PHI anonymized before transmission          |

**Technical Implementation:**

- Sentry scrubbing: `sentry.server.config.ts` (lines 86-118)
- PHI anonymization: `src/lib/security/phi-anonymization.ts`

## 7. Vendor Termination

### 7.1 Termination Procedures

| Step | Action                          | Owner           | Timeline     |
| ---- | ------------------------------- | --------------- | ------------ |
| 1    | Termination notice per contract | Legal           | Per contract |
| 2    | Access revocation               | IT              | Immediate    |
| 3    | Data return/destruction         | Vendor + EONPRO | 30 days      |
| 4    | Certificate of destruction      | Vendor          | 30 days      |
| 5    | Integration decommission        | DevOps          | Per plan     |
| 6    | Final audit                     | Security        | 30 days      |
| 7    | Close vendor record             | Procurement     | 30 days      |

### 7.2 Data Return Requirements

| Data Type      | Return Method                            | Destruction Verification |
| -------------- | ---------------------------------------- | ------------------------ |
| PHI            | Encrypted transfer or secure destruction | Written certification    |
| Credentials    | Rotation/revocation                      | System verification      |
| Configurations | Documentation return                     | Verification             |
| Backups        | Destruction per schedule                 | Written certification    |

## 8. Fourth-Party Management

### 8.1 Subcontractor Requirements

| Requirement                        | Tier 1 Vendors | Tier 2 Vendors |
| ---------------------------------- | -------------- | -------------- |
| Notification of subcontractors     | Required       | Required       |
| Approval of key subcontractors     | Required       | Recommended    |
| Flow-down of security requirements | Required       | Required       |
| Subcontractor audit rights         | Required       | Recommended    |

### 8.2 Current Fourth-Party Awareness

| Vendor | Known Subcontractors | Data Access              |
| ------ | -------------------- | ------------------------ |
| AWS    | Various AWS services | Infrastructure           |
| Vercel | AWS (hosting)        | Application data         |
| Stripe | Payment networks     | Payment data (PCI scope) |

## 9. Compliance Alignment

### 9.1 HIPAA Requirements

| HIPAA Requirement | This Policy                                    |
| ----------------- | ---------------------------------------------- |
| §164.308(b)(1)    | BAA requirements (Section 4.2.2)               |
| §164.308(b)(4)    | Satisfactory assurance (Section 4.1)           |
| §164.314(a)       | BAA content requirements (Section 4.2.2)       |
| §164.502(e)       | Permissible disclosures to BAs (Section 4.2.2) |

### 9.2 SOC 2 Requirements

| SOC 2 Criteria | This Policy                           |
| -------------- | ------------------------------------- |
| CC3.1          | Risk assessment process (Section 4.1) |
| CC3.4          | Risk mitigation (Section 6)           |
| CC9.1          | Vendor identification (Section 3.2)   |
| CC9.2          | Vendor assessment (Section 4.1)       |

## 10. Roles and Responsibilities

| Role                | Responsibilities                                     |
| ------------------- | ---------------------------------------------------- |
| **CISO**            | Policy ownership, Tier 1-2 approvals, risk oversight |
| **Procurement**     | Vendor classification, contract management           |
| **Legal**           | Contract review, BAA execution                       |
| **Security Team**   | Security assessments, monitoring                     |
| **DevOps**          | Technical integration, circuit breakers              |
| **Business Owners** | Vendor need justification, performance management    |

## 11. Related Documents

| Document                    | Location                                        |
| --------------------------- | ----------------------------------------------- |
| Risk Assessment Policy      | `docs/policies/POL-004-RISK-ASSESSMENT.md`      |
| Information Security Policy | `docs/policies/POL-001-INFORMATION-SECURITY.md` |
| Incident Response Policy    | `docs/policies/POL-003-INCIDENT-RESPONSE.md`    |
| HIPAA Compliance Evidence   | `docs/HIPAA_COMPLIANCE_EVIDENCE.md`             |

## 12. Revision History

| Version | Date       | Author        | Changes                                  |
| ------- | ---------- | ------------- | ---------------------------------------- |
| 1.0     | 2026-01-31 | Security Team | Initial policy creation for SOC 2 Type I |

---

**Document Control:**  
This document is controlled. Printed copies are for reference only.  
Current version maintained at: `docs/policies/POL-005-VENDOR-MANAGEMENT.md`
