#!/usr/bin/env node
/**
 * Deep End-to-End Portal Test
 *
 * Tests every patient portal data flow:
 *   1. Weight: patient logs → DB → patient GET → admin GET
 *   2. Water: patient logs → DB → patient GET
 *   3. Exercise: patient logs → DB → patient GET
 *   4. Sleep: patient logs → DB → patient GET
 *   5. Nutrition: patient logs → DB → patient GET
 *   6. Profile: patient saves → DB → patient GET → admin GET
 *   7. Medication reminders: patient creates → DB → patient GET → patient deletes
 *   8. Documents: patient lists via portal API
 *   9. Tracking: patient views shipment data
 *
 * Usage: node scripts/deep-portal-test.js
 */

const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const BASE = 'http://localhost:3001';
const SECRET = 'dev_jwt_secret_replace_in_production_with_secure_random_value_min_32_chars';
const PATIENT_ID = 11;
const PATIENT_USER_ID = 14;
const CLINIC_ID = 8;

const prisma = new PrismaClient();

const patientToken = jwt.sign(
  { id: PATIENT_USER_ID, role: 'patient', clinicId: CLINIC_ID, email: 'testpatient@wellmedr.com', patientId: PATIENT_ID },
  SECRET, { expiresIn: '1h' }
);
const adminToken = jwt.sign(
  { id: 1, role: 'admin', clinicId: CLINIC_ID, email: 'admin@wellmedr.com' },
  SECRET, { expiresIn: '1h' }
);

let passed = 0;
let failed = 0;
const failures = [];
const createdIds = { weightLogs: [], waterLogs: [], exerciseLogs: [], sleepLogs: [], nutritionLogs: [], reminders: [] };

function headers(token, json = false) {
  const h = { Authorization: `Bearer ${token}`, Cookie: `auth_token=${token}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function api(method, path, token, body) {
  const opts = { method, headers: headers(token, !!body) };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

function assert(label, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    const msg = `  ❌ ${label}${detail ? ' — ' + detail : ''}`;
    console.log(msg);
    failures.push(msg);
  }
}

// ═══════════════════════════════════════════════════════════════════
// TEST 1: WEIGHT LOGGING — full round-trip
// ═══════════════════════════════════════════════════════════════════
async function testWeight() {
  console.log('\n══════════════════════════════════════════');
  console.log('TEST 1: WEIGHT LOGGING (patient → DB → both sides)');
  console.log('══════════════════════════════════════════');

  // 1a. Patient logs a weight
  const now = new Date().toISOString();
  const { status: s1, data: d1 } = await api('POST', '/api/patient-progress/weight', patientToken, {
    patientId: PATIENT_ID, weight: 192.4, unit: 'lbs', recordedAt: now,
  });
  assert('Patient POST weight → 201', s1 === 201, `got ${s1}`);
  assert('Response has id', typeof d1?.id === 'number');
  assert('Source is "patient"', d1?.source === 'patient', `got "${d1?.source}"`);
  assert('Weight is 192.4', d1?.weight === 192.4, `got ${d1?.weight}`);
  if (d1?.id) createdIds.weightLogs.push(d1.id);

  // 1b. Verify in database
  if (d1?.id) {
    const dbRow = await prisma.patientWeightLog.findUnique({ where: { id: d1.id } });
    assert('DB record exists', !!dbRow);
    assert('DB weight matches (192.4)', dbRow?.weight === 192.4, `got ${dbRow?.weight}`);
    assert('DB source is "patient"', dbRow?.source === 'patient', `got "${dbRow?.source}"`);
    assert('DB patientId matches', dbRow?.patientId === PATIENT_ID, `got ${dbRow?.patientId}`);
    assert('DB unit is "lbs"', dbRow?.unit === 'lbs', `got "${dbRow?.unit}"`);
  }

  // 1c. Patient GET (no limit param — was the 400 bug)
  const { status: s2, data: d2 } = await api('GET', `/api/patient-progress/weight?patientId=${PATIENT_ID}`, patientToken);
  assert('Patient GET weight → 200', s2 === 200, `got ${s2}`);
  assert('Response has data array', Array.isArray(d2?.data));
  const patientSees = d2?.data?.find(e => e.id === d1?.id);
  assert('Patient sees their new entry', !!patientSees);
  assert('Entry weight correct in patient GET', patientSees?.weight === 192.4);

  // 1d. Admin GET (same patient — should see the patient-logged entry)
  const { status: s3, data: d3 } = await api('GET', `/api/patient-progress/weight?patientId=${PATIENT_ID}&limit=50`, adminToken);
  assert('Admin GET weight → 200', s3 === 200, `got ${s3}`);
  assert('Admin response has data array', Array.isArray(d3?.data));
  const adminSees = d3?.data?.find(e => e.id === d1?.id);
  assert('Admin sees patient-logged entry', !!adminSees);
  assert('Admin sees source="patient"', adminSees?.source === 'patient', `got "${adminSees?.source}"`);
  assert('Admin sees correct weight', adminSees?.weight === 192.4);

  // 1e. Admin logs a weight for same patient
  const { status: s4, data: d4 } = await api('POST', '/api/patient-progress/weight', adminToken, {
    patientId: PATIENT_ID, weight: 191.0, unit: 'lbs', notes: 'Provider weigh-in',
    recordedAt: new Date(Date.now() + 60000).toISOString(),
  });
  assert('Admin POST weight → 201', s4 === 201, `got ${s4}`);
  assert('Admin entry source is "provider"', d4?.source === 'provider', `got "${d4?.source}"`);
  if (d4?.id) createdIds.weightLogs.push(d4.id);

  // 1f. Patient sees admin-logged entry
  const { status: s5, data: d5 } = await api('GET', `/api/patient-progress/weight?patientId=${PATIENT_ID}`, patientToken);
  const patientSeesProvider = d5?.data?.find(e => e.id === d4?.id);
  assert('Patient sees provider-logged entry', !!patientSeesProvider);
  assert('Patient sees source="provider"', patientSeesProvider?.source === 'provider');

  // 1g. Idempotency: same weight at same time should return existing
  const { status: s6, data: d6 } = await api('POST', '/api/patient-progress/weight', patientToken, {
    patientId: PATIENT_ID, weight: 192.4, unit: 'lbs', recordedAt: now,
  });
  assert('Duplicate POST returns 200 (idempotent)', s6 === 200, `got ${s6}`);
  assert('Duplicate returns same id', d6?.id === d1?.id, `got id=${d6?.id} expected=${d1?.id}`);
}

// ═══════════════════════════════════════════════════════════════════
// TEST 2: WATER LOGGING
// ═══════════════════════════════════════════════════════════════════
async function testWater() {
  console.log('\n══════════════════════════════════════════');
  console.log('TEST 2: WATER LOGGING');
  console.log('══════════════════════════════════════════');

  const { status: s1, data: d1 } = await api('POST', '/api/patient-progress/water', patientToken, {
    patientId: PATIENT_ID, amount: 16, unit: 'oz',
  });
  assert('Patient POST water → 201', s1 === 201, `got ${s1}`);
  assert('Response has id', typeof d1?.id === 'number');
  if (d1?.id) createdIds.waterLogs.push(d1.id);

  // Verify in DB
  if (d1?.id) {
    const dbRow = await prisma.patientWaterLog.findUnique({ where: { id: d1.id } });
    assert('DB water record exists', !!dbRow);
    assert('DB amount is 16', dbRow?.amount === 16, `got ${dbRow?.amount}`);
  }

  // Patient GET (without date param — was same null bug)
  const { status: s2, data: d2 } = await api('GET', `/api/patient-progress/water?patientId=${PATIENT_ID}`, patientToken);
  assert('Patient GET water → 200', s2 === 200, `got ${s2}`);
  assert('Response has todayTotal in meta', typeof d2?.meta?.todayTotal === 'number');
  assert('todayTotal >= 16', d2?.meta?.todayTotal >= 16, `got ${d2?.meta?.todayTotal}`);
}

// ═══════════════════════════════════════════════════════════════════
// TEST 3: EXERCISE LOGGING
// ═══════════════════════════════════════════════════════════════════
async function testExercise() {
  console.log('\n══════════════════════════════════════════');
  console.log('TEST 3: EXERCISE LOGGING');
  console.log('══════════════════════════════════════════');

  const { status: s1, data: d1 } = await api('POST', '/api/patient-progress/exercise', patientToken, {
    patientId: PATIENT_ID, activityType: 'Walking', duration: 30, intensity: 'moderate', notes: 'Morning walk',
  });
  assert('Patient POST exercise → 201', s1 === 201, `got ${s1}: ${JSON.stringify(d1?.error || d1?.details || '')}`);
  if (d1?.id) createdIds.exerciseLogs.push(d1.id);

  if (d1?.id) {
    const dbRow = await prisma.patientExerciseLog.findUnique({ where: { id: d1.id } });
    assert('DB exercise record exists', !!dbRow);
    assert('DB duration is 30', dbRow?.duration === 30, `got ${dbRow?.duration}`);
    assert('DB activityType is Walking', dbRow?.activityType === 'Walking', `got "${dbRow?.activityType}"`);
  }

  const { status: s2 } = await api('GET', `/api/patient-progress/exercise?patientId=${PATIENT_ID}`, patientToken);
  assert('Patient GET exercise → 200', s2 === 200, `got ${s2}`);
}

// ═══════════════════════════════════════════════════════════════════
// TEST 4: SLEEP LOGGING
// ═══════════════════════════════════════════════════════════════════
async function testSleep() {
  console.log('\n══════════════════════════════════════════');
  console.log('TEST 4: SLEEP LOGGING');
  console.log('══════════════════════════════════════════');

  const { status: s1, data: d1 } = await api('POST', '/api/patient-progress/sleep', patientToken, {
    patientId: PATIENT_ID, sleepStart: '2026-02-17T23:00:00.000Z', sleepEnd: '2026-02-18T07:00:00.000Z',
    quality: 4, notes: 'Slept well',
  });
  assert('Patient POST sleep → 201', s1 === 201, `got ${s1}`);
  if (d1?.id) createdIds.sleepLogs.push(d1.id);

  if (d1?.id) {
    const dbRow = await prisma.patientSleepLog.findUnique({ where: { id: d1.id } });
    assert('DB sleep record exists', !!dbRow);
    assert('DB quality is 4', dbRow?.quality === 4, `got ${dbRow?.quality}`);
  }

  const { status: s2 } = await api('GET', `/api/patient-progress/sleep?patientId=${PATIENT_ID}`, patientToken);
  assert('Patient GET sleep → 200', s2 === 200, `got ${s2}`);
}

// ═══════════════════════════════════════════════════════════════════
// TEST 5: NUTRITION/MEAL LOGGING
// ═══════════════════════════════════════════════════════════════════
async function testNutrition() {
  console.log('\n══════════════════════════════════════════');
  console.log('TEST 5: NUTRITION/MEAL LOGGING');
  console.log('══════════════════════════════════════════');

  const { status: s1, data: d1 } = await api('POST', '/api/patient-progress/nutrition', patientToken, {
    patientId: PATIENT_ID, mealType: 'lunch', description: 'Grilled chicken salad', calories: 450,
  });
  assert('Patient POST nutrition → 201', s1 === 201, `got ${s1}`);
  if (d1?.id) createdIds.nutritionLogs.push(d1.id);

  if (d1?.id) {
    const dbRow = await prisma.patientNutritionLog.findUnique({ where: { id: d1.id } });
    assert('DB nutrition record exists', !!dbRow);
    assert('DB calories is 450', dbRow?.calories === 450, `got ${dbRow?.calories}`);
    assert('DB description matches', dbRow?.description === 'Grilled chicken salad');
  }

  const { status: s2 } = await api('GET', `/api/patient-progress/nutrition?patientId=${PATIENT_ID}`, patientToken);
  assert('Patient GET nutrition → 200', s2 === 200, `got ${s2}`);
}

// ═══════════════════════════════════════════════════════════════════
// TEST 6: PROFILE SAVE & DISPLAY
// ═══════════════════════════════════════════════════════════════════
async function testProfile() {
  console.log('\n══════════════════════════════════════════');
  console.log('TEST 6: PROFILE SAVE (patient → DB → GET)');
  console.log('══════════════════════════════════════════');

  // 6a. GET current profile
  const { status: sg, data: dg } = await api('GET', '/api/user/profile', patientToken);
  assert('Patient GET profile → 200', sg === 200, `got ${sg}`);
  assert('Profile has firstName', typeof dg?.firstName === 'string');

  // 6b. PATCH profile with new data
  const { status: sp, data: dp } = await api('PATCH', '/api/user/profile', patientToken, {
    firstName: 'TestDeep', lastName: 'Patient', phone: '5551234567',
  });
  assert('Patient PATCH profile → 200', sp === 200, `got ${sp}: ${JSON.stringify(dp?.error || '')}`);

  // 6c. GET profile again and verify updated
  const { status: sg2, data: dg2 } = await api('GET', '/api/user/profile', patientToken);
  assert('Updated profile GET → 200', sg2 === 200, `got ${sg2}`);
  assert('firstName updated to TestDeep', dg2?.firstName === 'TestDeep', `got "${dg2?.firstName}"`);
  assert('lastName is Patient', dg2?.lastName === 'Patient', `got "${dg2?.lastName}"`);

  // 6d. Verify in DB
  const dbUser = await prisma.user.findUnique({ where: { id: PATIENT_USER_ID }, select: { firstName: true, lastName: true, phone: true } });
  assert('DB user firstName is TestDeep', dbUser?.firstName === 'TestDeep', `got "${dbUser?.firstName}"`);

  // 6e. Restore original name
  await api('PATCH', '/api/user/profile', patientToken, {
    firstName: dg?.firstName || 'Test', lastName: dg?.lastName || 'Patient',
  });
}

// ═══════════════════════════════════════════════════════════════════
// TEST 7: MEDICATION REMINDERS
// ═══════════════════════════════════════════════════════════════════
async function testMedicationReminders() {
  console.log('\n══════════════════════════════════════════');
  console.log('TEST 7: MEDICATION REMINDERS (CRUD)');
  console.log('══════════════════════════════════════════');

  // 7a. Create reminder
  const { status: s1, data: d1 } = await api('POST', '/api/patient-progress/medication-reminders', patientToken, {
    patientId: PATIENT_ID, medicationName: 'Test Med XR', timeOfDay: '08:00', dayOfWeek: 1,
  });
  assert('Patient POST reminder → 200/201 (upsert)', s1 === 200 || s1 === 201, `got ${s1}: ${JSON.stringify(d1?.error || '')}`);
  const remId = d1?.id;
  if (remId) createdIds.reminders.push(remId);

  // 7b. Verify in DB
  if (remId) {
    const dbRow = await prisma.patientMedicationReminder.findUnique({ where: { id: remId } });
    assert('DB reminder exists', !!dbRow);
    assert('DB medicationName is "Test Med XR"', dbRow?.medicationName === 'Test Med XR');
    assert('DB timeOfDay is "08:00"', dbRow?.timeOfDay === '08:00');
  }

  // 7c. GET reminders
  const { status: s2, data: d2 } = await api('GET', `/api/patient-progress/medication-reminders?patientId=${PATIENT_ID}`, patientToken);
  assert('Patient GET reminders → 200', s2 === 200, `got ${s2}`);
  const list = Array.isArray(d2) ? d2 : d2?.data;
  const found = Array.isArray(list) && list.find(r => r.id === remId);
  assert('Reminder visible in GET response', !!found);

  // 7d. DELETE reminder
  if (remId) {
    const { status: s3 } = await api('DELETE', `/api/patient-progress/medication-reminders?id=${remId}`, patientToken);
    assert('Patient DELETE reminder → 200', s3 === 200, `got ${s3}`);

    const dbAfter = await prisma.patientMedicationReminder.findUnique({ where: { id: remId } });
    assert('DB reminder deleted', !dbAfter);
    createdIds.reminders = createdIds.reminders.filter(id => id !== remId);
  }
}

// ═══════════════════════════════════════════════════════════════════
// TEST 7.5: ADMIN CROSS-VISIBILITY (admin sees ALL patient progress)
// ═══════════════════════════════════════════════════════════════════
async function testAdminCrossVisibility() {
  console.log('\n══════════════════════════════════════════');
  console.log('TEST 7.5: ADMIN SEES ALL PATIENT PROGRESS DATA');
  console.log('══════════════════════════════════════════');

  // Admin sees water logs
  const { status: sw, data: dw } = await api('GET', `/api/patient-progress/water?patientId=${PATIENT_ID}`, adminToken);
  assert('Admin GET water → 200', sw === 200, `got ${sw}`);
  assert('Admin water response has data', Array.isArray(dw?.data) || typeof dw?.meta === 'object');

  // Admin sees exercise logs
  const { status: se, data: de } = await api('GET', `/api/patient-progress/exercise?patientId=${PATIENT_ID}`, adminToken);
  assert('Admin GET exercise → 200', se === 200, `got ${se}`);

  // Admin sees sleep logs
  const { status: ss, data: ds } = await api('GET', `/api/patient-progress/sleep?patientId=${PATIENT_ID}`, adminToken);
  assert('Admin GET sleep → 200', ss === 200, `got ${ss}`);

  // Admin sees nutrition logs
  const { status: sn, data: dn } = await api('GET', `/api/patient-progress/nutrition?patientId=${PATIENT_ID}`, adminToken);
  assert('Admin GET nutrition → 200', sn === 200, `got ${sn}`);

  // Admin sees medication reminders
  const { status: sm, data: dm } = await api('GET', `/api/patient-progress/medication-reminders?patientId=${PATIENT_ID}`, adminToken);
  assert('Admin GET medication reminders → 200', sm === 200, `got ${sm}`);
}

// ═══════════════════════════════════════════════════════════════════
// TEST 7.6: EDGE CASES & SECURITY
// ═══════════════════════════════════════════════════════════════════
async function testEdgeCases() {
  console.log('\n══════════════════════════════════════════');
  console.log('TEST 7.6: EDGE CASES & SECURITY');
  console.log('══════════════════════════════════════════');

  // Unauthenticated access
  const { status: su } = await api('GET', `/api/patient-progress/weight?patientId=${PATIENT_ID}`, 'invalid-token');
  assert('Unauthenticated GET weight → 401', su === 401, `got ${su}`);

  // Cross-patient access (patient tries to access another patient)
  const { status: sc } = await api('GET', `/api/patient-progress/weight?patientId=99999`, patientToken);
  assert('Cross-patient GET weight → 403 (access denied)', sc === 403, `got ${sc}`);

  // Invalid weight value
  const { status: si } = await api('POST', '/api/patient-progress/weight', patientToken, {
    patientId: PATIENT_ID, weight: -50, unit: 'lbs',
  });
  assert('Negative weight rejected → 400', si === 400, `got ${si}`);

  // Missing required fields
  const { status: sm } = await api('POST', '/api/patient-progress/weight', patientToken, {
    patientId: PATIENT_ID,
  });
  assert('Missing weight field → 400', sm === 400, `got ${sm}`);

  // Extremely large weight
  const { status: sl } = await api('POST', '/api/patient-progress/weight', patientToken, {
    patientId: PATIENT_ID, weight: 999999, unit: 'lbs',
  });
  assert('Unreasonable weight rejected → 400', sl === 400, `got ${sl}`);
}

// ═══════════════════════════════════════════════════════════════════
// TEST 8: DOCUMENTS (portal API)
// ═══════════════════════════════════════════════════════════════════
async function testDocuments() {
  console.log('\n══════════════════════════════════════════');
  console.log('TEST 8: DOCUMENTS (portal API endpoints)');
  console.log('══════════════════════════════════════════');

  // 8a. GET documents via portal API (NOT /api/patients/{id}/documents)
  const { status: s1, data: d1 } = await api('GET', '/api/patient-portal/documents', patientToken);
  assert('Patient GET documents via portal API → 200', s1 === 200, `got ${s1}: ${JSON.stringify(d1?.error || '')}`);
  assert('Response has documents array (wrapped)', Array.isArray(d1?.documents), `got keys: ${Object.keys(d1 || {})}`);

  // 8b. Verify it does NOT work via the old wrong path (should 401/403 for patient direct access without proper middleware)
  const { status: s2 } = await api('GET', `/api/patients/${PATIENT_ID}/documents`, patientToken);
  // The old path might work too since it supports patient role, but the portal page was using it wrong
  assert('Old admin path also accessible (supports patient role)', s2 === 200 || s2 === 403, `got ${s2}`);
}

// ═══════════════════════════════════════════════════════════════════
// TEST 9: TRACKING / SHIPMENTS
// ═══════════════════════════════════════════════════════════════════
async function testTracking() {
  console.log('\n══════════════════════════════════════════');
  console.log('TEST 9: TRACKING & SHIPMENTS');
  console.log('══════════════════════════════════════════');

  const { status: s1, data: d1 } = await api('GET', '/api/patient-portal/tracking', patientToken);
  assert('Patient GET tracking → 200', s1 === 200, `got ${s1}: ${JSON.stringify(d1?.error || '')}`);
  assert('Response has activeShipments array', Array.isArray(d1?.activeShipments), `got keys: ${Object.keys(d1 || {})}`);
  assert('Response has deliveredShipments array', Array.isArray(d1?.deliveredShipments));
  console.log(`  ℹ️  Active shipments: ${d1?.activeShipments?.length || 0}, Delivered: ${d1?.deliveredShipments?.length || 0}`);
}

// ═══════════════════════════════════════════════════════════════════
// TEST 10: VITALS (portal + admin consistency)
// ═══════════════════════════════════════════════════════════════════
async function testVitals() {
  console.log('\n══════════════════════════════════════════');
  console.log('TEST 10: VITALS (portal API)');
  console.log('══════════════════════════════════════════');

  const { status: s1, data: d1 } = await api('GET', '/api/patient-portal/vitals', patientToken);
  assert('Patient GET vitals → 200', s1 === 200, `got ${s1}: ${JSON.stringify(d1?.error || '')}`);
  if (d1?.success && d1?.data) {
    console.log(`  ℹ️  Vitals: height=${d1.data.height}, weight=${d1.data.weight}, BMI=${d1.data.bmi}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// TEST 11: BLOODWORK (portal API)
// ═══════════════════════════════════════════════════════════════════
async function testBloodwork() {
  console.log('\n══════════════════════════════════════════');
  console.log('TEST 11: BLOODWORK (portal API)');
  console.log('══════════════════════════════════════════');

  const { status: s1, data: d1 } = await api('GET', '/api/patient-portal/bloodwork', patientToken);
  assert('Patient GET bloodwork → 200', s1 === 200, `got ${s1}: ${JSON.stringify(d1?.error || '')}`);
  assert('Response has reports array', Array.isArray(d1?.reports), `got keys: ${Object.keys(d1 || {})}`);
  console.log(`  ℹ️  Bloodwork reports: ${d1?.reports?.length || 0}`);
}

// ═══════════════════════════════════════════════════════════════════
// TEST 12: CARE TEAM (portal API)
// ═══════════════════════════════════════════════════════════════════
async function testCareTeam() {
  console.log('\n══════════════════════════════════════════');
  console.log('TEST 12: CARE TEAM (portal API)');
  console.log('══════════════════════════════════════════');

  const { status: s1, data: d1 } = await api('GET', '/api/patient-portal/care-team', patientToken);
  assert('Patient GET care-team → 200', s1 === 200, `got ${s1}`);
  assert('Response has providers array', Array.isArray(d1?.providers), `got keys: ${Object.keys(d1 || {})}`);
  console.log(`  ℹ️  Care team providers: ${d1?.providers?.length || 0}`);
}

// ═══════════════════════════════════════════════════════════════════
// CLEANUP & REPORT
// ═══════════════════════════════════════════════════════════════════
async function cleanup() {
  console.log('\n══════════════════════════════════════════');
  console.log('CLEANUP: Removing test data');
  console.log('══════════════════════════════════════════');

  if (createdIds.weightLogs.length)
    await prisma.patientWeightLog.deleteMany({ where: { id: { in: createdIds.weightLogs } } });
  if (createdIds.waterLogs.length)
    await prisma.patientWaterLog.deleteMany({ where: { id: { in: createdIds.waterLogs } } });
  if (createdIds.exerciseLogs.length)
    await prisma.patientExerciseLog.deleteMany({ where: { id: { in: createdIds.exerciseLogs } } });
  if (createdIds.sleepLogs.length)
    await prisma.patientSleepLog.deleteMany({ where: { id: { in: createdIds.sleepLogs } } });
  if (createdIds.nutritionLogs.length)
    await prisma.patientNutritionLog.deleteMany({ where: { id: { in: createdIds.nutritionLogs } } });
  if (createdIds.reminders.length)
    await prisma.patientMedicationReminder.deleteMany({ where: { id: { in: createdIds.reminders } } });

  const total = Object.values(createdIds).reduce((s, a) => s + a.length, 0);
  console.log(`  Cleaned up ${total} test records`);
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   DEEP PATIENT PORTAL END-TO-END TEST SUITE          ║');
  console.log('║   Patient: id=11, User: id=14, Clinic: id=8          ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  try {
    await testWeight();
    await testWater();
    await testExercise();
    await testSleep();
    await testNutrition();
    await testProfile();
    await testMedicationReminders();
    await testAdminCrossVisibility();
    await testEdgeCases();
    await testDocuments();
    await testTracking();
    await testVitals();
    await testBloodwork();
    await testCareTeam();
  } catch (err) {
    console.error('\n💥 UNHANDLED ERROR:', err.message);
    failed++;
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log(`║   RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('╚═══════════════════════════════════════════════════════╝');

  if (failures.length > 0) {
    console.log('\nFailed assertions:');
    failures.forEach(f => console.log(f));
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
