# HIPAA Compliance Test Suite

## Automated Test Implementation

### 1. Access Control Tests

**File:** `tests/hipaa/access-control.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestUser, createTestPatient, getAuthToken } from '../helpers';
import { prisma } from '@/lib/db';

describe('HIPAA Access Control', () => {
  let patientUser: any;
  let providerUser: any;
  let adminUser: any;
  let patient1: any;
  let patient2: any;
  
  beforeAll(async () => {
    // Create test users and patients
    patientUser = await createTestUser('patient');
    providerUser = await createTestUser('provider');
    adminUser = await createTestUser('admin');
    
    patient1 = await createTestPatient({ userId: patientUser.id, clinicId: 1 });
    patient2 = await createTestPatient({ userId: null, clinicId: 1 });
  });
  
  describe('Patient Access Control', () => {
    it('patient can only access their own records', async () => {
      const token = await getAuthToken(patientUser);
      
      // Should succeed - own record
      const ownResponse = await fetch(`/api/patients/${patient1.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(ownResponse.status).toBe(200);
      
      // Should fail - other patient's record
      const otherResponse = await fetch(`/api/patients/${patient2.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(otherResponse.status).toBe(403);
    });
    
    it('patient cannot access provider endpoints', async () => {
      const token = await getAuthToken(patientUser);
      
      const response = await fetch('/api/providers', {
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(response.status).toBe(403);
    });
    
    it('patient cannot access admin endpoints', async () => {
      const token = await getAuthToken(patientUser);
      
      const response = await fetch('/api/admin/clinics', {
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(response.status).toBe(403);
    });
  });
  
  describe('Provider Access Control', () => {
    it('provider can access assigned patients', async () => {
      const token = await getAuthToken(providerUser);
      
      // Assign patient to provider
      await prisma.patientProviderAssignment.create({
        data: {
          patientId: patient1.id,
          providerId: providerUser.providerId
        }
      });
      
      const response = await fetch(`/api/patients/${patient1.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(response.status).toBe(200);
    });
    
    it('provider cannot access unassigned patients from other clinics', async () => {
      const token = await getAuthToken(providerUser);
      
      // Create patient in different clinic
      const otherClinicPatient = await createTestPatient({ clinicId: 2 });
      
      const response = await fetch(`/api/patients/${otherClinicPatient.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(response.status).toBe(404); // Should not even find it due to clinic filtering
    });
  });
  
  describe('Multi-Clinic Isolation', () => {
    it('users cannot access data from other clinics', async () => {
      // Create users in different clinics
      const clinic1User = await createTestUser('provider', { clinicId: 1 });
      const clinic2User = await createTestUser('provider', { clinicId: 2 });
      
      const clinic1Token = await getAuthToken(clinic1User);
      const clinic2Token = await getAuthToken(clinic2User);
      
      // Create patients in each clinic
      const clinic1Patient = await createTestPatient({ clinicId: 1 });
      const clinic2Patient = await createTestPatient({ clinicId: 2 });
      
      // Clinic 1 user should not see clinic 2 patient
      const crossClinicResponse = await fetch(`/api/patients/${clinic2Patient.id}`, {
        headers: { Authorization: `Bearer ${clinic1Token}` }
      });
      expect(crossClinicResponse.status).toBe(404);
      
      // Each should see their own
      const ownClinicResponse = await fetch(`/api/patients/${clinic1Patient.id}`, {
        headers: { Authorization: `Bearer ${clinic1Token}` }
      });
      expect(ownClinicResponse.status).toBe(200);
    });
  });
});
```

### 2. Audit Logging Tests

**File:** `tests/hipaa/audit-logging.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';

describe('HIPAA Audit Logging', () => {
  beforeEach(async () => {
    // Clear audit logs
    await prisma.auditLog.deleteMany();
  });
  
  it('logs PHI access attempts', async () => {
    const token = await getProviderToken();
    
    // Access patient record
    await fetch('/api/patients/1', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    // Check audit log created
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        action: 'VIEW_PATIENT',
        resourceType: 'Patient',
        resourceId: '1'
      }
    });
    
    expect(auditLog).toBeDefined();
    expect(auditLog?.userId).toBeDefined();
    expect(auditLog?.ipAddress).toBeDefined();
    expect(auditLog?.timestamp).toBeDefined();
  });
  
  it('logs failed access attempts', async () => {
    // Attempt without authentication
    await fetch('/api/patients/1');
    
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        resourceType: 'Patient'
      }
    });
    
    expect(auditLog).toBeDefined();
  });
  
  it('logs data modifications with before/after values', async () => {
    const token = await getProviderToken();
    
    // Update patient
    await fetch('/api/patients/1', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phone: '555-0123'
      })
    });
    
    const auditLog = await prisma.patientAudit.findFirst({
      where: {
        patientId: 1,
        action: 'update'
      }
    });
    
    expect(auditLog?.diff).toBeDefined();
    expect(auditLog?.diff).toHaveProperty('phone');
  });
  
  it('audit logs are immutable', async () => {
    // Create audit log
    const log = await prisma.auditLog.create({
      data: {
        userId: 1,
        action: 'TEST_ACTION',
        resourceType: 'Test',
        ipAddress: '127.0.0.1',
        timestamp: new Date()
      }
    });
    
    // Attempt to modify
    await expect(
      prisma.auditLog.update({
        where: { id: log.id },
        data: { action: 'MODIFIED' }
      })
    ).rejects.toThrow();
  });
});
```

### 3. Encryption Tests

**File:** `tests/hipaa/encryption.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { encryptPHI, decryptPHI } from '@/lib/security/phi-encryption';
import { prisma } from '@/lib/db';

describe('PHI Encryption', () => {
  it('encrypts and decrypts PHI correctly', () => {
    const originalData = {
      ssn: '123-45-6789',
      dob: '1990-01-01',
      phone: '555-123-4567'
    };
    
    // Encrypt
    const encrypted = {
      ssn: encryptPHI(originalData.ssn),
      dob: encryptPHI(originalData.dob),
      phone: encryptPHI(originalData.phone)
    };
    
    // Verify encrypted
    expect(encrypted.ssn).not.toBe(originalData.ssn);
    expect(encrypted.ssn).toMatch(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/);
    
    // Decrypt
    const decrypted = {
      ssn: decryptPHI(encrypted.ssn),
      dob: decryptPHI(encrypted.dob),
      phone: decryptPHI(encrypted.phone)
    };
    
    expect(decrypted).toEqual(originalData);
  });
  
  it('fails with tampered encrypted data', () => {
    const encrypted = encryptPHI('sensitive-data');
    const tampered = encrypted!.slice(0, -2) + 'XX';
    
    expect(() => decryptPHI(tampered)).toThrow('Decryption failed');
  });
  
  it('stores encrypted PHI in database', async () => {
    const patient = await prisma.patient.create({
      data: {
        firstName: 'John',
        lastName: 'Doe',
        ssn: encryptPHI('123-45-6789'),
        dob: encryptPHI('1990-01-01'),
        email: encryptPHI('john@example.com'),
        phone: encryptPHI('555-123-4567'),
        // Non-PHI fields not encrypted
        gender: 'M',
        address1: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '12345'
      }
    });
    
    // Verify stored encrypted
    const raw = await prisma.$queryRaw`
      SELECT ssn, dob, email, phone 
      FROM Patient 
      WHERE id = ${patient.id}
    `;
    
    expect(raw[0].ssn).toMatch(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/);
    expect(raw[0].ssn).not.toContain('123-45-6789');
  });
  
  it('encrypts file contents before storage', async () => {
    const fileContent = 'Medical record content with PHI';
    const encrypted = encryptPHI(fileContent);
    
    const document = await prisma.patientDocument.create({
      data: {
        patientId: 1,
        filename: 'medical-record.pdf',
        mimeType: 'application/pdf',
        data: Buffer.from(encrypted!),
        category: 'MEDICAL_RECORD'
      }
    });
    
    // Retrieve and decrypt
    const retrieved = await prisma.patientDocument.findUnique({
      where: { id: document.id }
    });
    
    const decrypted = decryptPHI(retrieved!.data!.toString());
    expect(decrypted).toBe(fileContent);
  });
});
```

### 4. Session Security Tests

**File:** `tests/hipaa/session-security.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { generateToken, wait } from '../helpers';

describe('Session Security', () => {
  it('enforces session timeout after 15 minutes of inactivity', async () => {
    const token = await generateToken({
      lastActivity: Date.now() - 16 * 60 * 1000 // 16 minutes ago
    });
    
    const response = await fetch('/api/patients', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: 'Session expired due to inactivity'
    });
  });
  
  it('refreshes token when close to expiration', async () => {
    const token = await generateToken({
      exp: Date.now() + 4 * 60 * 1000 // 4 minutes until expiry
    });
    
    const response = await fetch('/api/patients', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    expect(response.headers.get('X-Refresh-Token')).toBe('true');
  });
  
  it('requires re-authentication after password change', async () => {
    const user = await createTestUser();
    const token = await getAuthToken(user);
    
    // Change password
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: 'new-hash',
        tokenVersion: { increment: 1 }
      }
    });
    
    // Old token should be invalid
    const response = await fetch('/api/patients', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    expect(response.status).toBe(401);
  });
  
  it('enforces concurrent session limits', async () => {
    const user = await createTestUser();
    
    // Create multiple sessions
    const sessions = await Promise.all([
      createSession(user),
      createSession(user),
      createSession(user),
      createSession(user) // 4th session
    ]);
    
    // First 3 should be active
    expect(sessions[0].active).toBe(true);
    expect(sessions[1].active).toBe(true);
    expect(sessions[2].active).toBe(true);
    
    // 4th should fail or invalidate oldest
    expect(sessions[3].active || !sessions[0].active).toBe(true);
  });
});
```

### 5. Data Integrity Tests

**File:** `tests/hipaa/data-integrity.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('Data Integrity', () => {
  it('prevents unauthorized data deletion', async () => {
    const patient = await createTestPatient();
    const userToken = await getPatientToken();
    
    const response = await fetch(`/api/patients/${patient.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` }
    });
    
    expect(response.status).toBe(403);
    
    // Verify patient still exists
    const stillExists = await prisma.patient.findUnique({
      where: { id: patient.id }
    });
    expect(stillExists).toBeDefined();
  });
  
  it('maintains referential integrity on cascade delete', async () => {
    const patient = await createTestPatient();
    
    // Create related records
    const document = await prisma.patientDocument.create({
      data: { patientId: patient.id, /* ... */ }
    });
    
    const soapNote = await prisma.sOAPNote.create({
      data: { patientId: patient.id, /* ... */ }
    });
    
    // Delete patient (admin only)
    await prisma.patient.delete({ where: { id: patient.id } });
    
    // Verify cascading delete
    const orphanedDocument = await prisma.patientDocument.findUnique({
      where: { id: document.id }
    });
    expect(orphanedDocument).toBeNull();
    
    const orphanedNote = await prisma.sOAPNote.findUnique({
      where: { id: soapNote.id }
    });
    expect(orphanedNote).toBeNull();
  });
  
  it('validates data consistency across related tables', async () => {
    const patient = await createTestPatient({ clinicId: 1 });
    
    // Attempt to create order with different clinic
    await expect(
      prisma.order.create({
        data: {
          patientId: patient.id,
          clinicId: 2, // Different clinic
          // ... other fields
        }
      })
    ).rejects.toThrow('Clinic mismatch');
  });
});
```

### 6. Integration Tests

**File:** `tests/hipaa/integration.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('HIPAA Compliance Integration', () => {
  it('complete patient intake flow with encryption and audit', async () => {
    // 1. Submit intake form
    const intakeResponse = await fetch('/api/intake-forms/submit', {
      method: 'POST',
      body: JSON.stringify({
        firstName: 'Jane',
        lastName: 'Doe',
        ssn: '123-45-6789',
        dob: '1990-01-01',
        medicalHistory: 'Diabetes Type 2'
      })
    });
    
    const { patientId } = await intakeResponse.json();
    
    // 2. Verify encrypted storage
    const patient = await prisma.patient.findUnique({
      where: { id: patientId }
    });
    
    expect(patient.ssn).not.toContain('123-45-6789');
    expect(patient.ssn).toMatch(/^[a-f0-9]+:[a-f0-9]+:/);
    
    // 3. Verify audit log created
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        action: 'CREATE_PATIENT',
        resourceId: String(patientId)
      }
    });
    
    expect(auditLog).toBeDefined();
    
    // 4. Provider accesses patient
    const providerToken = await getProviderToken();
    const accessResponse = await fetch(`/api/patients/${patientId}`, {
      headers: { Authorization: `Bearer ${providerToken}` }
    });
    
    const patientData = await accessResponse.json();
    
    // 5. Verify decryption works for authorized user
    expect(patientData.ssn).toBe('123-45-6789'); // Decrypted
    
    // 6. Verify access audit log
    const accessLog = await prisma.auditLog.findFirst({
      where: {
        action: 'VIEW_PATIENT',
        resourceId: String(patientId),
        userId: providerToken.userId
      }
    });
    
    expect(accessLog).toBeDefined();
  });
  
  it('emergency access override with elevated audit', async () => {
    const patient = await createTestPatient();
    const provider = await createTestProvider({ clinicId: 2 }); // Different clinic
    
    // Normal access should fail
    const normalResponse = await fetch(`/api/patients/${patient.id}`, {
      headers: {
        Authorization: `Bearer ${provider.token}`
      }
    });
    
    expect(normalResponse.status).toBe(404);
    
    // Emergency override
    const emergencyResponse = await fetch(`/api/patients/${patient.id}`, {
      headers: {
        Authorization: `Bearer ${provider.token}`,
        'X-Emergency-Override': 'true',
        'X-Emergency-Reason': 'Patient unconscious in ER'
      }
    });
    
    expect(emergencyResponse.status).toBe(200);
    
    // Verify special audit log
    const emergencyLog = await prisma.auditLog.findFirst({
      where: {
        action: 'EMERGENCY_ACCESS',
        resourceId: String(patient.id)
      }
    });
    
    expect(emergencyLog).toBeDefined();
    expect(emergencyLog.metadata.reason).toBe('Patient unconscious in ER');
    expect(emergencyLog.metadata.alert).toBe(true);
  });
});
```

## Manual Testing Checklist

### Pre-Production HIPAA Compliance Verification

#### 1. Access Control Testing
- [ ] Test minimum necessary access
  - [ ] Receptionist cannot view clinical notes
  - [ ] Billing cannot view treatment details
  - [ ] Provider can only see assigned patients
- [ ] Test role-based restrictions
  - [ ] Each role can only access appropriate endpoints
  - [ ] Elevation requests are logged
- [ ] Test break-glass emergency access
  - [ ] Override works with proper audit
  - [ ] Alert is sent to security team

#### 2. Audit Control Testing  
- [ ] Verify audit logs are created for:
  - [ ] Login/logout events
  - [ ] PHI access (read)
  - [ ] PHI modification (create/update/delete)
  - [ ] Failed access attempts
  - [ ] Configuration changes
  - [ ] User management actions
- [ ] Test audit log integrity
  - [ ] Logs cannot be modified
  - [ ] Logs cannot be deleted
  - [ ] Logs are timestamped accurately
- [ ] Verify audit reports
  - [ ] Can generate user activity report
  - [ ] Can track patient record access
  - [ ] Can identify anomalous patterns

#### 3. Integrity Testing
- [ ] Data validation
  - [ ] Required fields enforced
  - [ ] Data type validation
  - [ ] Range checking
  - [ ] Format validation (SSN, phone, etc.)
- [ ] Referential integrity
  - [ ] Cannot delete referenced records
  - [ ] Orphaned records prevented
  - [ ] Cascade rules work correctly

#### 4. Transmission Security Testing
- [ ] SSL/TLS enforcement
  - [ ] HTTP redirects to HTTPS
  - [ ] Strong cipher suites only
  - [ ] Certificate validation
- [ ] API security
  - [ ] Authentication required
  - [ ] Rate limiting works
  - [ ] Input sanitization
- [ ] File transfer
  - [ ] Encrypted upload/download
  - [ ] Secure temporary storage
  - [ ] Proper cleanup

#### 5. Physical Safeguards Verification
- [ ] Workstation security
  - [ ] Auto-lock after inactivity
  - [ ] Screen privacy filters recommended
  - [ ] Clean desk policy documented
- [ ] Device controls
  - [ ] Mobile device encryption required
  - [ ] Remote wipe capability
  - [ ] BYOD policy defined

## Compliance Monitoring

### Continuous Monitoring Tests

```typescript
// Run these tests continuously in production

describe('Continuous HIPAA Monitoring', () => {
  it('detects unusual access patterns', async () => {
    // Monitor for:
    // - Excessive record access
    // - Access outside business hours
    // - Cross-clinic access attempts
    // - Bulk data exports
  });
  
  it('alerts on encryption failures', async () => {
    // Monitor for:
    // - Unencrypted PHI in logs
    // - Failed encryption operations
    // - Weak encryption keys
  });
  
  it('tracks configuration drift', async () => {
    // Monitor for:
    // - Security setting changes
    // - New unprotected endpoints
    // - Permission escalations
    // - Disabled audit logging
  });
});
```

## Compliance Reporting

Generate monthly HIPAA compliance reports:

```sql
-- User Access Report
SELECT 
  u.email,
  u.role,
  COUNT(DISTINCT al.resourceId) as records_accessed,
  COUNT(*) as total_accesses,
  MAX(al.timestamp) as last_access
FROM AuditLog al
JOIN User u ON al.userId = u.id
WHERE al.action LIKE '%PATIENT%'
  AND al.timestamp > NOW() - INTERVAL '30 days'
GROUP BY u.email, u.role
ORDER BY total_accesses DESC;

-- Unusual Activity Report
SELECT 
  userId,
  COUNT(*) as access_count,
  COUNT(DISTINCT resourceId) as unique_records
FROM AuditLog
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY userId
HAVING COUNT(*) > 50
   OR COUNT(DISTINCT resourceId) > 20;

-- Failed Access Attempts
SELECT 
  ipAddress,
  COUNT(*) as failed_attempts,
  MAX(timestamp) as last_attempt
FROM AuditLog
WHERE action = 'UNAUTHORIZED_ACCESS_ATTEMPT'
  AND timestamp > NOW() - INTERVAL '24 hours'
GROUP BY ipAddress
HAVING COUNT(*) > 5
ORDER BY failed_attempts DESC;
```

## Test Execution Schedule

- **Daily:** Access control, audit logging
- **Weekly:** Full integration tests
- **Monthly:** Compliance reporting
- **Quarterly:** Penetration testing
- **Annually:** Full HIPAA risk assessment

## Success Criteria

All tests must pass with:
- 100% of security tests passing
- 0 unencrypted PHI in storage
- 100% of PHI access logged
- <100ms overhead from encryption
- 99.9% uptime for audit system

**Note:** These tests are the minimum required for HIPAA compliance. Additional tests may be required based on your specific implementation and risk assessment.
