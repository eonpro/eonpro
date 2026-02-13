# Access Control Policy

**Policy ID:** POL-002  
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

This policy establishes requirements for controlling access to EONPRO information systems and data
to ensure that access is granted based on business need and principle of least privilege, protecting
PHI and sensitive business information.

## 2. Scope

This policy applies to:

- All user accounts (employees, contractors, administrators)
- All system accounts (service accounts, API credentials)
- All access to production, staging, and development environments
- All clinic tenant data and administrative functions

## 3. Policy Statements

### 3.1 Access Control Principles

1. **Least Privilege**: Users receive minimum access required for job functions
2. **Need-to-Know**: Access to PHI limited to those with legitimate business need
3. **Separation of Duties**: Critical functions divided among multiple individuals
4. **Default Deny**: Access denied by default unless explicitly granted

### 3.2 User Account Management

#### 3.2.1 Account Provisioning

| Step | Requirement                                       | Verification            |
| ---- | ------------------------------------------------- | ----------------------- |
| 1    | Access request submitted through ticketing system | Ticket ID required      |
| 2    | Manager approval for requested access level       | Written approval        |
| 3    | Access limited to role requirements               | Role-based assignment   |
| 4    | Account created with temporary password           | Password reset required |
| 5    | Access documented in user registry                | Audit trail created     |

#### 3.2.2 Account Types and Roles

| Role            | Description                | Permissions                             | Multi-Clinic Access  |
| --------------- | -------------------------- | --------------------------------------- | -------------------- |
| **super_admin** | System-wide administration | Full system access                      | All clinics          |
| **admin**       | Clinic administration      | Clinic management, user management      | Assigned clinic only |
| **provider**    | Healthcare provider        | Patient care, prescriptions, SOAP notes | Assigned clinic only |
| **staff**       | Clinical staff             | Patient management, scheduling          | Assigned clinic only |
| **patient**     | Patient portal user        | Own records only                        | Own data only        |

**Technical Implementation:**

- Role definitions: `src/lib/auth/permissions.ts`
- 89 granular permissions across 9 resource categories
- Role enforcement: `src/lib/auth/middleware.ts`

#### 3.2.3 Account Deprovisioning

| Trigger                 | Timeline           | Actions                                        |
| ----------------------- | ------------------ | ---------------------------------------------- |
| Voluntary termination   | End of last day    | Disable account, revoke sessions               |
| Involuntary termination | Immediate          | Disable account, revoke sessions, audit access |
| Role change             | Same day           | Adjust permissions to new role                 |
| Extended leave          | Day of leave start | Disable account temporarily                    |

**Technical Implementation:**

- Session termination: `terminateAllUserSessions()` in `session-manager.ts`
- Token revocation: Token versioning mechanism

### 3.3 Authentication Requirements

#### 3.3.1 Password Policy

| Requirement    | Standard                                        |
| -------------- | ----------------------------------------------- |
| Minimum length | 12 characters                                   |
| Complexity     | Uppercase, lowercase, number, special character |
| History        | Cannot reuse last 12 passwords                  |
| Maximum age    | 90 days                                         |
| Lockout        | 5 failed attempts, 15-minute lockout            |

**Technical Implementation:**

- Password validation: `src/lib/auth/config.ts`
- Lockout: Rate limiting in `src/lib/security/rate-limiter.ts`

#### 3.3.2 Multi-Factor Authentication (MFA)

| Access Type                           | MFA Requirement        |
| ------------------------------------- | ---------------------- |
| Production admin access               | Required               |
| PHI access (first access per session) | Required               |
| API access with service accounts      | API key + IP allowlist |
| Patient portal                        | Optional (recommended) |

#### 3.3.3 Session Management

| Parameter                | Value              | Rationale                   |
| ------------------------ | ------------------ | --------------------------- |
| Session idle timeout     | 4 hours            | HIPAA workstation security  |
| Absolute session timeout | 8 hours            | Prevent indefinite sessions |
| Concurrent sessions      | 1 per user         | Prevent credential sharing  |
| Session storage          | Redis (production) | Distributed, revocable      |

**Technical Implementation:**

- Session manager: `src/lib/auth/session-manager.ts`
- Redis storage: `src/lib/cache/redis.ts`

### 3.4 Authorization Controls

#### 3.4.1 Role-Based Access Control (RBAC)

Access controlled by role assignments with granular permissions:

| Permission Category | Example Permissions                                                |
| ------------------- | ------------------------------------------------------------------ |
| User Management     | user:create, user:read, user:update, user:delete, user:assign-role |
| Patient Management  | patient:create, patient:read, patient:update, patient:delete       |
| Provider Management | provider:create, provider:read, provider:update                    |
| Order Management    | order:create, order:read, order:update, order:cancel               |
| SOAP Notes          | soap:create, soap:read, soap:update, soap:approve                  |
| Billing             | billing:view, billing:manage, refund:process                       |
| System Admin        | system:settings, system:audit, system:integrations                 |

**Technical Implementation:**

- Permission checks: `hasPermission()` in `src/lib/auth/permissions.ts`
- Middleware enforcement: `withAuth({ permissions: [...] })`

#### 3.4.2 Multi-Tenant Clinic Isolation

| Principle           | Implementation                                 |
| ------------------- | ---------------------------------------------- |
| Data isolation      | All queries filtered by clinicId               |
| Context enforcement | AsyncLocalStorage for thread-safe context      |
| Super admin bypass  | Explicit null clinicId for cross-clinic access |
| Audit trail         | Clinic context logged in all audit entries     |

**Technical Implementation:**

- Clinic context: `src/lib/db.ts` with Prisma middleware
- Context setting: `runWithClinicContext()` in middleware

### 3.5 Privileged Access Management

#### 3.5.1 Administrative Access

| Control                  | Requirement                         |
| ------------------------ | ----------------------------------- |
| Dedicated admin accounts | Separate from daily-use accounts    |
| Enhanced logging         | All admin actions logged            |
| Time-limited access      | Admin sessions expire after 4 hours |
| Access review            | Quarterly review of admin accounts  |

#### 3.5.2 Emergency Access (Break Glass)

| Step | Action                                     | Documentation                 |
| ---- | ------------------------------------------ | ----------------------------- |
| 1    | Emergency declared by authorized personnel | Incident ticket               |
| 2    | Emergency access granted with logging      | Audit event: EMERGENCY_ACCESS |
| 3    | Actions performed under supervision        | All actions logged            |
| 4    | Access revoked immediately after           | Session terminated            |
| 5    | Post-incident review                       | Incident report filed         |

**Technical Implementation:**

- Emergency access logging: `AuditEventType.EMERGENCY_ACCESS` in `hipaa-audit.ts`
- Break glass event: `AuditEventType.BREAK_GLASS`

### 3.6 API Access Control

#### 3.6.1 API Authentication

| Method            | Use Case           | Security            |
| ----------------- | ------------------ | ------------------- |
| JWT Bearer Token  | User sessions      | Short-lived, signed |
| API Key + Secret  | Service-to-service | Rotated quarterly   |
| Webhook Signature | Inbound webhooks   | HMAC verification   |

#### 3.6.2 API Authorization

- All API routes require authentication (97/125 routes)
- 28 routes intentionally public (health checks, auth endpoints, webhooks)
- Webhook routes validate signatures before processing

**Technical Implementation:**

- API protection: `withAuth`, `withAdminAuth`, `withClinicalAuth` wrappers
- Webhook validation: HMAC signature verification

### 3.7 Access Reviews

| Review Type              | Frequency | Scope                       | Owner    |
| ------------------------ | --------- | --------------------------- | -------- |
| User access review       | Quarterly | All user accounts           | Managers |
| Privileged access review | Monthly   | Admin and super_admin       | CISO     |
| Service account review   | Quarterly | All API credentials         | DevOps   |
| Terminated user audit    | Monthly   | Access removal verification | HR + IT  |

## 4. Roles and Responsibilities

| Role                  | Responsibilities                                              |
| --------------------- | ------------------------------------------------------------- |
| **CISO**              | Policy ownership, access review oversight                     |
| **IT Administration** | Account provisioning/deprovisioning, access implementation    |
| **Managers**          | Access request approval, quarterly access reviews             |
| **HR**                | Termination notification, onboarding/offboarding coordination |
| **All Users**         | Protect credentials, report unauthorized access               |

## 5. Compliance

### 5.1 Regulatory Alignment

| Requirement          | This Policy                                 |
| -------------------- | ------------------------------------------- |
| HIPAA §164.312(a)(1) | Access Control - Unique user identification |
| HIPAA §164.312(d)    | Person or Entity Authentication             |
| SOC 2 CC6.1          | Logical and Physical Access Controls        |
| SOC 2 CC6.2          | Prior to Issuing Credentials                |
| SOC 2 CC6.3          | Internal and External User Access           |

### 5.2 Enforcement

Violations may result in:

- Immediate access revocation
- Disciplinary action
- Incident investigation
- Legal action if PHI compromised

## 6. Related Documents

| Document                    | Location                                        |
| --------------------------- | ----------------------------------------------- |
| Information Security Policy | `docs/policies/POL-001-INFORMATION-SECURITY.md` |
| Incident Response Policy    | `docs/policies/POL-003-INCIDENT-RESPONSE.md`    |
| HIPAA Compliance Evidence   | `docs/HIPAA_COMPLIANCE_EVIDENCE.md`             |
| API Security Audit          | `docs/SECURITY_AUDIT_API_ROUTES.md`             |

## 7. Revision History

| Version | Date       | Author        | Changes                                  |
| ------- | ---------- | ------------- | ---------------------------------------- |
| 1.0     | 2026-01-31 | Security Team | Initial policy creation for SOC 2 Type I |

---

**Document Control:**  
This document is controlled. Printed copies are for reference only.  
Current version maintained at: `docs/policies/POL-002-ACCESS-CONTROL.md`
