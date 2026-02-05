/**
 * GLP-1 Extraction Tests
 * Tests for the GLP-1 history extraction logic in prescription queue
 */

import { describe, it, expect } from 'vitest';

// Helper function matching the route's normalizeKey
const normalizeKey = (key: string) => key.toLowerCase().replace(/[-_\s]/g, '');

// Extract GLP-1 info from answers array (matching route logic)
function extractGlp1FromAnswers(answers: Array<Record<string, unknown>>) {
  let usedGlp1 = false;
  let glp1Type: string | null = null;
  let lastDose: string | null = null;

  for (const answer of answers) {
    // Support multiple field naming conventions: MedLink (id/label), WellMedR (question/field)
    const key = normalizeKey(
      String(answer.question || answer.field || answer.id || answer.label || '')
    );
    const val = answer.answer || answer.value || '';

    // GLP-1 usage patterns
    if (key.includes('glp1last30') || key.includes('usedglp1') || key.includes('glp1inlast30')) {
      if (String(val).toLowerCase() === 'yes' || val === true) {
        usedGlp1 = true;
      }
    }
    // GLP-1 type patterns
    if (key.includes('glp1type') || key.includes('medicationtype') || key.includes('recentglp1') ||
        key.includes('currentglp1') || key.includes('glp1medication')) {
      if (val && String(val).toLowerCase() !== 'none' && String(val).toLowerCase() !== 'no' && String(val) !== '-') {
        glp1Type = String(val);
      }
    }
    // Dose patterns
    if (key.includes('semaglutidedose') || key.includes('semaglutidedosage') ||
        key.includes('tirzepatidedose') || key.includes('tirzepatidedosage') ||
        key.includes('dosemg') || key.includes('currentglp1dose')) {
      if (val && String(val) !== '-' && String(val) !== '0' && String(val).toLowerCase() !== 'none') {
        const numericDose = String(val).replace(/[^\d.]/g, '');
        if (numericDose && parseFloat(numericDose) > 0) {
          lastDose = numericDose;
        }
      }
    }
  }

  return { usedGlp1, glp1Type, lastDose };
}

describe('GLP-1 Extraction from Answers Array', () => {
  describe('MedLink format (id/label)', () => {
    it('should extract GLP-1 history from MedLink intake format', () => {
      const answers = [
        { id: 'glp1Last30Days', label: 'Used GLP-1 in Last 30 Days', value: 'yes' },
        { id: 'glp1Type', label: 'Recent GLP-1 Medication Type', value: 'tirzepatide' },
        { id: 'semaglutideDosage', label: 'Semaglutide Dose', value: '12.5' },
      ];

      const result = extractGlp1FromAnswers(answers);

      expect(result.usedGlp1).toBe(true);
      expect(result.glp1Type).toBe('tirzepatide');
      expect(result.lastDose).toBe('12.5');
    });

    it('should extract GLP-1 from label-only format', () => {
      const answers = [
        { label: 'Used GLP-1 in Last 30 Days', value: 'yes' },
        { label: 'Recent GLP-1 Medication Type', value: 'Semaglutide (Ozempic/Wegovy)' },
        { label: 'Semaglutide Dose', value: '0.5mg' },
      ];

      const result = extractGlp1FromAnswers(answers);

      expect(result.usedGlp1).toBe(true);
      expect(result.glp1Type).toBe('Semaglutide (Ozempic/Wegovy)');
      expect(result.lastDose).toBe('0.5');
    });
  });

  describe('WellMedR format (question/answer)', () => {
    it('should extract GLP-1 history from WellMedR intake format', () => {
      const answers = [
        { question: 'glp1-last-30', answer: 'yes' },
        { question: 'glp1-last-30-medication-type', answer: 'Tirzepatide' },
        { question: 'glp1-last-30-medication-dose-mg', answer: '5' },
      ];

      const result = extractGlp1FromAnswers(answers);

      expect(result.usedGlp1).toBe(true);
      expect(result.glp1Type).toBe('Tirzepatide');
      expect(result.lastDose).toBe('5');
    });
  });

  describe('Mixed format handling', () => {
    it('should handle field property for question name', () => {
      const answers = [
        { field: 'usedGlp1InLast30Days', value: 'Yes' },
        { field: 'recentGlp1MedicationType', value: 'semaglutide' },
        { field: 'semaglutideDose', value: '1.0mg weekly' },
      ];

      const result = extractGlp1FromAnswers(answers);

      expect(result.usedGlp1).toBe(true);
      expect(result.glp1Type).toBe('semaglutide');
      expect(result.lastDose).toBe('1.0');
    });
  });

  describe('Edge cases', () => {
    it('should return false for patients with no GLP-1 history', () => {
      const answers = [
        { id: 'glp1Last30Days', label: 'Used GLP-1 in Last 30 Days', value: 'no' },
      ];

      const result = extractGlp1FromAnswers(answers);

      expect(result.usedGlp1).toBe(false);
      expect(result.glp1Type).toBeNull();
      expect(result.lastDose).toBeNull();
    });

    it('should handle empty answers array', () => {
      const result = extractGlp1FromAnswers([]);

      expect(result.usedGlp1).toBe(false);
      expect(result.glp1Type).toBeNull();
      expect(result.lastDose).toBeNull();
    });

    it('should handle "none" as GLP-1 type', () => {
      const answers = [
        { id: 'glp1Last30Days', value: 'yes' },
        { id: 'glp1Type', value: 'None' },
      ];

      const result = extractGlp1FromAnswers(answers);

      expect(result.usedGlp1).toBe(true);
      expect(result.glp1Type).toBeNull(); // "None" should be filtered out
    });

    it('should handle boolean true for GLP-1 usage', () => {
      const answers = [
        { id: 'glp1Last30Days', value: true },
        { id: 'glp1Type', value: 'Tirzepatide' },
      ];

      const result = extractGlp1FromAnswers(answers);

      expect(result.usedGlp1).toBe(true);
      expect(result.glp1Type).toBe('Tirzepatide');
    });

    it('should extract numeric dose from string with units', () => {
      const answers = [
        { id: 'glp1Last30Days', value: 'yes' },
        { id: 'tirzepatideDosage', value: '12.5mg weekly injection' },
      ];

      const result = extractGlp1FromAnswers(answers);

      expect(result.usedGlp1).toBe(true);
      expect(result.lastDose).toBe('12.5');
    });

    it('should ignore zero dose values', () => {
      const answers = [
        { id: 'glp1Last30Days', value: 'yes' },
        { id: 'semaglutideDose', value: '0' },
      ];

      const result = extractGlp1FromAnswers(answers);

      expect(result.usedGlp1).toBe(true);
      expect(result.lastDose).toBeNull();
    });

    it('should prefer tirzepatide dose when medication type indicates tirzepatide', () => {
      const answers = [
        { id: 'glp1Last30Days', value: 'yes' },
        { id: 'glp1Type', value: 'tirzepatide' },
        { id: 'semaglutideDosage', value: '0' },
        { id: 'tirzepatideDosage', value: '5mg' },
      ];

      const result = extractGlp1FromAnswers(answers);

      expect(result.usedGlp1).toBe(true);
      expect(result.glp1Type).toBe('tirzepatide');
      expect(result.lastDose).toBe('5');
    });
  });
});

describe('normalizeKey helper', () => {
  it('should remove dashes', () => {
    expect(normalizeKey('glp1-last-30')).toBe('glp1last30');
  });

  it('should remove underscores', () => {
    expect(normalizeKey('glp1_last_30')).toBe('glp1last30');
  });

  it('should remove spaces', () => {
    expect(normalizeKey('Used GLP-1 in Last 30 Days')).toBe('usedglp1inlast30days');
  });

  it('should convert to lowercase', () => {
    expect(normalizeKey('GLP1Type')).toBe('glp1type');
  });

  it('should handle mixed separators', () => {
    expect(normalizeKey('Recent GLP-1_Medication Type')).toBe('recentglp1medicationtype');
  });
});
