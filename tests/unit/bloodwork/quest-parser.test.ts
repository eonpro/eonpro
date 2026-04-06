import { describe, it, expect } from 'vitest';
import { parseQuestText } from '@/lib/bloodwork/quest-parser';

describe('quest-parser', () => {
  it('parses testosterone total/free rows when Quest appends lab codes', () => {
    const text = `
      TESTOSTERONE, FREE (DIALYSIS) AND TOTAL (MS)
      TESTOSTERONE, TOTAL, MS 468 250-1100 ng/dL EZ
      TESTOSTERONE, FREE (DIALYSIS)
      TESTOSTERONE, FREE 61.7 35.0-155.0 pg/mL EZ
      ESTRADIOL 39 < OR = 39 pg/mL QAW
    `;

    const parsed = parseQuestText(text);
    const total = parsed.results.find((r) => r.testName === 'TESTOSTERONE, TOTAL, MS');
    const free = parsed.results.find((r) => r.testName === 'TESTOSTERONE, FREE');

    expect(total).toBeDefined();
    expect(total?.value).toBe('468');
    expect(total?.referenceRange).toBe('250-1100 ng/dL');
    expect(total?.category).toBe('hormones');

    expect(free).toBeDefined();
    expect(free?.value).toBe('61.7');
    expect(free?.referenceRange).toBe('35.0-155.0 pg/mL');
    expect(free?.category).toBe('hormones');
  });

  it('recovers malformed one-line rows where value leaked into test name', () => {
    const text = `
      CHOLESTEROL, TOTAL 175   <200 mg/dL QAW
      HDL CHOLESTEROL 69 > OR =   40 mg/dL QAW
    `;

    const parsed = parseQuestText(text);
    const total = parsed.results.find((r) => r.testName === 'CHOLESTEROL, TOTAL');
    const hdl = parsed.results.find((r) => r.testName === 'HDL CHOLESTEROL');

    expect(total).toBeDefined();
    expect(total?.value).toBe('175');
    expect(total?.referenceRange).toBe('<200 mg/dL');

    expect(hdl).toBeDefined();
    expect(hdl?.value).toBe('69');
    expect(hdl?.referenceRange).toBe('> OR = 40 mg/dL');
  });
});
