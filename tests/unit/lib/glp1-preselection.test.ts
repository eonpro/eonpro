import { describe, it, expect } from 'vitest';
import {
  getGlp1Preselection,
  findOrderSetByName,
} from '@/lib/prescriptions/glp1-preselection';

describe('getGlp1Preselection', () => {
  describe('Semaglutide dose escalation ladder', () => {
    const semaglutideInfo = (dose: string | null, used = true) => ({
      usedGlp1: used,
      glp1Type: 'Semaglutide' as string | null,
      lastDose: dose,
    });

    it('new patient (no history) → 0.25 mg starter', () => {
      const result = getGlp1Preselection('Semaglutide', semaglutideInfo(null, false));
      expect(result).not.toBeNull();
      expect(result!.oneMonth.sig).toContain('0.25 mg');
      expect(result!.multiMonth.orderSetName).toContain('Semaglutide A');
    });

    it('was on 0.25 mg → escalate to 0.5 mg', () => {
      const result = getGlp1Preselection('Semaglutide', semaglutideInfo('0.25'));
      expect(result!.oneMonth.sig).toContain('0.5 mg');
      expect(result!.multiMonth.orderSetName).toContain('Semaglutide B');
    });

    it('was on 0.5 mg → escalate to 1 mg', () => {
      const result = getGlp1Preselection('Semaglutide', semaglutideInfo('0.5'));
      expect(result!.oneMonth.sig).toContain('1 mg');
      expect(result!.multiMonth.orderSetName).toContain('Semaglutide C');
    });

    it('was on 1 mg → escalate to 1.7 mg (not stay at 1 mg)', () => {
      const result = getGlp1Preselection('Semaglutide', semaglutideInfo('1'));
      expect(result!.oneMonth.sig).toContain('1.7 mg');
      expect(result!.oneMonth.sig).not.toMatch(/\b1 mg\b/);
      expect(result!.multiMonth.orderSetName).toContain('Semaglutide C');
    });

    it('was on 1.7 mg → escalate to 2.4 mg (not stay at 1.7 mg)', () => {
      const result = getGlp1Preselection('Semaglutide', semaglutideInfo('1.7'));
      expect(result!.oneMonth.sig).toContain('2.4 mg');
      expect(result!.oneMonth.sig).not.toMatch(/\b1\.7 mg\b/);
      expect(result!.multiMonth.orderSetName).toContain('Semaglutide D');
    });

    it('was on 2.4 mg → maintain at 2.4 mg (max dose)', () => {
      const result = getGlp1Preselection('Semaglutide', semaglutideInfo('2.4'));
      expect(result!.oneMonth.sig).toContain('2.4 mg');
      expect(result!.multiMonth.orderSetName).toContain('Semaglutide D');
    });

    it('all tiers prescribe exactly 1 vial (quantity "1")', () => {
      for (const dose of [null, '0.25', '0.5', '1', '1.7', '2.4']) {
        const used = dose !== null;
        const result = getGlp1Preselection('Semaglutide', semaglutideInfo(dose, used));
        expect(result!.oneMonth.quantity).toBe('1');
        expect(result!.oneMonth.refills).toBe('0');
        expect(result!.oneMonth.daysSupply).toBe('28');
      }
    });
  });

  describe('Tirzepatide dose escalation ladder', () => {
    const tirzepatideInfo = (dose: string | null, used = true) => ({
      usedGlp1: used,
      glp1Type: 'Tirzepatide' as string | null,
      lastDose: dose,
    });

    it('new patient (no history) → 2.5 mg starter', () => {
      const result = getGlp1Preselection('Tirzepatide', tirzepatideInfo(null, false));
      expect(result!.oneMonth.sig).toContain('2.5 mg');
      expect(result!.multiMonth.orderSetName).toContain('Tirzepatide A');
    });

    it('was on 2.5 mg → escalate to 5 mg', () => {
      const result = getGlp1Preselection('Tirzepatide', tirzepatideInfo('2.5'));
      expect(result!.oneMonth.sig).toContain('5 mg');
      expect(result!.multiMonth.orderSetName).toContain('Tirzepatide B');
    });

    it('was on 5 mg → escalate to 7.5 mg', () => {
      const result = getGlp1Preselection('Tirzepatide', tirzepatideInfo('5'));
      expect(result!.oneMonth.sig).toContain('7.5 mg');
      expect(result!.multiMonth.orderSetName).toContain('Tirzepatide D');
    });

    it('was on 7.5 mg → escalate to 10 mg', () => {
      const result = getGlp1Preselection('Tirzepatide', tirzepatideInfo('7.5'));
      expect(result!.oneMonth.sig).toContain('10 mg');
      expect(result!.multiMonth.orderSetName).toContain('Tirzepatide D2');
    });

    it('was on 10 mg → escalate to 12.5 mg', () => {
      const result = getGlp1Preselection('Tirzepatide', tirzepatideInfo('10'));
      expect(result!.oneMonth.sig).toContain('12.5 mg');
      expect(result!.multiMonth.orderSetName).toContain('Tirzepatide E');
    });

    it('was on 12.5 mg → cap at 15 mg', () => {
      const result = getGlp1Preselection('Tirzepatide', tirzepatideInfo('12.5'));
      expect(result!.oneMonth.sig).toContain('15 mg');
      expect(result!.multiMonth.orderSetName).toContain('Tirzepatide E');
    });

    it('was on 15 mg → maintain at 15 mg (max dose)', () => {
      const result = getGlp1Preselection('Tirzepatide', tirzepatideInfo('15'));
      expect(result!.oneMonth.sig).toContain('15 mg');
      expect(result!.multiMonth.orderSetName).toContain('Tirzepatide E');
    });
  });

  describe('Medication identification', () => {
    const withHistory = (type: string | null) => ({
      usedGlp1: false,
      glp1Type: type,
      lastDose: null,
    });

    it('identifies semaglutide from treatment name', () => {
      expect(getGlp1Preselection('Semaglutide 1mo', withHistory(null))).not.toBeNull();
      expect(getGlp1Preselection('semaglutide - 3 month', withHistory(null))).not.toBeNull();
    });

    it('identifies semaglutide from brand names', () => {
      expect(getGlp1Preselection('Ozempic', withHistory(null))).not.toBeNull();
      expect(getGlp1Preselection('Wegovy', withHistory(null))).not.toBeNull();
    });

    it('identifies tirzepatide from treatment name', () => {
      expect(getGlp1Preselection('Tirzepatide 1mo', withHistory(null))).not.toBeNull();
    });

    it('identifies tirzepatide from brand names', () => {
      expect(getGlp1Preselection('Mounjaro', withHistory(null))).not.toBeNull();
      expect(getGlp1Preselection('Zepbound', withHistory(null))).not.toBeNull();
    });

    it('falls back to glp1Type when treatment is generic', () => {
      const result = getGlp1Preselection('Weight Loss 3mo', {
        usedGlp1: true,
        glp1Type: 'semaglutide',
        lastDose: '0.5',
      });
      expect(result).not.toBeNull();
      expect(result!.oneMonth.sig).toContain('1 mg');
    });

    it('returns null for non-GLP-1 treatments', () => {
      expect(getGlp1Preselection('Testosterone', withHistory(null))).toBeNull();
      expect(getGlp1Preselection('Sermorelin', withHistory(null))).toBeNull();
    });
  });

  describe('Dose fallback / nearest-lower-tier logic', () => {
    it('non-standard dose falls to nearest lower tier (conservative)', () => {
      const result = getGlp1Preselection('Semaglutide', {
        usedGlp1: true,
        glp1Type: 'Semaglutide',
        lastDose: '0.75',
      });
      // 0.75 is between 0.5 and 1 → matches previousDose 0.5 tier → prescribes 1 mg
      expect(result!.oneMonth.sig).toContain('1 mg');
    });

    it('dose higher than max tier stays at max', () => {
      const result = getGlp1Preselection('Semaglutide', {
        usedGlp1: true,
        glp1Type: 'Semaglutide',
        lastDose: '5',
      });
      expect(result!.oneMonth.sig).toContain('2.4 mg');
    });

    it('usedGlp1=true with null lastDose defaults to starter (dose 0)', () => {
      const result = getGlp1Preselection('Semaglutide', {
        usedGlp1: true,
        glp1Type: 'Semaglutide',
        lastDose: null,
      });
      expect(result!.oneMonth.sig).toContain('0.25 mg');
    });

    it('usedGlp1=false ignores lastDose and starts at tier 0', () => {
      const result = getGlp1Preselection('Semaglutide', {
        usedGlp1: false,
        glp1Type: 'Semaglutide',
        lastDose: '2.4',
      });
      expect(result!.oneMonth.sig).toContain('0.25 mg');
    });

    it('unparseable dose string defaults to starter', () => {
      const result = getGlp1Preselection('Semaglutide', {
        usedGlp1: true,
        glp1Type: 'Semaglutide',
        lastDose: 'unknown',
      });
      expect(result!.oneMonth.sig).toContain('0.25 mg');
    });
  });
});

describe('findOrderSetByName', () => {
  const orderSets = [
    { id: 1, name: 'Semaglutide A- 3 Month' },
    { id: 2, name: 'Semaglutide B - 3 Month' },
    { id: 3, name: 'Tirzepatide D- 3 Month' },
  ];

  it('exact match', () => {
    expect(findOrderSetByName(orderSets, 'Semaglutide A- 3 Month')?.id).toBe(1);
  });

  it('fuzzy match ignoring dash spacing', () => {
    expect(findOrderSetByName(orderSets, 'Semaglutide A - 3 Month')?.id).toBe(1);
    expect(findOrderSetByName(orderSets, 'Tirzepatide D - 3 Month')?.id).toBe(3);
  });

  it('case-insensitive match', () => {
    expect(findOrderSetByName(orderSets, 'semaglutide b - 3 month')?.id).toBe(2);
  });

  it('returns null for no match', () => {
    expect(findOrderSetByName(orderSets, 'Nonexistent Set')).toBeNull();
  });
});
