# Data Retention and Disposal Policy

**Policy ID:** POL-008  
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

This policy establishes requirements for retaining and securely disposing of data processed by
EONPRO Telehealth Platform, ensuring compliance with HIPAA, state regulations, and business
requirements while minimizing data exposure risk.

## 2. Scope

This policy applies to:

- All data classifications (PHI, PII, business data)
- All storage locations (databases, files, backups, logs)
- All formats (digital and physical)
- All environments (production, staging, development)
- Vendor-held data

## 3. Data Classification

### 3.1 Data Categories

| Category        | Definition                          | Examples                                                    | Sensitivity |
| --------------- | ----------------------------------- | ----------------------------------------------------------- | ----------- |
| **PHI**         | Protected Health Information        | Patient records, prescriptions, SOAP notes, medical history | Highest     |
| **PII**         | Personally Identifiable Information | Names, addresses, phone, email, DOB                         | High        |
| **Financial**   | Payment and billing data            | Transaction records, invoices (card data tokenized)         | High        |
| **Credentials** | Authentication data                 | Passwords (hashed), tokens, API keys                        | Highest     |
| **Audit**       | Compliance and audit data           | HIPAA audit logs, access logs, security events              | High        |
| **Business**    | Operational data                    | Configurations, analytics, reports                          | Medium      |
| **Public**      | Non-sensitive data                  | Marketing content, public documentation                     | Low         |

### 3.2 Data Locations

| Location            | Data Types            | Owner     | Encryption                |
| ------------------- | --------------------- | --------- | ------------------------- |
| PostgreSQL Database | PHI, PII, Business    | Data Team | AES-256-GCM (field-level) |
| AWS S3              | Documents, Backups    | DevOps    | AES-256 (SSE)             |
| Redis Cache         | Sessions, Temp data   | DevOps    | In-transit only           |
| Logs (Sentry)       | Error data (scrubbed) | DevOps    | Provider encryption       |
| Logs (Server)       | Application logs      | DevOps    | Provider encryption       |
| Backups             | All data types        | DevOps    | Encrypted at rest         |

## 4. Retention Requirements

### 4.1 Retention Schedule

| Data Type                | Minimum Retention         | Maximum Retention | Legal Basis       | Disposal Method  |
| ------------------------ | ------------------------- | ----------------- | ----------------- | ---------------- |
| **Patient PHI**          | 6 years from last service | 10 years          | HIPAA, State laws | Secure deletion  |
| **Minor Patient PHI**    | Until age 21 + 6 years    | Age 21 + 10 years | State laws        | Secure deletion  |
| **Prescription Records** | 6 years                   | 10 years          | HIPAA, DEA        | Secure deletion  |
| **SOAP Notes**           | 6 years                   | 10 years          | HIPAA             | Secure deletion  |
| **HIPAA Audit Logs**     | 6 years                   | 7 years           | HIPAA §164.530(j) | Secure deletion  |
| **Security Logs**        | 1 year                    | 3 years           | SOC 2             | Secure deletion  |
| **Payment Records**      | 7 years                   | 10 years          | IRS, PCI          | Secure deletion  |
| **Employee Records**     | 7 years post-termination  | 10 years          | Employment law    | Secure deletion  |
| **Contracts/BAAs**       | 6 years post-expiration   | 10 years          | HIPAA             | Secure deletion  |
| **Backups**              | Per backup policy         | 12 months         | Business need     | Secure deletion  |
| **Session Data**         | Session duration          | 24 hours          | Business need     | Automatic expiry |
| **Temp/Cache Data**      | As needed                 | 7 days            | Business need     | Automatic expiry |

### 4.2 State-Specific Requirements

| State       | PHI Retention                             | Notes                     |
| ----------- | ----------------------------------------- | ------------------------- |
| California  | 7 years (adult), Age 19 + 7 years (minor) | Cal. Health & Safety Code |
| Texas       | 7 years                                   | Tex. Admin. Code          |
| Florida     | 5 years                                   | Florida Statutes          |
| New York    | 6 years                                   | NY Education Law          |
| **Default** | 6 years                                   | HIPAA minimum             |

### 4.3 Retention Exceptions

| Exception                 | Approval              | Documentation         |
| ------------------------- | --------------------- | --------------------- |
| Legal hold                | Legal counsel         | Written hold notice   |
| Ongoing investigation     | CISO + Legal          | Investigation record  |
| Regulatory inquiry        | Compliance            | Inquiry documentation |
| Patient request (shorter) | Not permitted for PHI | N/A                   |
| Patient request (longer)  | Compliance review     | Written request       |

## 5. Data Disposal

### 5.1 Disposal Methods

| Data Type            | Disposal Method                   | Verification               |
| -------------------- | --------------------------------- | -------------------------- |
| **Database Records** | Secure DELETE with audit          | Query verification         |
| **Encrypted Data**   | Key destruction + data deletion   | Verification script        |
| **Backups**          | Encrypted backup destruction      | Provider confirmation      |
| **Cache/Session**    | Automatic TTL expiry              | System verification        |
| **Log Files**        | Secure deletion per schedule      | Log rotation config        |
| **Physical Media**   | NIST 800-88 compliant destruction | Certificate of destruction |
| **Vendor Data**      | Per BAA requirements              | Written confirmation       |

### 5.2 Secure Deletion Standards

| Standard                  | Description                   | Application     |
| ------------------------- | ----------------------------- | --------------- |
| **NIST SP 800-88**        | Media sanitization guidelines | Physical media  |
| **DoD 5220.22-M**         | Overwrite standard            | Legacy systems  |
| **Cryptographic Erasure** | Key destruction               | Encrypted data  |
| **Database DELETE**       | Logical deletion              | Active database |

### 5.3 Disposal Process

#### 5.3.1 Standard Disposal

| Step | Action                              | Owner           | Verification           |
| ---- | ----------------------------------- | --------------- | ---------------------- |
| 1    | Identify data eligible for disposal | Data owner      | Retention schedule     |
| 2    | Verify no legal holds               | Legal           | Written confirmation   |
| 3    | Create disposal record              | Compliance      | Disposal log           |
| 4    | Execute disposal                    | IT              | Technical verification |
| 5    | Verify completion                   | IT + Compliance | Verification script    |
| 6    | Document disposal                   | Compliance      | Disposal certificate   |

#### 5.3.2 Emergency Disposal

Emergency data disposal (e.g., breach containment) requires:

1. CISO approval
2. Documented business justification
3. Legal review if PHI involved
4. Preservation of audit trail
5. Post-incident review

### 5.4 Disposal Documentation

| Element          | Requirement              |
| ---------------- | ------------------------ |
| Data description | Type, volume, date range |
| Disposal method  | Specific method used     |
| Disposal date    | Actual execution date    |
| Performed by     | Name and role            |
| Verified by      | Independent verification |
| Certificate      | For media destruction    |

## 6. Technical Implementation

### 6.1 Database Retention

**Patient Data Lifecycle:**

```typescript
// Retention check (conceptual)
function isEligibleForDisposal(patient: Patient): boolean {
  const retentionYears = patient.isMinor ? Math.max(6, 21 - patient.birthYear + 6) : 6;
  const lastServiceDate = patient.lastServiceDate;
  const disposalDate = addYears(lastServiceDate, retentionYears);
  return new Date() > disposalDate;
}
```

**Audit Log Retention:**

```sql
-- Retention policy for HIPAAAuditEntry
-- 6 years minimum, 7 years maximum
DELETE FROM "HIPAAAuditEntry"
WHERE "timestamp" < NOW() - INTERVAL '7 years'
AND NOT EXISTS (
  SELECT 1 FROM legal_holds
  WHERE entity_type = 'audit' AND entity_id = "HIPAAAuditEntry".id
);
```

### 6.2 Backup Retention

| Backup Type      | Retention | Disposal           |
| ---------------- | --------- | ------------------ |
| Daily snapshots  | 7 days    | Automatic rotation |
| Weekly archives  | 4 weeks   | Automatic rotation |
| Monthly archives | 12 months | Automatic rotation |
| Annual archives  | 7 years   | Manual disposal    |

### 6.3 Session Data

**Redis TTL Configuration:**

```typescript
// src/lib/auth/session-manager.ts
const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours

// Sessions automatically expire via Redis TTL
await cache.set(sessionKey, session, SESSION_TTL_SECONDS);
```

### 6.4 Log Rotation

| Log Type            | Rotation       | Retention | Location     |
| ------------------- | -------------- | --------- | ------------ |
| Application logs    | Daily          | 30 days   | Vercel       |
| Error logs (Sentry) | Event-based    | 90 days   | Sentry       |
| Audit logs          | N/A (database) | 6-7 years | PostgreSQL   |
| Access logs         | Daily          | 90 days   | CDN provider |

## 7. Vendor Data Disposal

### 7.1 Vendor Requirements

| Requirement       | Contract Provision                 |
| ----------------- | ---------------------------------- |
| Data return       | Upon request or termination        |
| Secure disposal   | NIST 800-88 or equivalent          |
| Disposal timeline | Within 30 days of termination      |
| Certification     | Written certificate of destruction |
| Backup disposal   | Include all backup copies          |

### 7.2 Vendor Disposal Tracking

| Vendor   | Data Types               | Disposal Provision     | Last Verified     |
| -------- | ------------------------ | ---------------------- | ----------------- |
| AWS      | Infrastructure data      | Standard AWS deletion  | Annual BAA review |
| Stripe   | Payment data (tokenized) | PCI-compliant disposal | Annual review     |
| Lifefile | Prescription data        | BAA disposal clause    | Annual review     |
| Vercel   | Application data         | DPA disposal clause    | Annual review     |
| Sentry   | Error data (scrubbed)    | DPA disposal clause    | Annual review     |

## 8. Data Subject Rights

### 8.1 Patient Rights

| Right       | EONPRO Response                           | Limitation         |
| ----------- | ----------------------------------------- | ------------------ |
| Access      | Provide copy of records                   | Within 30 days     |
| Correction  | Amend inaccurate data                     | With documentation |
| Deletion    | Cannot delete PHI within retention period | HIPAA requirement  |
| Portability | Export in standard format                 | Within 30 days     |

### 8.2 Deletion Requests

**For PHI:**

- Cannot honor deletion requests during retention period
- Explain HIPAA retention requirements to patient
- Document request and response

**For Non-PHI:**

- Evaluate against retention schedule
- Execute if no retention requirement
- Document request and outcome

## 9. Monitoring and Audit

### 9.1 Retention Monitoring

| Activity                     | Frequency | Owner           |
| ---------------------------- | --------- | --------------- |
| Retention schedule review    | Annual    | Compliance      |
| Disposal execution audit     | Quarterly | IT + Compliance |
| Vendor disposal verification | Annual    | Procurement     |
| Legal hold review            | Quarterly | Legal           |

### 9.2 Audit Trail

All data disposal activities logged in HIPAA audit system:

```typescript
// Disposal audit logging
await auditLog(request, {
  eventType: AuditEventType.PHI_DELETE,
  action: 'DATA_DISPOSAL',
  resourceType: 'patient',
  resourceId: patientId,
  outcome: 'SUCCESS',
  metadata: {
    disposalMethod: 'secure_delete',
    retentionPeriodMet: true,
    verifiedBy: adminEmail,
  },
});
```

## 10. Compliance

### 10.1 HIPAA Requirements

| HIPAA Provision      | This Policy                                      |
| -------------------- | ------------------------------------------------ |
| §164.530(j)          | 6-year retention for documentation (Section 4.1) |
| §164.530(c)          | Safeguards during retention (Section 6)          |
| §164.524             | Patient access rights (Section 8.1)              |
| §164.526             | Amendment rights (Section 8.1)                   |
| §164.314(a)(2)(i)(A) | BAA data return/destruction (Section 7)          |

### 10.2 SOC 2 Requirements

| SOC 2 Criteria | This Policy                     |
| -------------- | ------------------------------- |
| C1.1           | Data classification (Section 3) |
| C1.2           | Disposal procedures (Section 5) |
| PI1.2          | Data integrity during retention |

## 11. Roles and Responsibilities

| Role            | Responsibilities                                       |
| --------------- | ------------------------------------------------------ |
| **CISO**        | Policy ownership, disposal approval for sensitive data |
| **Compliance**  | Retention schedule management, audit                   |
| **Data Owners** | Identify data for disposal, verify eligibility         |
| **IT/DevOps**   | Execute disposal, technical verification               |
| **Legal**       | Legal hold management, regulatory guidance             |
| **Procurement** | Vendor disposal requirements                           |

## 12. Related Documents

| Document                    | Location                                        |
| --------------------------- | ----------------------------------------------- |
| Information Security Policy | `docs/policies/POL-001-INFORMATION-SECURITY.md` |
| Vendor Management Policy    | `docs/policies/POL-005-VENDOR-MANAGEMENT.md`    |
| Incident Response Policy    | `docs/policies/POL-003-INCIDENT-RESPONSE.md`    |
| HIPAA Compliance Evidence   | `docs/HIPAA_COMPLIANCE_EVIDENCE.md`             |

## 13. Revision History

| Version | Date       | Author          | Changes                                  |
| ------- | ---------- | --------------- | ---------------------------------------- |
| 1.0     | 2026-01-31 | Compliance Team | Initial policy creation for SOC 2 Type I |

---

**Document Control:**  
This document is controlled. Printed copies are for reference only.  
Current version maintained at: `docs/policies/POL-008-DATA-RETENTION.md`
