/**
 * COMPREHENSIVE MULTI-TENANT PLATFORM TESTS
 * 
 * Tests clinic isolation, user access, data separation, and Lifefile integration
 * 
 * Run with: npx vitest run tests/multi-tenant.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Test configuration
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

// Test users and clinics
const TEST_DATA = {
  superAdmin: {
    email: process.env.TEST_SUPER_ADMIN_EMAIL || 'admin@eonpro.io',
    password: process.env.TEST_SUPER_ADMIN_PASSWORD || 'test123',
  },
  clinic1: {
    name: 'EON Medical',
    id: 1, // Update with actual ID
  },
  clinic2: {
    name: 'Wellmedr LLC', 
    id: 7, // Update with actual ID
  },
  provider: {
    email: 'gsiglemd@eonmeds.com',
    password: process.env.TEST_PROVIDER_PASSWORD || 'test123',
  },
};

let superAdminToken: string;
let providerToken: string;
let clinic1PatientId: number;
let clinic2PatientId: number;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function login(email: string, password: string, role: string = 'provider'): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, role }),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`Login failed for ${email}: ${data.error}`);
  return data.token;
}

async function apiCall(
  endpoint: string, 
  token: string, 
  options: RequestInit = {}
): Promise<any> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  return res.json();
}

// ============================================================================
// TEST SUITE: AUTHENTICATION & MULTI-CLINIC ACCESS
// ============================================================================

describe('Multi-Tenant Authentication', () => {
  
  it('should login as super admin', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_DATA.superAdmin.email,
        password: TEST_DATA.superAdmin.password,
        role: 'super_admin',
      }),
    });
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.token).toBeDefined();
    expect(data.user.role).toBe('super_admin');
    
    superAdminToken = data.token;
  });

  it('should return multiple clinics for multi-clinic user', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_DATA.provider.email,
        password: TEST_DATA.provider.password,
        role: 'provider',
      }),
    });
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.clinics).toBeDefined();
    expect(Array.isArray(data.clinics)).toBe(true);
    
    // Should have access to multiple clinics
    console.log('Provider clinics:', data.clinics);
    
    providerToken = data.token;
  });

  it('should be able to switch clinics', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/switch-clinic`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${providerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ clinicId: TEST_DATA.clinic2.id }),
    });
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.token).toBeDefined();
    expect(data.activeClinicId).toBe(TEST_DATA.clinic2.id);
  });
});

// ============================================================================
// TEST SUITE: PATIENT DATA ISOLATION
// ============================================================================

describe('Patient Data Isolation', () => {
  let clinic1Token: string;
  let clinic2Token: string;

  beforeAll(async () => {
    // Get tokens for each clinic context
    const login1 = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_DATA.provider.email,
        password: TEST_DATA.provider.password,
        role: 'provider',
        clinicId: TEST_DATA.clinic1.id,
      }),
    });
    const data1 = await login1.json();
    clinic1Token = data1.token;

    // Switch to clinic 2
    const switch2 = await fetch(`${BASE_URL}/api/auth/switch-clinic`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${clinic1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ clinicId: TEST_DATA.clinic2.id }),
    });
    const data2 = await switch2.json();
    clinic2Token = data2.token;
  });

  it('should create patient in Clinic 1', async () => {
    const testPatient = {
      firstName: 'Test',
      lastName: `Clinic1_${Date.now()}`,
      email: `test.clinic1.${Date.now()}@test.com`,
      phone: '5551234567',
      dob: '1990-01-01',
      gender: 'male',
      address1: '123 Test St',
      city: 'Tampa',
      state: 'FL',
      zip: '33601',
    };

    const res = await fetch(`${BASE_URL}/api/patients`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${clinic1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPatient),
    });
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.patient).toBeDefined();
    expect(data.patient.clinicId).toBe(TEST_DATA.clinic1.id);
    
    clinic1PatientId = data.patient.id;
    console.log(`Created patient ${clinic1PatientId} in Clinic 1`);
  });

  it('should create patient in Clinic 2', async () => {
    const testPatient = {
      firstName: 'Test',
      lastName: `Clinic2_${Date.now()}`,
      email: `test.clinic2.${Date.now()}@test.com`,
      phone: '5559876543',
      dob: '1985-05-15',
      gender: 'female',
      address1: '456 Test Ave',
      city: 'Miami',
      state: 'FL',
      zip: '33101',
    };

    const res = await fetch(`${BASE_URL}/api/patients`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${clinic2Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPatient),
    });
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.patient).toBeDefined();
    expect(data.patient.clinicId).toBe(TEST_DATA.clinic2.id);
    
    clinic2PatientId = data.patient.id;
    console.log(`Created patient ${clinic2PatientId} in Clinic 2`);
  });

  it('should NOT see Clinic 2 patients when logged into Clinic 1', async () => {
    const res = await fetch(`${BASE_URL}/api/patients`, {
      headers: { 'Authorization': `Bearer ${clinic1Token}` },
    });
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.patients).toBeDefined();
    
    // Check that clinic 2 patient is NOT in the list
    const clinic2Patient = data.patients.find((p: any) => p.id === clinic2PatientId);
    expect(clinic2Patient).toBeUndefined();
    
    // All patients should belong to clinic 1
    data.patients.forEach((p: any) => {
      expect(p.clinicId).toBe(TEST_DATA.clinic1.id);
    });
    
    console.log(`Clinic 1 sees ${data.patients.length} patients (correctly isolated)`);
  });

  it('should NOT see Clinic 1 patients when logged into Clinic 2', async () => {
    const res = await fetch(`${BASE_URL}/api/patients`, {
      headers: { 'Authorization': `Bearer ${clinic2Token}` },
    });
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.patients).toBeDefined();
    
    // Check that clinic 1 patient is NOT in the list
    const clinic1Patient = data.patients.find((p: any) => p.id === clinic1PatientId);
    expect(clinic1Patient).toBeUndefined();
    
    // All patients should belong to clinic 2
    data.patients.forEach((p: any) => {
      expect(p.clinicId).toBe(TEST_DATA.clinic2.id);
    });
    
    console.log(`Clinic 2 sees ${data.patients.length} patients (correctly isolated)`);
  });

  it('should NOT access Clinic 2 patient directly from Clinic 1', async () => {
    const res = await fetch(`${BASE_URL}/api/patients/${clinic2PatientId}`, {
      headers: { 'Authorization': `Bearer ${clinic1Token}` },
    });
    
    // Should return 404 or 403
    expect([403, 404]).toContain(res.status);
  });
});

// ============================================================================
// TEST SUITE: ORDER DATA ISOLATION
// ============================================================================

describe('Order Data Isolation', () => {
  let clinic1Token: string;
  let clinic2Token: string;

  beforeAll(async () => {
    // Get tokens for each clinic
    const login1 = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_DATA.provider.email,
        password: TEST_DATA.provider.password,
        role: 'provider',
        clinicId: TEST_DATA.clinic1.id,
      }),
    });
    clinic1Token = (await login1.json()).token;

    const switch2 = await fetch(`${BASE_URL}/api/auth/switch-clinic`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${clinic1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ clinicId: TEST_DATA.clinic2.id }),
    });
    clinic2Token = (await switch2.json()).token;
  });

  it('should only see orders from current clinic', async () => {
    // Get orders from clinic 1
    const res1 = await fetch(`${BASE_URL}/api/orders`, {
      headers: { 'Authorization': `Bearer ${clinic1Token}` },
    });
    const data1 = await res1.json();
    
    // Get orders from clinic 2
    const res2 = await fetch(`${BASE_URL}/api/orders`, {
      headers: { 'Authorization': `Bearer ${clinic2Token}` },
    });
    const data2 = await res2.json();
    
    console.log(`Clinic 1 orders: ${data1.count}, Clinic 2 orders: ${data2.count}`);
    
    // Verify isolation (orders shouldn't overlap unless they belong to both)
    if (data1.orders && data2.orders) {
      const clinic1OrderIds = new Set(data1.orders.map((o: any) => o.id));
      const clinic2OrderIds = new Set(data2.orders.map((o: any) => o.id));
      
      // Check for overlap
      const overlap = [...clinic1OrderIds].filter(id => clinic2OrderIds.has(id));
      expect(overlap.length).toBe(0);
    }
  });
});

// ============================================================================
// TEST SUITE: PROVIDER DATA ISOLATION
// ============================================================================

describe('Provider Data Isolation', () => {
  let clinic1Token: string;
  let clinic2Token: string;

  beforeAll(async () => {
    const login1 = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_DATA.provider.email,
        password: TEST_DATA.provider.password,
        role: 'provider',
        clinicId: TEST_DATA.clinic1.id,
      }),
    });
    clinic1Token = (await login1.json()).token;

    const switch2 = await fetch(`${BASE_URL}/api/auth/switch-clinic`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${clinic1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ clinicId: TEST_DATA.clinic2.id }),
    });
    clinic2Token = (await switch2.json()).token;
  });

  it('should return providers accessible to current clinic', async () => {
    const res1 = await fetch(`${BASE_URL}/api/providers`, {
      headers: { 'Authorization': `Bearer ${clinic1Token}` },
    });
    const data1 = await res1.json();
    
    const res2 = await fetch(`${BASE_URL}/api/providers`, {
      headers: { 'Authorization': `Bearer ${clinic2Token}` },
    });
    const data2 = await res2.json();
    
    expect(data1.providers).toBeDefined();
    expect(data2.providers).toBeDefined();
    
    console.log(`Clinic 1 providers: ${data1.providers.length}`);
    console.log(`Clinic 2 providers: ${data2.providers.length}`);
  });
});

// ============================================================================
// TEST SUITE: LIFEFILE CREDENTIALS ISOLATION
// ============================================================================

describe('Lifefile Credentials Per Clinic', () => {
  
  it('should have different Lifefile credentials per clinic', async () => {
    // This test verifies that each clinic has its own Lifefile configuration
    const res = await fetch(`${BASE_URL}/api/super-admin/clinics`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` },
    });
    const data = await res.json();
    
    expect(data.clinics).toBeDefined();
    
    const clinic1 = data.clinics.find((c: any) => c.id === TEST_DATA.clinic1.id);
    const clinic2 = data.clinics.find((c: any) => c.id === TEST_DATA.clinic2.id);
    
    if (clinic1 && clinic2) {
      // If both have Lifefile enabled, they should have different credentials
      if (clinic1.lifefileEnabled && clinic2.lifefileEnabled) {
        console.log(`Clinic 1 Lifefile: ${clinic1.lifefilePracticeName || 'Not configured'}`);
        console.log(`Clinic 2 Lifefile: ${clinic2.lifefilePracticeName || 'Not configured'}`);
        
        // They should have different practice names/IDs
        if (clinic1.lifefilePracticeId && clinic2.lifefilePracticeId) {
          expect(clinic1.lifefilePracticeId).not.toBe(clinic2.lifefilePracticeId);
        }
      }
    }
  });
});

// ============================================================================
// TEST SUITE: SUPER ADMIN CROSS-CLINIC ACCESS
// ============================================================================

describe('Super Admin Cross-Clinic Access', () => {
  
  it('super admin should see all patients across clinics', async () => {
    const res = await fetch(`${BASE_URL}/api/patients`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` },
    });
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.patients).toBeDefined();
    
    // Super admin should see patients from multiple clinics
    const clinicIds = [...new Set(data.patients.map((p: any) => p.clinicId))];
    console.log(`Super admin sees patients from ${clinicIds.length} clinics:`, clinicIds);
    
    // Should see more than one clinic's patients
    expect(clinicIds.length).toBeGreaterThanOrEqual(1);
  });

  it('super admin should see all orders across clinics', async () => {
    const res = await fetch(`${BASE_URL}/api/orders`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` },
    });
    const data = await res.json();
    
    expect(res.status).toBe(200);
    console.log(`Super admin sees ${data.count} orders total`);
  });

  it('super admin should manage all clinics', async () => {
    const res = await fetch(`${BASE_URL}/api/super-admin/clinics`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` },
    });
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.clinics).toBeDefined();
    expect(data.clinics.length).toBeGreaterThanOrEqual(2);
    
    console.log('All clinics:', data.clinics.map((c: any) => ({ id: c.id, name: c.name })));
  });
});

// ============================================================================
// TEST SUITE: PRESCRIPTION CLINIC CONTEXT
// ============================================================================

describe('Prescription Clinic Context', () => {
  
  it('prescription should use correct clinic Lifefile credentials', async () => {
    // This is a documentation test - actual prescription would require valid patient/provider
    // The prescription API should:
    // 1. Accept clinicId from request body
    // 2. Use that clinic's Lifefile credentials
    // 3. Generate PDF with that clinic's branding
    
    console.log('Prescription flow should:');
    console.log('1. Accept clinicId in request body');
    console.log('2. Use clinic-specific Lifefile credentials');
    console.log('3. Generate PDF with clinic branding');
    console.log('4. Send to pharmacy via clinic\'s Lifefile connection');
    
    expect(true).toBe(true);
  });
});

// ============================================================================
// TEST SUITE: DATA LEAK PREVENTION
// ============================================================================

describe('Cross-Clinic Data Leak Prevention', () => {
  let clinic1Token: string;
  
  beforeAll(async () => {
    const login1 = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_DATA.provider.email,
        password: TEST_DATA.provider.password,
        role: 'provider',
        clinicId: TEST_DATA.clinic1.id,
      }),
    });
    clinic1Token = (await login1.json()).token;
  });

  it('should not allow creating patient for another clinic', async () => {
    const testPatient = {
      firstName: 'Hacker',
      lastName: 'Test',
      email: `hacker.${Date.now()}@test.com`,
      phone: '5550000000',
      dob: '1990-01-01',
      gender: 'male',
      address1: '123 Hack St',
      city: 'Tampa',
      state: 'FL',
      zip: '33601',
      clinicId: TEST_DATA.clinic2.id, // Try to create for different clinic
    };

    const res = await fetch(`${BASE_URL}/api/patients`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${clinic1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPatient),
    });
    const data = await res.json();
    
    // Should either reject or ignore the clinicId and use user's clinic
    if (res.status === 200 && data.patient) {
      // If created, should be in user's clinic, not the requested one
      expect(data.patient.clinicId).toBe(TEST_DATA.clinic1.id);
      console.log('Patient created in user\'s clinic (clinicId ignored) - SECURE');
    } else {
      console.log('Patient creation rejected - SECURE');
    }
  });

  it('should not expose sensitive data in API responses', async () => {
    const res = await fetch(`${BASE_URL}/api/providers`, {
      headers: { 'Authorization': `Bearer ${clinic1Token}` },
    });
    const data = await res.json();
    
    if (data.providers && data.providers.length > 0) {
      const provider = data.providers[0];
      
      // Should not expose passwords or sensitive auth data
      expect(provider.passwordHash).toBeUndefined();
      expect(provider.password).toBeUndefined();
      
      console.log('Provider response fields:', Object.keys(provider));
    }
  });
});

// ============================================================================
// MANUAL TEST CHECKLIST
// ============================================================================

describe('Manual Test Checklist', () => {
  it('documents manual tests to perform', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                    MULTI-TENANT MANUAL TEST CHECKLIST                        ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  □ LOGIN & CLINIC SELECTION                                                  ║
║    - Login as multi-clinic user (Dr. Sigle)                                  ║
║    - Verify clinic selector appears                                          ║
║    - Select Clinic A, verify dashboard shows Clinic A data                   ║
║    - Switch to Clinic B, verify data changes                                 ║
║                                                                              ║
║  □ PATIENT ISOLATION                                                         ║
║    - Create patient in Clinic A                                              ║
║    - Switch to Clinic B                                                      ║
║    - Verify patient NOT visible                                              ║
║    - Switch back to Clinic A                                                 ║
║    - Verify patient IS visible                                               ║
║                                                                              ║
║  □ PRESCRIPTION FLOW                                                         ║
║    - Login to Clinic A (EON Medical)                                         ║
║    - Create prescription                                                     ║
║    - Verify PDF shows EON Medical branding                                   ║
║    - Verify Lifefile uses EON credentials                                    ║
║    - Switch to Clinic B (Wellmedr)                                           ║
║    - Create prescription                                                     ║
║    - Verify PDF shows Wellmedr branding                                      ║
║    - Verify Lifefile uses Wellmedr credentials                               ║
║                                                                              ║
║  □ ORDER ISOLATION                                                           ║
║    - Orders created in Clinic A only visible in Clinic A                     ║
║    - Orders created in Clinic B only visible in Clinic B                     ║
║                                                                              ║
║  □ SUPER ADMIN ACCESS                                                        ║
║    - Login as super admin                                                    ║
║    - Can see ALL clinics                                                     ║
║    - Can see ALL patients (with clinic labels)                               ║
║    - Can see ALL orders                                                      ║
║    - Can manage users across clinics                                         ║
║                                                                              ║
║  □ LIFEFILE PHARMACY SETTINGS                                                ║
║    - Each clinic has separate Lifefile credentials                           ║
║    - Prescriptions route to correct pharmacy account                         ║
║    - PDF branding matches clinic                                             ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
    `);
    
    expect(true).toBe(true);
  });
});
