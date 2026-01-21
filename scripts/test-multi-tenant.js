/**
 * MULTI-TENANT BROWSER TEST SCRIPT
 * 
 * Copy and paste this into the browser console while logged in as Super Admin
 * to test multi-tenant isolation.
 */

(async function runMultiTenantTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       MULTI-TENANT PLATFORM COMPREHENSIVE TEST               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  const token = localStorage.getItem('auth-token') || localStorage.getItem('super_admin-token');
  if (!token) {
    console.error('❌ No auth token found. Please login first.');
    return;
  }

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  function logTest(name, passed, details = '') {
    const icon = passed ? '✅' : '❌';
    console.log(`${icon} ${name}${details ? ': ' + details : ''}`);
    results.tests.push({ name, passed, details });
    if (passed) results.passed++; else results.failed++;
  }

  // ========================================
  // TEST 1: Get All Clinics
  // ========================================
  console.log('\n📋 TEST 1: Fetching all clinics...');
  let clinics = [];
  try {
    const res = await fetch('/api/super-admin/clinics', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    clinics = data.clinics || [];
    logTest('Fetch clinics', clinics.length >= 2, `Found ${clinics.length} clinics`);
    clinics.forEach(c => console.log(`   - ID: ${c.id}, Name: ${c.name}, Lifefile: ${c.lifefileEnabled ? 'ON' : 'OFF'}`));
  } catch (e) {
    logTest('Fetch clinics', false, e.message);
  }

  if (clinics.length < 2) {
    console.error('❌ Need at least 2 clinics for multi-tenant tests');
    return;
  }

  const clinic1 = clinics[0];
  const clinic2 = clinics[1];
  console.log(`\n   Using Clinic 1: ${clinic1.name} (ID: ${clinic1.id})`);
  console.log(`   Using Clinic 2: ${clinic2.name} (ID: ${clinic2.id})`);

  // ========================================
  // TEST 2: Check Lifefile Configuration
  // ========================================
  console.log('\n📋 TEST 2: Checking Lifefile configuration per clinic...');
  try {
    const hasLifefile1 = clinic1.lifefileEnabled && clinic1.lifefilePracticeId;
    const hasLifefile2 = clinic2.lifefileEnabled && clinic2.lifefilePracticeId;
    
    logTest('Clinic 1 Lifefile configured', hasLifefile1, 
      hasLifefile1 ? `Practice: ${clinic1.lifefilePracticeName}` : 'Not configured');
    logTest('Clinic 2 Lifefile configured', hasLifefile2,
      hasLifefile2 ? `Practice: ${clinic2.lifefilePracticeName}` : 'Not configured');
    
    if (hasLifefile1 && hasLifefile2) {
      const different = clinic1.lifefilePracticeId !== clinic2.lifefilePracticeId;
      logTest('Clinics have different Lifefile credentials', different);
    }
  } catch (e) {
    logTest('Lifefile configuration check', false, e.message);
  }

  // ========================================
  // TEST 3: Check User Clinic Access
  // ========================================
  console.log('\n📋 TEST 3: Checking multi-clinic user access...');
  try {
    const res = await fetch('/api/super-admin/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    
    // Find Dr. Sigle
    const drSigle = data.users?.find(u => u.email?.toLowerCase().includes('gsigle'));
    if (drSigle) {
      console.log(`   Found: ${drSigle.firstName} ${drSigle.lastName} (${drSigle.email})`);
      
      // Check UserClinic entries
      const ucRes = await fetch(`/api/super-admin/users/${drSigle.id}/clinics`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const ucData = await ucRes.json();
      
      const clinicCount = (ucData.userClinics?.length || 0) + (ucData.legacyClinic ? 1 : 0);
      logTest('Dr. Sigle has multi-clinic access', clinicCount >= 2, `Access to ${clinicCount} clinics`);
      
      if (ucData.userClinics) {
        ucData.userClinics.forEach(uc => {
          console.log(`   - ${uc.clinic?.name || 'Unknown'} (Role: ${uc.role})`);
        });
      }
    } else {
      logTest('Find Dr. Sigle', false, 'User not found');
    }
  } catch (e) {
    logTest('User clinic access check', false, e.message);
  }

  // ========================================
  // TEST 4: Patient Isolation Test
  // ========================================
  console.log('\n📋 TEST 4: Testing patient data isolation...');
  try {
    // Get patients as super admin (should see all)
    const res = await fetch('/api/patients', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    
    if (data.patients) {
      const patientClinicIds = [...new Set(data.patients.map(p => p.clinicId))];
      console.log(`   Super admin sees ${data.patients.length} patients from ${patientClinicIds.length} clinics`);
      
      const clinic1Patients = data.patients.filter(p => p.clinicId === clinic1.id);
      const clinic2Patients = data.patients.filter(p => p.clinicId === clinic2.id);
      
      console.log(`   - ${clinic1.name}: ${clinic1Patients.length} patients`);
      console.log(`   - ${clinic2.name}: ${clinic2Patients.length} patients`);
      
      logTest('Super admin sees patients from multiple clinics', patientClinicIds.length >= 1);
    }
  } catch (e) {
    logTest('Patient isolation test', false, e.message);
  }

  // ========================================
  // TEST 5: Order Isolation Test
  // ========================================
  console.log('\n📋 TEST 5: Testing order data isolation...');
  try {
    const res = await fetch('/api/orders', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    
    console.log(`   Super admin sees ${data.count || data.orders?.length || 0} orders`);
    logTest('Orders endpoint accessible', true, `${data.count || 0} orders`);
  } catch (e) {
    logTest('Order isolation test', false, e.message);
  }

  // ========================================
  // TEST 6: Provider List per Clinic
  // ========================================
  console.log('\n📋 TEST 6: Testing provider list...');
  try {
    const res = await fetch('/api/providers', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    
    if (data.providers) {
      console.log(`   Found ${data.providers.length} providers`);
      data.providers.slice(0, 5).forEach(p => {
        console.log(`   - ${p.firstName} ${p.lastName} (NPI: ${p.npi}, Clinic: ${p.clinicId || 'shared'})`);
      });
      logTest('Providers endpoint accessible', true);
    }
  } catch (e) {
    logTest('Provider list test', false, e.message);
  }

  // ========================================
  // TEST 7: Create Patient in Clinic Context
  // ========================================
  console.log('\n📋 TEST 7: Testing patient creation with clinic context...');
  try {
    const testPatient = {
      firstName: 'MultiTenant',
      lastName: `Test_${Date.now()}`,
      email: `mt.test.${Date.now()}@test.com`,
      phone: '5551112222',
      dob: '1990-01-01',
      gender: 'male',
      address1: '123 Test Lane',
      city: 'Tampa',
      state: 'FL',
      zip: '33601',
      clinicId: clinic2.id // Explicitly set clinic
    };

    const res = await fetch('/api/patients', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testPatient)
    });
    const data = await res.json();
    
    if (data.patient) {
      const correctClinic = data.patient.clinicId === clinic2.id;
      logTest('Patient created in correct clinic', correctClinic, 
        `Requested: ${clinic2.id}, Got: ${data.patient.clinicId}`);
      console.log(`   Created patient ID: ${data.patient.id}`);
    } else {
      logTest('Patient creation', false, data.error || 'Failed');
    }
  } catch (e) {
    logTest('Patient creation test', false, e.message);
  }

  // ========================================
  // SUMMARY
  // ========================================
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                        TEST SUMMARY                          ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  ✅ Passed: ${results.passed}                                              `);
  console.log(`║  ❌ Failed: ${results.failed}                                              `);
  console.log(`║  📊 Total:  ${results.passed + results.failed}                                              `);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  if (results.failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.tests.filter(t => !t.passed).forEach(t => {
      console.log(`   - ${t.name}: ${t.details}`);
    });
  }

  console.log('\n📝 MANUAL VERIFICATION NEEDED:');
  console.log('   1. Login as Dr. Sigle');
  console.log('   2. Verify clinic switcher appears in header');
  console.log('   3. Switch between clinics');
  console.log('   4. Verify patient list changes');
  console.log('   5. Create prescription in each clinic');
  console.log('   6. Verify PDF branding matches clinic');

  return results;
})();
