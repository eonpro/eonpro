import { describe, it, expect } from 'vitest';
import { parseAccessText } from '@/lib/bloodwork/access-parser';
import { parseBloodworkTextAuto } from '@/lib/bloodwork/auto-parser';

describe('access-parser', () => {
  const sample = `
ACCESS MEDICAL LABS
Patient: WILLIAMS, SHAUN
DOB 12/03/1977 Age:47 Sex:M Fasting: Y
Acct# 006245044
Coll. Date: 09/26/25 Coll. Time: 12:03
Print Date: 09/30/25 Print Time: 06:38
Report Status: FINAL
Test Name  Results  Reference Range  Units
Glucose  115 H  70 - 99  mg/dL
Triglycerides  194 H  0 - 149  mg/dL
HDL Cholesterol  32 L  >39  mg/dL
Prolactin  28.0 H  3.9 - 22.7  ng/mL
Testosterone  231 L  264 - 916  ng/dL
Free Testosterone(Direct)  2.7 L  6.8 - 21.5  pg/mL
`;

  it('parses access metadata and rows with flags', () => {
    const parsed = parseAccessText(sample);
    expect(parsed.parsedPatientName?.firstName).toBe('SHAUN');
    expect(parsed.parsedPatientName?.lastName).toBe('WILLIAMS');
    expect(parsed.specimenId).toBe('006245044');
    expect(parsed.fasting).toBe(true);
    expect(parsed.results.length).toBeGreaterThanOrEqual(6);

    const totalT = parsed.results.find((r) => r.testName === 'Testosterone');
    expect(totalT).toBeDefined();
    expect(totalT?.value).toBe('231');
    expect(totalT?.flag).toBe('L');
    expect(totalT?.category).toBe('hormones');
  });

  it('auto-detects access template', () => {
    const auto = parseBloodworkTextAuto(sample);
    expect(auto.vendor).toBe('access');
    expect(auto.labName).toBe('Access Medical Labs');
    expect(auto.parserVersion).toContain('access-');
  });
});
