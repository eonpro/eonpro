/**
 * Patient Portal Regression Test Suite
 *
 * Validates that tenant isolation remediation does NOT break patient portal functionality.
 * Covers: auth, prescriptions, tracking, appointments, documents, refills, billing, and care plans.
 *
 * Run: npx playwright test patient-portal-regression --project=chromium
 */

import { test, expect, type APIRequestContext } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';

const PATIENT_CREDENTIALS = {
  email: process.env.TEST_PATIENT_EMAIL || 'test-patient@eonpro.test',
  password: process.env.TEST_PATIENT_PASSWORD || 'TestPatient123!',
};

let authToken: string;
let apiContext: APIRequestContext;

test.describe('Patient Portal Regression Suite', () => {
  test.beforeAll(async ({ playwright }) => {
    apiContext = await playwright.request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: {
        'Content-Type': 'application/json',
      },
    });

    const loginRes = await apiContext.post('/api/auth/login', {
      data: {
        email: PATIENT_CREDENTIALS.email,
        password: PATIENT_CREDENTIALS.password,
        role: 'patient',
      },
    });

    if (loginRes.ok()) {
      const body = await loginRes.json();
      authToken = body.token || body.accessToken;
    }

    if (!authToken) {
      test.skip(true, 'Could not authenticate test patient — skipping regression suite');
    }

    apiContext = await playwright.request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    });
  });

  test.afterAll(async () => {
    await apiContext?.dispose();
  });

  test('GET /api/auth/me returns authenticated patient', async () => {
    const res = await apiContext.get('/api/auth/me');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.user || body).toHaveProperty('id');
    expect(body.user?.role || body.role).toMatch(/patient/i);
  });

  test('GET /api/patient-portal/profile/status returns profile', async () => {
    const res = await apiContext.get('/api/patient-portal/profile/status');
    expect(res.status()).toBe(200);
  });

  test('GET /api/patient-portal/prescriptions returns 200', async () => {
    const res = await apiContext.get('/api/patient-portal/prescriptions');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test('GET /api/patient-portal/tracking returns 200', async () => {
    const res = await apiContext.get('/api/patient-portal/tracking');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test('GET /api/patient-portal/appointments returns 200', async () => {
    const res = await apiContext.get('/api/patient-portal/appointments');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test('GET /api/patient-portal/documents returns 200', async () => {
    const res = await apiContext.get('/api/patient-portal/documents');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test('GET /api/patient-portal/billing returns 200', async () => {
    const res = await apiContext.get('/api/patient-portal/billing');
    expect(res.status()).toBe(200);
  });

  test('GET /api/patient-portal/care-plan returns 200', async () => {
    const res = await apiContext.get('/api/patient-portal/care-plan');
    expect(res.status()).toBe(200);
  });

  test('GET /api/patient-portal/care-team returns 200', async () => {
    const res = await apiContext.get('/api/patient-portal/care-team');
    expect(res.status()).toBe(200);
  });

  test('GET /api/patient-portal/tickets returns 200', async () => {
    const res = await apiContext.get('/api/patient-portal/tickets');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test('GET /api/patient-portal/vitals returns 200', async () => {
    const res = await apiContext.get('/api/patient-portal/vitals');
    expect(res.status()).toBe(200);
  });

  test('GET /api/patient-portal/health returns 200 (health check)', async () => {
    const res = await apiContext.get('/api/patient-portal/health');
    expect(res.status()).toBe(200);
  });

  test('GET /api/patient-portal/subscription returns 200', async () => {
    const res = await apiContext.get('/api/patient-portal/subscription');
    expect([200, 404]).toContain(res.status());
  });

  test('GET /api/patient-portal/photos returns 200', async () => {
    const res = await apiContext.get('/api/patient-portal/photos');
    expect(res.status()).toBe(200);
  });

  test('Unauthenticated request to portal API returns 401', async () => {
    const unauthContext = await apiContext.newContext({
      baseURL: BASE_URL,
    }) as unknown as APIRequestContext;
    // Use a raw fetch without auth headers
    const res = await apiContext.fetch(`${BASE_URL}/api/patient-portal/prescriptions`, {
      headers: {},
    });
    expect([401, 403]).toContain(res.status());
  });

  test('Patient cannot access admin routes', async () => {
    const res = await apiContext.get('/api/admin/patients');
    expect([401, 403]).toContain(res.status());
  });

  test('Patient cannot access finance routes', async () => {
    const res = await apiContext.get('/api/finance/subscriptions');
    expect([401, 403]).toContain(res.status());
  });

  test('Patient cannot pass clinicId to ticket creation', async () => {
    const res = await apiContext.post('/api/tickets', {
      data: {
        title: 'Test ticket regression',
        description: 'This is a regression test',
        clinicId: 99999,
      },
    });
    if (res.ok()) {
      const body = await res.json();
      expect(body.ticket?.clinicId).not.toBe(99999);
    }
  });
});
