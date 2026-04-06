import { describe, it, expect } from 'vitest';
import { parseRythmText } from '@/lib/bloodwork/rythm-parser';
import { parseBloodworkTextAuto } from '@/lib/bloodwork/auto-parser';

describe('rythm-parser', () => {
  const sample = `
rythm
NAME
Wessel Persijn
ORDER ID
793348
COLLECTED
3/28/2026 8:00 AM
REPORTED
4/2/2026
FASTING
Yes
Test  Value  Unit  Range  Performance Range
Thyroid Stimulating Hormone  1.70  uIU/mL  0.45 - 4.5  0.5 - 2.5
ApoB  97.0  mg/dL  0 - 90  50 - 80
Total Testosterone  332  ng/dL  250 - 900  700 - 1100
Free Testosterone  69.9  pg/mL  46 - 224  120 - 180
`;

  it('parses core metadata and result rows', () => {
    const parsed = parseRythmText(sample);
    expect(parsed.results.length).toBeGreaterThanOrEqual(4);
    expect(parsed.parsedPatientName?.firstName).toBe('WESSEL');
    expect(parsed.parsedPatientName?.lastName).toBe('PERSIJN');
    expect(parsed.specimenId).toBe('793348');
    expect(parsed.fasting).toBe(true);

    const apoB = parsed.results.find((r) => r.testName === 'ApoB');
    expect(apoB).toBeDefined();
    expect(apoB?.flag).toBe('H');
    expect(apoB?.category).toBe('heart');
  });

  it('auto-detects Rythm template', () => {
    const auto = parseBloodworkTextAuto(sample);
    expect(auto.vendor).toBe('rythm');
    expect(auto.labName).toBe('Rythm Health');
    expect(auto.parserVersion).toContain('rythm-');
  });

  it('parses rows when header extraction is missing/messy', () => {
    const noHeaderSample = `
rythm
NAME
Wessel Persijn
ORDER ID
793348
COLLECTED
3/28/2026 8:00 AM
REPORTED
4/2/2026
FASTING
Yes
Thyroid Stimulating Hormone 1.70 uIU/mL 0.45 - 4.5 0.5 - 2.5
ApoB 97.0 mg/dL 0 - 90 50 - 80
Total Testosterone 332 ng/dL 250 - 900 700 - 1100
Free Testosterone 69.9 pg/mL 46 - 224 120 - 180
`;
    const parsed = parseRythmText(noHeaderSample);
    expect(parsed.results.length).toBeGreaterThanOrEqual(4);
    expect(parsed.results.some((r) => r.testName === 'Total Testosterone')).toBe(true);
  });
});
