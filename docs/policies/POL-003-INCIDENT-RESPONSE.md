# Incident Response Policy

**Policy ID:** POL-003  
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

This policy establishes the incident response framework for identifying, containing, eradicating, and recovering from security incidents affecting EONPRO systems, with specific procedures for PHI breaches as required by HIPAA.

## 2. Scope

This policy covers:
- Security incidents (unauthorized access, malware, data breaches)
- Availability incidents (system outages, service degradation)
- PHI breaches and potential HIPAA violations
- Third-party security incidents affecting EONPRO

## 3. Incident Classification

### 3.1 Severity Levels

| Severity | Description | Examples | Response Time |
|----------|-------------|----------|---------------|
| **Critical (P1)** | Active threat, PHI breach, system-wide outage | Ransomware, unauthorized PHI access, production down | Immediate (< 15 min) |
| **High (P2)** | Significant security event, service degradation | Failed intrusion attempt, partial outage | < 1 hour |
| **Medium (P3)** | Security anomaly, contained incident | Suspicious activity, policy violation | < 4 hours |
| **Low (P4)** | Minor security event, informational | Failed logins, minor misconfigurations | < 24 hours |

### 3.2 Incident Categories

| Category | Description | HIPAA Reportable |
|----------|-------------|------------------|
| **Data Breach** | Unauthorized PHI access/disclosure | Yes |
| **Unauthorized Access** | Successful intrusion attempt | Depends on PHI access |
| **Malware** | Virus, ransomware, trojan | Depends on PHI access |
| **Denial of Service** | System availability impact | No |
| **Insider Threat** | Employee/contractor malicious action | Depends on PHI access |
| **Third-Party Breach** | Vendor/partner security incident | Depends on PHI exposure |

## 4. Incident Response Team

### 4.1 Team Structure

| Role | Responsibilities | Contact |
|------|-----------------|---------|
| **Incident Commander** | Overall incident management, communications | On-call rotation |
| **Security Lead** | Technical investigation, containment | Security team |
| **DevOps Lead** | Infrastructure response, recovery | DevOps team |
| **Legal/Compliance** | Regulatory assessment, notifications | Compliance officer |
| **Communications** | Internal/external communications | PR/Communications |
| **Executive Sponsor** | Strategic decisions, resource allocation | CEO/CTO |

### 4.2 Contact Information

| Team | Primary | Backup | Escalation |
|------|---------|--------|------------|
| Security | security@[company].com | [Phone] | PagerDuty |
| DevOps | devops@[company].com | [Phone] | PagerDuty |
| Legal | legal@[company].com | [Phone] | Direct call |
| Executive | [CEO email] | [CTO email] | Direct call |

## 5. Incident Response Phases

### 5.1 Phase 1: Detection & Identification

#### 5.1.1 Detection Sources

| Source | Description | Technical Implementation |
|--------|-------------|-------------------------|
| HIPAA Audit Logs | PHI access anomalies | `src/lib/audit/hipaa-audit.ts` |
| Sentry Alerts | Application errors, security events | `sentry.server.config.ts` |
| Health Checks | Service availability | `/api/health`, `/api/monitoring/ready` |
| User Reports | Suspicious activity reports | Support tickets |
| External Reports | Third-party notifications | Email, responsible disclosure |

#### 5.1.2 Detection Automation

**Automated Alerts:**
- Failed login threshold exceeded (>5 in 15 min)
- PHI access outside normal hours
- Unusual API access patterns
- Circuit breaker trips
- Error rate spikes

**Technical Implementation:**
- Prometheus rules: `infrastructure/monitoring/prometheus-rules.yaml`
- Security alerts: `triggerSecurityAlert()` in `hipaa-audit.ts`

#### 5.1.3 Initial Assessment Checklist

```
□ Incident type identified
□ Severity level assigned
□ Affected systems identified
□ PHI exposure assessment
□ Timeline established
□ Incident ticket created
□ Initial notification sent
```

### 5.2 Phase 2: Containment

#### 5.2.1 Immediate Containment Actions

| Incident Type | Immediate Actions |
|---------------|-------------------|
| **Compromised Account** | Disable account, revoke sessions, reset credentials |
| **Data Breach** | Isolate affected systems, preserve evidence |
| **Malware** | Isolate infected system, block IOCs |
| **DDoS** | Enable rate limiting, engage CDN protection |
| **Unauthorized Access** | Block source IP, review access logs |

#### 5.2.2 Technical Containment Capabilities

| Capability | Implementation | Location |
|------------|----------------|----------|
| Session termination | `terminateAllUserSessions()` | `session-manager.ts` |
| Account disable | Database user status update | Admin portal |
| IP blocking | WAF/CDN rules | Vercel/Cloudflare |
| Rate limiting | Dynamic rate limit adjustment | `rate-limiter.ts` |
| Circuit breaker | Manual trip for services | `circuitBreaker.ts` |

#### 5.2.3 Evidence Preservation

**Required Evidence:**
- HIPAA audit logs (export before any changes)
- Application logs (Sentry, server logs)
- Database audit trail
- Network logs (if available)
- System snapshots

**Preservation Steps:**
1. Export audit logs: `GET /api/admin/audit-logs?export=true`
2. Capture Sentry events
3. Create database snapshot
4. Document timeline with screenshots

### 5.3 Phase 3: Eradication

#### 5.3.1 Root Cause Analysis

| Step | Action | Documentation |
|------|--------|---------------|
| 1 | Identify entry point | Attack vector analysis |
| 2 | Determine scope | All affected systems/data |
| 3 | Identify vulnerabilities | Technical root cause |
| 4 | Document timeline | Complete incident timeline |

#### 5.3.2 Eradication Actions

| Finding | Remediation |
|---------|-------------|
| Compromised credentials | Reset all affected credentials |
| Vulnerable code | Emergency patch deployment |
| Misconfiguration | Configuration correction |
| Third-party vulnerability | Vendor notification, compensating controls |

### 5.4 Phase 4: Recovery

#### 5.4.1 Recovery Procedures

**Reference:** `docs/DISASTER_RECOVERY.md`

| Step | Action | Verification |
|------|--------|--------------|
| 1 | Restore from clean backup | Integrity check |
| 2 | Apply security patches | Vulnerability scan |
| 3 | Reset credentials | All affected accounts |
| 4 | Re-enable services | Staged rollout |
| 5 | Enhanced monitoring | 24-hour watch period |

#### 5.4.2 Recovery Objectives

| Metric | Target | Measurement |
|--------|--------|-------------|
| RTO (Recovery Time) | 4 hours | Time to service restoration |
| RPO (Recovery Point) | 1 hour | Maximum data loss |
| MTTR (Mean Time to Recovery) | 2 hours | Average recovery time |

### 5.5 Phase 5: Post-Incident

#### 5.5.1 Post-Incident Review

**Timeline:** Within 5 business days of incident closure

**Review Agenda:**
1. Incident timeline review
2. Response effectiveness assessment
3. Root cause analysis findings
4. Lessons learned
5. Improvement recommendations
6. Action item assignments

#### 5.5.2 Documentation Requirements

| Document | Content | Retention |
|----------|---------|-----------|
| Incident Report | Full incident details, timeline, impact | 6 years (HIPAA) |
| Root Cause Analysis | Technical findings, contributing factors | 6 years |
| Lessons Learned | Improvements, preventive measures | Permanent |
| Notification Records | All communications, regulatory filings | 6 years |

## 6. HIPAA Breach Notification

### 6.1 Breach Assessment

**Breach Definition (HIPAA):** Unauthorized acquisition, access, use, or disclosure of PHI that compromises security or privacy.

**Assessment Factors:**
1. Nature and extent of PHI involved
2. Unauthorized person(s) who accessed PHI
3. Whether PHI was actually acquired/viewed
4. Extent to which risk has been mitigated

### 6.2 Notification Requirements

| Affected Parties | Timeline | Method |
|------------------|----------|--------|
| **Individuals** | Without unreasonable delay, within 60 days | Written notice |
| **HHS OCR** | Within 60 days (>500 individuals: immediate) | OCR portal |
| **Media** | Within 60 days if >500 in state | Press release |
| **Business Associates** | Per BAA terms | Written notice |

### 6.3 Notification Content

**Required Elements:**
- Description of breach
- Types of information involved
- Steps individuals should take
- Steps taken to investigate and mitigate
- Contact information

## 7. Incident Logging

### 7.1 HIPAA Audit Log Events

**Logged Events (Technical Implementation in `hipaa-audit.ts`):**

| Event Type | Trigger |
|------------|---------|
| SECURITY_ALERT | Security incident detected |
| EMERGENCY_ACCESS | Break glass access granted |
| BREAK_GLASS | Emergency PHI access |
| LOGIN_FAILED | Authentication failure |
| PHI_VIEW | PHI accessed |
| PHI_EXPORT | PHI exported/downloaded |

### 7.2 Log Integrity

- SHA-256 hash for each audit entry
- Tamper detection via `verifyAuditIntegrity()`
- Immutable database storage
- 6-year retention for HIPAA compliance

## 8. Communication Plan

### 8.1 Internal Communications

| Severity | Notification | Frequency |
|----------|--------------|-----------|
| Critical | Immediate all-hands, executive briefing | Hourly updates |
| High | Team leads, affected departments | 4-hour updates |
| Medium | Security team, affected system owners | Daily updates |
| Low | Standard ticket updates | As needed |

### 8.2 External Communications

| Stakeholder | Criteria | Template |
|-------------|----------|----------|
| Customers | PHI breach affecting their data | Breach notification letter |
| Partners | Incident affecting shared services | Partner notification |
| Regulators | Reportable breach | HHS OCR submission |
| Media | Significant public impact | Press statement |

## 9. Testing and Training

### 9.1 Incident Response Testing

| Test Type | Frequency | Scope |
|-----------|-----------|-------|
| Tabletop exercise | Quarterly | Response procedures |
| Technical drill | Semi-annually | Containment capabilities |
| Full simulation | Annually | End-to-end response |

### 9.2 Training Requirements

| Role | Training | Frequency |
|------|----------|-----------|
| All employees | Security awareness | Annually |
| IR team members | Incident response procedures | Quarterly |
| Technical staff | Technical response capabilities | Semi-annually |

## 10. Related Documents

| Document | Location |
|----------|----------|
| Information Security Policy | `docs/policies/POL-001-INFORMATION-SECURITY.md` |
| Disaster Recovery Procedures | `docs/DISASTER_RECOVERY.md` |
| Business Continuity Policy | `docs/policies/POL-007-BUSINESS-CONTINUITY.md` |
| HIPAA Compliance Evidence | `docs/HIPAA_COMPLIANCE_EVIDENCE.md` |

## 11. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-31 | Security Team | Initial policy creation for SOC 2 Type I |

---

**Document Control:**  
This document is controlled. Printed copies are for reference only.  
Current version maintained at: `docs/policies/POL-003-INCIDENT-RESPONSE.md`
