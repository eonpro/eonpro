/**
 * Medication Mapping Validation Script
 * 
 * This script validates that:
 * 1. All GLP-1 products (Semaglutide/Tirzepatide) have correct mappings
 * 2. Product IDs map to correct medication names
 * 3. Sig templates have correct unit calculations for each concentration
 * 4. LifeFile payload would contain correct data
 * 
 * Run: npx tsx scripts/validate-medication-mappings.ts
 */

// Use require to avoid ESM path resolution issues
/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path');

// Add path alias resolution
require('tsconfig-paths/register');

// Import the modules
const { LOGOS_PRODUCTS } = require('../src/data/logosProducts');
const { MEDS } = require('../src/lib/medications');

// Colors for console output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

interface ValidationResult {
  passed: boolean;
  message: string;
  details?: any;
}

interface TestReport {
  totalTests: number;
  passed: number;
  failed: number;
  warnings: number;
  results: ValidationResult[];
}

const report: TestReport = {
  totalTests: 0,
  passed: 0,
  failed: 0,
  warnings: 0,
  results: [],
};

function logTest(name: string, result: ValidationResult) {
  report.totalTests++;
  if (result.passed) {
    report.passed++;
    console.log(`${GREEN}✓${RESET} ${name}`);
  } else {
    report.failed++;
    console.log(`${RED}✗${RESET} ${name}`);
    console.log(`  ${RED}${result.message}${RESET}`);
    if (result.details) {
      console.log(`  ${YELLOW}Details:${RESET}`, JSON.stringify(result.details, null, 2));
    }
  }
  report.results.push(result);
}

function logWarning(message: string) {
  report.warnings++;
  console.log(`${YELLOW}⚠${RESET} ${message}`);
}

// ============================================================================
// TEST: Semaglutide Product Mappings
// ============================================================================
function testSemaglutideProducts() {
  console.log(`\n${BOLD}${BLUE}═══ SEMAGLUTIDE PRODUCT MAPPINGS ═══${RESET}\n`);

  const semaglutideProducts = LOGOS_PRODUCTS.filter(p => 
    p.name.toLowerCase().includes('semaglutide')
  );

  console.log(`Found ${semaglutideProducts.length} Semaglutide products in LOGOS_PRODUCTS:\n`);

  semaglutideProducts.forEach(product => {
    console.log(`${BOLD}Product ID: ${product.id}${RESET}`);
    console.log(`  LOGOS Name: ${product.name}`);
    console.log(`  Strength: ${product.strength}`);
    
    const medKey = String(product.id);
    const med = MEDS[medKey];

    // Test 1: Product exists in MEDS
    logTest(`  [${product.id}] Exists in MEDS`, {
      passed: !!med,
      message: med ? '' : `Product ID ${product.id} not found in MEDS`,
    });

    if (med) {
      // Test 2: Name contains SEMAGLUTIDE
      logTest(`  [${product.id}] Name contains "SEMAGLUTIDE"`, {
        passed: med.name.toUpperCase().includes('SEMAGLUTIDE'),
        message: `Name "${med.name}" does not contain SEMAGLUTIDE`,
        details: { actualName: med.name },
      });

      // Test 3: ID matches
      logTest(`  [${product.id}] ID matches (lfProductID)`, {
        passed: med.id === product.id,
        message: `ID mismatch: expected ${product.id}, got ${med.id}`,
        details: { expected: product.id, actual: med.id },
      });

      // Test 4: Does NOT contain TIRZEPATIDE
      logTest(`  [${product.id}] Name does NOT contain "TIRZEPATIDE"`, {
        passed: !med.name.toUpperCase().includes('TIRZEPATIDE'),
        message: `Semaglutide product incorrectly named as Tirzepatide`,
        details: { name: med.name },
      });

      console.log(`  ${GREEN}MEDS Name: ${med.name}${RESET}`);
      console.log(`  ${GREEN}MEDS ID: ${med.id}${RESET}`);
    }
    console.log('');
  });
}

// ============================================================================
// TEST: Tirzepatide Product Mappings
// ============================================================================
function testTirzepatideProducts() {
  console.log(`\n${BOLD}${BLUE}═══ TIRZEPATIDE PRODUCT MAPPINGS ═══${RESET}\n`);

  const tirzepatideProducts = LOGOS_PRODUCTS.filter(p => 
    p.name.toLowerCase().includes('tirzepatide')
  );

  console.log(`Found ${tirzepatideProducts.length} Tirzepatide products in LOGOS_PRODUCTS:\n`);

  tirzepatideProducts.forEach(product => {
    console.log(`${BOLD}Product ID: ${product.id}${RESET}`);
    console.log(`  LOGOS Name: ${product.name}`);
    console.log(`  Strength: ${product.strength}`);
    
    const medKey = String(product.id);
    const med = MEDS[medKey];

    // Test 1: Product exists in MEDS
    logTest(`  [${product.id}] Exists in MEDS`, {
      passed: !!med,
      message: med ? '' : `Product ID ${product.id} not found in MEDS`,
    });

    if (med) {
      // Test 2: Name contains TIRZEPATIDE
      logTest(`  [${product.id}] Name contains "TIRZEPATIDE"`, {
        passed: med.name.toUpperCase().includes('TIRZEPATIDE'),
        message: `Name "${med.name}" does not contain TIRZEPATIDE`,
        details: { actualName: med.name },
      });

      // Test 3: ID matches
      logTest(`  [${product.id}] ID matches (lfProductID)`, {
        passed: med.id === product.id,
        message: `ID mismatch: expected ${product.id}, got ${med.id}`,
        details: { expected: product.id, actual: med.id },
      });

      // Test 4: Does NOT contain SEMAGLUTIDE
      logTest(`  [${product.id}] Name does NOT contain "SEMAGLUTIDE"`, {
        passed: !med.name.toUpperCase().includes('SEMAGLUTIDE'),
        message: `Tirzepatide product incorrectly named as Semaglutide`,
        details: { name: med.name },
      });

      console.log(`  ${GREEN}MEDS Name: ${med.name}${RESET}`);
      console.log(`  ${GREEN}MEDS ID: ${med.id}${RESET}`);
    }
    console.log('');
  });
}

// ============================================================================
// TEST: Sig Template Unit Calculations
// ============================================================================
function testSigTemplateUnits() {
  console.log(`\n${BOLD}${BLUE}═══ SIG TEMPLATE UNIT CALCULATIONS ═══${RESET}\n`);

  // Semaglutide: 2.5 mg/mL concentration
  // Correct calculations:
  // 0.25 mg / 2.5 = 0.1 mL = 10 units
  // 0.5 mg / 2.5 = 0.2 mL = 20 units
  // 1.0 mg / 2.5 = 0.4 mL = 40 units
  
  const semaglutideExpected = [
    { dose: 0.25, ml: 0.1, units: 10 },
    { dose: 0.5, ml: 0.2, units: 20 },
    { dose: 1.0, ml: 0.4, units: 40 },
  ];

  console.log(`${BOLD}Semaglutide (2.5 mg/mL concentration):${RESET}`);
  
  // Get a Semaglutide product to check its sig templates
  const semaProduct = MEDS['203448947']; // 2ML vial
  if (semaProduct?.sigTemplates) {
    semaProduct.sigTemplates.forEach((template, idx) => {
      const expected = semaglutideExpected[idx];
      if (expected) {
        // Check if sig contains correct units
        const hasCorrectUnits = template.sig.includes(`${expected.ml} mL`) && 
                                template.sig.includes(`${expected.units} units`);
        
        // Check for wrong units (1 mg/mL calculation)
        const hasWrongUnits = template.sig.includes(`${expected.dose} mL`) && 
                              template.sig.includes(`${expected.dose * 100} units`);
        
        logTest(`  Template "${template.label}" has correct units`, {
          passed: hasCorrectUnits && !hasWrongUnits,
          message: hasWrongUnits 
            ? `Using wrong 1 mg/mL calculation instead of 2.5 mg/mL`
            : `Expected ${expected.ml} mL / ${expected.units} units`,
          details: {
            expectedMl: expected.ml,
            expectedUnits: expected.units,
            actualSig: template.sig,
          },
        });
      }
    });
  }

  // Semaglutide 5 mg/mL concentration (HIGHER concentration vial)
  // Correct calculations:
  // 0.25 mg / 5 = 0.05 mL = 5 units
  // 0.5 mg / 5 = 0.1 mL = 10 units
  // 1.0 mg / 5 = 0.2 mL = 20 units
  
  const semaglutide5mgExpected = [
    { dose: 0.25, ml: 0.05, units: 5 },
    { dose: 0.5, ml: 0.1, units: 10 },
    { dose: 1.0, ml: 0.2, units: 20 },
  ];

  console.log(`\n${BOLD}Semaglutide 5 mg/mL (HIGHER concentration):${RESET}`);
  
  // Get the 5 mg/mL Semaglutide product to check its sig templates
  const sema5mgProduct = MEDS['202851329']; // 5 mg/mL vial
  if (sema5mgProduct?.sigTemplates) {
    sema5mgProduct.sigTemplates.forEach((template: any, idx: number) => {
      const expected = semaglutide5mgExpected[idx];
      if (expected) {
        // Check if sig contains correct units
        const hasCorrectUnits = template.sig.includes(`${expected.ml} mL`) && 
                                template.sig.includes(`${expected.units} units`);
        
        // Check for WRONG units (2.5 mg/mL calculation applied to 5 mg/mL vial)
        const hasWrongUnits = template.sig.includes(`${expected.dose / 2.5} mL`);
        
        logTest(`  Template "${template.label}" has correct units`, {
          passed: hasCorrectUnits && !hasWrongUnits,
          message: hasWrongUnits 
            ? `CRITICAL: Using wrong 2.5 mg/mL calculation instead of 5 mg/mL - would DOUBLE the dose!`
            : `Expected ${expected.ml} mL / ${expected.units} units`,
          details: {
            expectedMl: expected.ml,
            expectedUnits: expected.units,
            actualSig: template.sig,
          },
        });
      }
    });
  } else {
    logTest(`  5 mg/mL Semaglutide has sig templates`, {
      passed: false,
      message: `Product 202851329 (5 mg/mL Semaglutide) has no sig templates`,
    });
  }

  // Tirzepatide: 10 mg/mL concentration
  // Correct calculations:
  // 2.5 mg / 10 = 0.25 mL = 25 units
  // 5.0 mg / 10 = 0.5 mL = 50 units
  // 10 mg / 10 = 1.0 mL = 100 units
  
  const tirzepatideExpected = [
    { dose: 2.5, ml: 0.25, units: 25 },
    { dose: 5.0, ml: 0.5, units: 50 },
    { dose: 10, ml: 1.0, units: 100 },
  ];

  console.log(`\n${BOLD}Tirzepatide (10 mg/mL concentration):${RESET}`);
  
  // Get a Tirzepatide product to check its sig templates
  const tirzProduct = MEDS['203448973']; // 2ML vial
  if (tirzProduct?.sigTemplates) {
    tirzProduct.sigTemplates.forEach((template: any, idx: number) => {
      const expected = tirzepatideExpected[idx];
      if (expected) {
        // Check if sig contains correct units
        const hasCorrectUnits = template.sig.includes(`${expected.ml} mL`) && 
                                template.sig.includes(`${expected.units} units`);
        
        logTest(`  Template "${template.label}" has correct units`, {
          passed: hasCorrectUnits,
          message: `Expected ${expected.ml} mL / ${expected.units} units`,
          details: {
            expectedMl: expected.ml,
            expectedUnits: expected.units,
            actualSig: template.sig,
          },
        });
      }
    });
  }

  // Tirzepatide 15 mg/mL concentration (HIGHER concentration vial)
  // Correct calculations:
  // 2.5 mg / 15 = 0.167 mL = 17 units
  // 5.0 mg / 15 = 0.333 mL = 33 units
  // 10 mg / 15 = 0.667 mL = 67 units
  // 15 mg / 15 = 1.0 mL = 100 units
  
  const tirzepatide15mgExpected = [
    { dose: 2.5, ml: 0.17, units: 17 },
    { dose: 5.0, ml: 0.33, units: 33 },
    { dose: 10, ml: 0.67, units: 67 },
    { dose: 15, ml: 1, units: 100 },
  ];

  console.log(`\n${BOLD}Tirzepatide 15 mg/mL (HIGHER concentration):${RESET}`);
  
  const tirz15mgProduct = MEDS['203449362']; // 15 mg/mL vial
  if (tirz15mgProduct?.sigTemplates) {
    tirz15mgProduct.sigTemplates.forEach((template: any, idx: number) => {
      const expected = tirzepatide15mgExpected[idx];
      if (expected) {
        const hasCorrectUnits = template.sig.includes(`${expected.ml} mL`) && 
                                template.sig.includes(`${expected.units} units`);
        
        // Check for WRONG units (10 mg/mL calculation applied to 15 mg/mL vial)
        const hasWrongUnits = template.sig.includes(`0.25 mL`) && template.label.includes("2.5 mg");
        
        logTest(`  Template "${template.label}" has correct units`, {
          passed: hasCorrectUnits && !hasWrongUnits,
          message: hasWrongUnits 
            ? `CRITICAL: Using wrong 10 mg/mL calculation instead of 15 mg/mL`
            : `Expected ${expected.ml} mL / ${expected.units} units`,
          details: {
            expectedMl: expected.ml,
            expectedUnits: expected.units,
            actualSig: template.sig,
          },
        });
      }
    });
  } else {
    logTest(`  15 mg/mL Tirzepatide has sig templates`, {
      passed: false,
      message: `Product 203449362 (15 mg/mL Tirzepatide) has no sig templates`,
    });
  }

  // Tirzepatide 30 mg/mL concentration (HIGHEST concentration vial)
  // Correct calculations:
  // 2.5 mg / 30 = 0.083 mL = 8 units
  // 5.0 mg / 30 = 0.167 mL = 17 units
  // 10 mg / 30 = 0.333 mL = 33 units
  // 15 mg / 30 = 0.5 mL = 50 units
  
  const tirzepatide30mgExpected = [
    { dose: 2.5, ml: 0.08, units: 8 },
    { dose: 5.0, ml: 0.17, units: 17 },
    { dose: 10, ml: 0.33, units: 33 },
    { dose: 15, ml: 0.5, units: 50 },
  ];

  console.log(`\n${BOLD}Tirzepatide 30 mg/mL (HIGHEST concentration):${RESET}`);
  
  const tirz30mgProduct = MEDS['203418602']; // 30 mg/mL vial
  if (tirz30mgProduct?.sigTemplates) {
    tirz30mgProduct.sigTemplates.forEach((template: any, idx: number) => {
      const expected = tirzepatide30mgExpected[idx];
      if (expected) {
        const hasCorrectUnits = template.sig.includes(`${expected.ml} mL`) && 
                                template.sig.includes(`${expected.units} units`);
        
        // Check for WRONG units (10 mg/mL calculation applied to 30 mg/mL vial)
        const hasWrongUnits = template.sig.includes(`0.25 mL`) && template.label.includes("2.5 mg");
        
        logTest(`  Template "${template.label}" has correct units`, {
          passed: hasCorrectUnits && !hasWrongUnits,
          message: hasWrongUnits 
            ? `CRITICAL: Using wrong 10 mg/mL calculation instead of 30 mg/mL`
            : `Expected ${expected.ml} mL / ${expected.units} units`,
          details: {
            expectedMl: expected.ml,
            expectedUnits: expected.units,
            actualSig: template.sig,
          },
        });
      }
    });
  } else {
    logTest(`  30 mg/mL Tirzepatide has sig templates`, {
      passed: false,
      message: `Product 203418602 (30 mg/mL Tirzepatide) has no sig templates`,
    });
  }
}

// ============================================================================
// TEST: Simulate LifeFile Payload
// ============================================================================
function testLifeFilePayload() {
  console.log(`\n${BOLD}${BLUE}═══ SIMULATED LIFEFILE PAYLOAD ═══${RESET}\n`);

  // Test what would be sent to LifeFile for each GLP-1 product
  const glp1Products = LOGOS_PRODUCTS.filter(p => 
    p.name.toLowerCase().includes('semaglutide') || 
    p.name.toLowerCase().includes('tirzepatide')
  );

  console.log(`Simulating LifeFile payload for ${glp1Products.length} GLP-1 products:\n`);

  glp1Products.forEach(product => {
    const medKey = String(product.id);
    const med = MEDS[medKey];

    if (med) {
      // This is what would be sent to LifeFile
      const payload = {
        drugName: med.name,
        drugStrength: med.strength,
        drugForm: med.formLabel ?? med.form,
        lfProductID: med.id,
      };

      const isCorrectType = 
        (product.name.includes('SEMAGLUTIDE') && med.name.includes('SEMAGLUTIDE')) ||
        (product.name.includes('TIRZEPATIDE') && med.name.includes('TIRZEPATIDE'));

      const expectedType = product.name.includes('TIRZEPATIDE') ? 'TIRZEPATIDE' : 'SEMAGLUTIDE';
      const actualType = med.name.includes('TIRZEPATIDE') ? 'TIRZEPATIDE' : 
                         med.name.includes('SEMAGLUTIDE') ? 'SEMAGLUTIDE' : 'UNKNOWN';

      logTest(`[${product.id}] LifeFile payload matches expected type`, {
        passed: isCorrectType,
        message: isCorrectType ? '' : `Expected ${expectedType}, sending ${actualType}`,
        details: {
          expectedProductName: product.name,
          payloadDrugName: payload.drugName,
          payloadLfProductID: payload.lfProductID,
          expectedType,
          actualType,
        },
      });

      if (!isCorrectType) {
        console.log(`  ${RED}CRITICAL: Would send wrong medication type to LifeFile!${RESET}`);
        console.log(`  ${YELLOW}Expected: ${product.name}${RESET}`);
        console.log(`  ${YELLOW}Sending:  ${payload.drugName} (ID: ${payload.lfProductID})${RESET}`);
      } else {
        console.log(`  ${GREEN}✓ Payload: ${payload.drugName} (ID: ${payload.lfProductID})${RESET}`);
      }
    }
  });
}

// ============================================================================
// TEST: Cross-reference Check
// ============================================================================
function testCrossReference() {
  console.log(`\n${BOLD}${BLUE}═══ CROSS-REFERENCE VALIDATION ═══${RESET}\n`);

  console.log('Checking that selecting a medication key returns the correct product:\n');

  const testCases = [
    { key: '203448947', expectedName: 'SEMAGLUTIDE', expectedType: 'Semaglutide 2ML vial' },
    { key: '203448971', expectedName: 'SEMAGLUTIDE', expectedType: 'Semaglutide 1ML vial' },
    { key: '203449363', expectedName: 'SEMAGLUTIDE', expectedType: 'Semaglutide 3ML vial' },
    { key: '203448973', expectedName: 'TIRZEPATIDE', expectedType: 'Tirzepatide 2ML vial' },
    { key: '203448972', expectedName: 'TIRZEPATIDE', expectedType: 'Tirzepatide 1ML vial' },
    { key: '203449364', expectedName: 'TIRZEPATIDE', expectedType: 'Tirzepatide 3ML vial' },
    { key: '203449500', expectedName: 'TIRZEPATIDE', expectedType: 'Tirzepatide 4ML vial' },
    { key: '203418602', expectedName: 'TIRZEPATIDE', expectedType: 'Tirzepatide 30mg/mL 2ML vial' },
  ];

  testCases.forEach(({ key, expectedName, expectedType }) => {
    const med = MEDS[key];
    const passed = med && med.name.toUpperCase().includes(expectedName);
    
    logTest(`Key "${key}" → ${expectedType}`, {
      passed: !!passed,
      message: passed ? '' : `Expected name to contain "${expectedName}", got "${med?.name || 'NOT FOUND'}"`,
      details: {
        medicationKey: key,
        expectedContains: expectedName,
        actualName: med?.name,
        actualId: med?.id,
      },
    });
  });
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================
async function main() {
  console.log(`\n${BOLD}╔═══════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}║     MEDICATION MAPPING VALIDATION - DEEP TEST                  ║${RESET}`);
  console.log(`${BOLD}╚═══════════════════════════════════════════════════════════════╝${RESET}\n`);

  console.log(`Testing that medications selected in the UI will be correctly`);
  console.log(`transmitted to LifeFile with matching names and product IDs.\n`);

  // Run all tests
  testSemaglutideProducts();
  testTirzepatideProducts();
  testSigTemplateUnits();
  testLifeFilePayload();
  testCrossReference();

  // Print summary
  console.log(`\n${BOLD}╔═══════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}║                        TEST SUMMARY                            ║${RESET}`);
  console.log(`${BOLD}╚═══════════════════════════════════════════════════════════════╝${RESET}\n`);

  console.log(`Total Tests: ${report.totalTests}`);
  console.log(`${GREEN}Passed: ${report.passed}${RESET}`);
  console.log(`${RED}Failed: ${report.failed}${RESET}`);
  console.log(`${YELLOW}Warnings: ${report.warnings}${RESET}`);

  if (report.failed > 0) {
    console.log(`\n${RED}${BOLD}⚠️  CRITICAL: ${report.failed} test(s) failed!${RESET}`);
    console.log(`${RED}There may be medication mapping issues that could cause wrong medications to be sent to LifeFile.${RESET}\n`);
    process.exit(1);
  } else {
    console.log(`\n${GREEN}${BOLD}✅ All tests passed! Medication mappings are correct.${RESET}`);
    console.log(`${GREEN}Medications selected in the UI will be correctly transmitted to LifeFile.${RESET}\n`);
    process.exit(0);
  }
}

main().catch(console.error);
