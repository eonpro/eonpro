/**
 * Patient Profile Section Consistency
 * ====================================
 *
 * Guardrail: All clinic intake section configs must include a "Patient Profile" section.
 * Prevents tenant drift where one clinic misses the section due to config error.
 *
 * @see docs/ENTERPRISE_TENANT_DRIFT_DIAGNOSIS.md
 */

import { describe, it, expect } from 'vitest';
import {
  WELLMEDR_INTAKE_SECTIONS,
  hasCustomIntakeSections,
  getIntakeSectionsForClinic,
} from '@/lib/wellmedr/intakeSections';
import {
  getOvertimeIntakeSections,
  hasOvertimeIntakeSections,
  OVERTIME_INTAKE_SECTIONS,
} from '@/lib/overtime/intakeSections';

const PATIENT_PROFILE_TITLE = 'Patient Profile';

describe('Patient Profile section consistency across clinics', () => {
  it('Wellmedr intake sections include Patient Profile', () => {
    const hasProfile = WELLMEDR_INTAKE_SECTIONS.some(
      (s) => s.title?.toLowerCase() === PATIENT_PROFILE_TITLE.toLowerCase()
    );
    expect(hasProfile).toBe(true);
  });

  it('Overtime intake sections include Patient Profile', () => {
    const sections = getOvertimeIntakeSections(null);
    const hasProfile = sections.some(
      (s) => s.title?.toLowerCase() === PATIENT_PROFILE_TITLE.toLowerCase()
    );
    expect(hasProfile).toBe(true);
  });

  it('Overtime OVERTIME_INTAKE_SECTIONS (all treatment types) include Patient Profile', () => {
    const hasProfile = OVERTIME_INTAKE_SECTIONS.some(
      (s) => s.title?.toLowerCase() === PATIENT_PROFILE_TITLE.toLowerCase()
    );
    expect(hasProfile).toBe(true);
  });

  it('getIntakeSectionsForClinic(wellmedr) returns sections with Patient Profile', () => {
    const sections = getIntakeSectionsForClinic('wellmedr');
    expect(sections).not.toBeNull();
    const hasProfile = sections!.some(
      (s) => s.title?.toLowerCase() === PATIENT_PROFILE_TITLE.toLowerCase()
    );
    expect(hasProfile).toBe(true);
  });

  it('hasOvertimeIntakeSections(ot) is true', () => {
    expect(hasOvertimeIntakeSections('ot')).toBe(true);
    expect(hasOvertimeIntakeSections('OT')).toBe(true);
  });

  it('hasCustomIntakeSections(wellmedr) is true', () => {
    expect(hasCustomIntakeSections('wellmedr')).toBe(true);
  });
});
