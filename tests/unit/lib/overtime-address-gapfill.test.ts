/**
 * Overtime Intake Normalizer — Address Gap-Fill & Treatment Detection Tests
 *
 * Verifies that:
 * 1. Address components from separate Airtable fields supplement a parsed combined address
 * 2. Treatment type detection recognises Airtable-specific field names
 * 3. Full end-to-end normalisation produces correct patient data for each treatment
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeOvertimePayload,
  detectTreatmentType,
} from '@/lib/overtime/intakeNormalizer';

// ═══════════════════════════════════════════════════════════════════
// 1. ADDRESS GAP-FILL — Individual Airtable fields fill missing parts
// ═══════════════════════════════════════════════════════════════════

describe('Address gap-fill from individual Airtable fields', () => {
  it('fills city/zip/apartment when combined Address only has street', () => {
    const payload = {
      'First name': 'John',
      'Last name': 'Doe',
      email: 'john@example.com',
      treatmentType: 'weight_loss',
      Address: '1208 E Kennedy Blvd',
      City: 'Tampa',
      State: 'Florida',
      ZIP: '33602',
      'apartment#': '34',
    };

    const result = normalizeOvertimePayload(payload);
    expect(result.patient.address1).toBe('1208 E Kennedy Blvd');
    expect(result.patient.city).toBe('Tampa');
    expect(result.patient.state).toBe('FL');
    expect(result.patient.zip).toBe('33602');
    expect(result.patient.address2).toBe('34');
  });

  it('fills ZIP from all-caps "ZIP" field name', () => {
    const payload = {
      'First name': 'Jane',
      'Last name': 'Smith',
      email: 'jane@example.com',
      treatmentType: 'peptides',
      Address: '500 Main St, Orlando, FL',
      ZIP: '32801',
    };

    const result = normalizeOvertimePayload(payload);
    expect(result.patient.zip).toBe('32801');
  });

  it('fills ZIP from "Postal Code" field name', () => {
    const payload = {
      'First name': 'Bob',
      'Last name': 'Jones',
      email: 'bob@example.com',
      treatmentType: 'trt',
      Address: '200 Oak Ave, Miami, FL',
      'Postal Code': '33101',
    };

    const result = normalizeOvertimePayload(payload);
    expect(result.patient.zip).toBe('33101');
  });

  it('fills ZIP from "PostalCode" field name (camelCase)', () => {
    const payload = {
      'First name': 'Alice',
      'Last name': 'Brown',
      email: 'alice@example.com',
      treatmentType: 'nad',
      Address: '300 Pine Rd, Jacksonville, FL',
      PostalCode: '32099',
    };

    const result = normalizeOvertimePayload(payload);
    expect(result.patient.zip).toBe('32099');
  });

  it('fills city from lowercase "city" field', () => {
    const payload = {
      'First name': 'Tom',
      'Last name': 'Lee',
      email: 'tom@example.com',
      treatmentType: 'weight-loss',
      Address: '400 Elm St',
      city: 'Austin',
      State: 'TX',
      zip: '73301',
    };

    const result = normalizeOvertimePayload(payload);
    expect(result.patient.city).toBe('Austin');
    expect(result.patient.state).toBe('TX');
    expect(result.patient.zip).toBe('73301');
  });

  it('fills apartment from "Apartment" field', () => {
    const payload = {
      'First name': 'Sara',
      'Last name': 'White',
      email: 'sara@example.com',
      treatmentType: 'better-sex',
      Address: '600 Birch Ln, Denver, CO 80202',
      Apartment: 'Unit 5B',
    };

    const result = normalizeOvertimePayload(payload);
    expect(result.patient.address2).toBe('Unit 5B');
  });

  it('does not overwrite components already parsed from combined address', () => {
    const payload = {
      'First name': 'Mike',
      'Last name': 'Green',
      email: 'mike@example.com',
      treatmentType: 'weight_loss',
      Address: '789 Maple Ave, Orlando, FL 32801',
      City: 'WRONG_CITY',
      ZIP: '99999',
    };

    const result = normalizeOvertimePayload(payload);
    expect(result.patient.city).toBe('Orlando');
    expect(result.patient.zip).toBe('32801');
  });

  it('fills state from "Address [State]" bracket notation', () => {
    const payload = {
      'First name': 'Dan',
      'Last name': 'Black',
      email: 'dan@example.com',
      treatmentType: 'peptides',
      'Address [Street]': '100 First St',
      'Address [City]': 'Boston',
      'Address [State]': 'Massachusetts',
      'Address [Zip]': '02101',
    };

    const result = normalizeOvertimePayload(payload);
    expect(result.patient.address1).toBe('100 First St');
    expect(result.patient.city).toBe('Boston');
    expect(result.patient.state).toBe('MA');
    expect(result.patient.zip).toBe('02101');
  });

  it('handles completely empty Address with only individual fields', () => {
    const payload = {
      'First name': 'Emily',
      'Last name': 'Clark',
      email: 'emily@example.com',
      treatmentType: 'baseline',
      City: 'Houston',
      State: 'Texas',
      ZIP: '77002',
      'apartment#': '12A',
    };

    const result = normalizeOvertimePayload(payload);
    expect(result.patient.city).toBe('Houston');
    expect(result.patient.state).toBe('TX');
    expect(result.patient.zip).toBe('77002');
    expect(result.patient.address2).toBe('12A');
  });

  it('handles Heyflow JSON address component', () => {
    const payload = {
      'First name': 'Alex',
      'Last name': 'Rivera',
      email: 'alex@example.com',
      treatmentType: 'weight_loss',
      Address: JSON.stringify({
        street: 'Maple Dr',
        house: '450',
        city: 'Charlotte',
        state_code: 'NC',
        zip: '28202',
      }),
    };

    const result = normalizeOvertimePayload(payload);
    expect(result.patient.address1).toBe('450 Maple Dr');
    expect(result.patient.city).toBe('Charlotte');
    expect(result.patient.state).toBe('NC');
    expect(result.patient.zip).toBe('28202');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. TREATMENT TYPE DETECTION — Airtable field heuristics
// ═══════════════════════════════════════════════════════════════════

describe('Treatment type detection from Airtable field names', () => {
  describe('explicit treatmentType field', () => {
    it('detects weight-loss from Airtable script', () => {
      expect(detectTreatmentType({ treatmentType: 'weight-loss' })).toBe('weight_loss');
    });

    it('detects trt from Airtable script', () => {
      expect(detectTreatmentType({ treatmentType: 'trt' })).toBe('testosterone');
    });

    it('detects peptides from Airtable script', () => {
      expect(detectTreatmentType({ treatmentType: 'peptides' })).toBe('peptides');
    });

    it('detects nad from Airtable script', () => {
      expect(detectTreatmentType({ treatmentType: 'nad' })).toBe('nad_plus');
    });

    it('detects baseline from Airtable script', () => {
      expect(detectTreatmentType({ treatmentType: 'baseline' })).toBe('baseline_bloodwork');
    });

    it('detects better-sex from Airtable script', () => {
      expect(detectTreatmentType({ treatmentType: 'better-sex' })).toBe('better_sex');
    });
  });

  describe('heuristic detection from Airtable field presence', () => {
    it('detects peptides from "Peptide choice" field', () => {
      expect(detectTreatmentType({ 'Peptide choice': 'BPC-157' })).toBe('peptides');
    });

    it('detects peptides from "What are you looking to Optimize?" field', () => {
      expect(detectTreatmentType({ 'What are you looking to Optimize?': 'Recovery' })).toBe('peptides');
    });

    it('detects peptides from "B12 Deficiency" field', () => {
      expect(detectTreatmentType({ 'B12 Deficiency': 'No' })).toBe('peptides');
    });

    it('detects testosterone from "Main Results to acchive" (typo in Airtable)', () => {
      expect(detectTreatmentType({ 'Main Results to acchive': 'Muscle gain' })).toBe('testosterone');
    });

    it('detects testosterone from "Main Results to achieve"', () => {
      expect(detectTreatmentType({ 'Main Results to achieve': 'Energy' })).toBe('testosterone');
    });

    it('detects testosterone from "Previous Therapies (Hormone, Pept, GLP1)"', () => {
      expect(detectTreatmentType({ 'Previous Therapies (Hormone, Pept, GLP1)': 'None' })).toBe('testosterone');
    });

    it('detects testosterone from "Self Administration" field', () => {
      expect(detectTreatmentType({ 'Self Administration': 'Yes' })).toBe('testosterone');
    });

    it('detects testosterone from "Lab Results" field', () => {
      expect(detectTreatmentType({ 'Lab Results': 'Attached' })).toBe('testosterone');
    });

    it('detects better_sex from "How often do these sexual issues occur?"', () => {
      expect(detectTreatmentType({ 'How often do these sexual issues occur?': 'Often' })).toBe('better_sex');
    });

    it('detects better_sex from "Smoke/Nicotine" field', () => {
      expect(detectTreatmentType({ 'Smoke/Nicotine': 'No' })).toBe('better_sex');
    });

    it('detects weight_loss from "GLP-1 History" field', () => {
      expect(detectTreatmentType({ 'GLP-1 History': 'Previously Used' })).toBe('weight_loss');
    });

    it('detects weight_loss from "Semaglutide Dose" field', () => {
      expect(detectTreatmentType({ 'Semaglutide Dose': '0.5mg' })).toBe('weight_loss');
    });

    it('defaults to weight_loss when no fields match', () => {
      expect(detectTreatmentType({ 'First name': 'John', email: 'j@e.com' })).toBe('weight_loss');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. END-TO-END: Realistic Airtable payloads for each treatment
// ═══════════════════════════════════════════════════════════════════

describe('End-to-end normalisation of realistic Airtable payloads', () => {
  it('Peptide Therapy payload normalises correctly', () => {
    const payload = {
      'First name': 'Carlos',
      'Last name': 'Mendez',
      email: 'carlos@example.com',
      'phone number': '+1 (305) 555-1234',
      DOB: '06/15/1990',
      Gender: 'Male',
      Address: '1208 E Kennedy Blvd',
      'apartment#': 'Apt 34',
      City: 'Tampa',
      State: 'Florida',
      ZIP: '33602',
      'Peptide choice': 'BPC-157',
      'What are you looking to Optimize?': 'Recovery',
      Symptoms: 'Fatigue, Joint Pain',
      'B12 Deficiency': 'No',
      Cancer: 'No',
      'Chronic Kidney Disease': 'No',
      Allergies: 'No',
      Drinking: 'Occasional',
      goals: 'Improve recovery time',
      'How did you hear about us?': 'Instagram',
      treatmentType: 'peptides',
      'submission-id': 'rec123peptide',
      submittedAt: '2026-03-25T10:00:00Z',
    };

    const result = normalizeOvertimePayload(payload);

    expect(result.treatmentType).toBe('peptides');
    expect(result.patient.firstName).toBe('Carlos');
    expect(result.patient.lastName).toBe('Mendez');
    expect(result.patient.email).toBe('carlos@example.com');
    expect(result.patient.address1).toBe('1208 E Kennedy Blvd');
    expect(result.patient.address2).toBe('Apt 34');
    expect(result.patient.city).toBe('Tampa');
    expect(result.patient.state).toBe('FL');
    expect(result.patient.zip).toBe('33602');
    expect(result.patient.dob).toBe('1990-06-15');
    expect(result.sections.length).toBeGreaterThan(0);
  });

  it('TRT payload normalises correctly', () => {
    const payload = {
      'First name': 'James',
      'Last name': 'Wilson',
      email: 'james@example.com',
      'phone number': '5551234567',
      DOB: '1988-03-22',
      Gender: 'Male',
      Address: '500 Elm St, Dallas, TX 75201',
      'Main Results to achieve': 'Increase energy and muscle',
      'Previous Therapies (Hormone, Pept, GLP1)': 'None',
      'Self Administration': 'Yes',
      'Blood Pressure': '120/80',
      Allergies: 'None',
      'List of medications, vitamins, supplements': 'Vitamin D',
      treatmentType: 'trt',
      'submission-id': 'rec456trt',
    };

    const result = normalizeOvertimePayload(payload);

    expect(result.treatmentType).toBe('testosterone');
    expect(result.patient.firstName).toBe('James');
    expect(result.patient.lastName).toBe('Wilson');
    expect(result.patient.address1).toBe('500 Elm St');
    expect(result.patient.city).toBe('Dallas');
    expect(result.patient.state).toBe('TX');
    expect(result.patient.zip).toBe('75201');
  });

  it('Weight Loss payload normalises correctly', () => {
    const payload = {
      'First name': 'Maria',
      'Last name': 'Garcia',
      email: 'maria@example.com',
      'phone number': '(786) 555-9876',
      DOB: '07/04/1992',
      Gender: 'Female',
      Address: '321 Sunset Dr, Miami, Florida, 33139',
      'starting weight': '210',
      'ideal weight': '150',
      'GLP-1 History': 'Previously Used',
      'Type of GLP-1': 'Semaglutide',
      'Semaglutide Dose': '0.5mg',
      'How would your life change by losing weight': 'More energy',
      treatmentType: 'weight-loss',
      'submission-id': 'rec789wl',
    };

    const result = normalizeOvertimePayload(payload);

    expect(result.treatmentType).toBe('weight_loss');
    expect(result.patient.firstName).toBe('Maria');
    expect(result.patient.city).toBe('Miami');
    expect(result.patient.state).toBe('FL');
    expect(result.patient.zip).toBe('33139');
  });

  it('Better Sex payload normalises correctly', () => {
    const payload = {
      'First name': 'Robert',
      'Last name': 'Taylor',
      email: 'robert@example.com',
      'phone number': '5559998888',
      DOB: '1985-11-30',
      Gender: 'Male',
      Address: '800 Park Ave',
      City: 'New York',
      State: 'New York',
      ZIP: '10021',
      'How often do these sexual issues occur?': 'Often',
      'How long have you notice': '6 months',
      'Heart condition': 'No',
      'Smoke/Nicotine': 'Never',
      treatmentType: 'better-sex',
      'submission-id': 'rec101sex',
    };

    const result = normalizeOvertimePayload(payload);

    expect(result.treatmentType).toBe('better_sex');
    expect(result.patient.firstName).toBe('Robert');
    expect(result.patient.address1).toBe('800 Park Ave');
    expect(result.patient.city).toBe('New York');
    expect(result.patient.state).toBe('NY');
    expect(result.patient.zip).toBe('10021');
  });

  it('Baseline/Bloodwork payload normalises correctly', () => {
    const payload = {
      'First name': 'Sarah',
      'Last name': 'Johnson',
      email: 'sarah@example.com',
      DOB: '1995-01-15',
      Gender: 'Female',
      Address: '222 Lab Ln, Phoenix, AZ 85001',
      treatmentType: 'baseline',
      'submission-id': 'rec202base',
    };

    const result = normalizeOvertimePayload(payload);

    expect(result.treatmentType).toBe('baseline_bloodwork');
    expect(result.patient.firstName).toBe('Sarah');
    expect(result.patient.city).toBe('Phoenix');
    expect(result.patient.state).toBe('AZ');
    expect(result.patient.zip).toBe('85001');
  });

  it('NAD+ payload normalises correctly', () => {
    const payload = {
      'First name': 'David',
      'Last name': 'Kim',
      email: 'david@example.com',
      DOB: '1980-08-20',
      Gender: 'Male',
      Address: '999 Wellness Blvd, Los Angeles, CA 90001',
      treatmentType: 'nad',
      'submission-id': 'rec303nad',
    };

    const result = normalizeOvertimePayload(payload);

    expect(result.treatmentType).toBe('nad_plus');
    expect(result.patient.firstName).toBe('David');
    expect(result.patient.city).toBe('Los Angeles');
    expect(result.patient.state).toBe('CA');
    expect(result.patient.zip).toBe('90001');
  });
});
