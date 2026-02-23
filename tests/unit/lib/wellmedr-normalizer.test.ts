/**
 * Wellmedr Intake Normalizer Tests
 * Verifies all webhook payload fields are captured for Intake tab display
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeWellmedrPayload,
  isCheckoutComplete,
} from '@/lib/wellmedr/intakeNormalizer';

describe('Wellmedr Intake Normalizer', () => {
  it('combines feet and inches into height for Intake tab display', () => {
    const payload = {
      'first-name': 'Jane',
      'last-name': 'Doe',
      email: 'jane@example.com',
      phone: '5551234567',
      feet: '5',
      inches: '8',
      weight: '180',
      'goal-weight': '150',
    };
    const normalized = normalizeWellmedrPayload(payload);
    const bodySection = normalized.sections.find((s) => s.title === 'Body Metrics');
    expect(bodySection).toBeDefined();
    const heightEntry = bodySection?.entries.find((e) => e.id === 'height');
    expect(heightEntry).toBeDefined();
    expect(heightEntry?.value).toBe("5'8\"");
  });

  it('includes height only when both feet and inches present', () => {
    const payload = {
      email: 'test@example.com',
      feet: '5',
      // inches missing
    };
    const normalized = normalizeWellmedrPayload(payload);
    const bodySection = normalized.sections.find((s) => s.title === 'Body Metrics');
    const heightEntry = bodySection?.entries.find((e) => e.id === 'height');
    expect(heightEntry).toBeUndefined();
  });

  it('isCheckoutComplete returns true for various truthy values', () => {
    expect(isCheckoutComplete({ 'Checkout Completed': true })).toBe(true);
    expect(isCheckoutComplete({ 'Checkout Completed': 'Yes' })).toBe(true);
    expect(isCheckoutComplete({ 'Checkout Completed 2': true })).toBe(true);
  });

  it('isCheckoutComplete returns false when not complete', () => {
    expect(isCheckoutComplete({})).toBe(false);
    expect(isCheckoutComplete({ 'Checkout Completed': false })).toBe(false);
  });

  it('captures all Wellmedr form fields in sections', () => {
    const payload = {
      'first-name': 'John',
      'last-name': 'Doe',
      email: 'john@example.com',
      phone: '5551234567',
      state: 'FL',
      dob: '1990-01-15',
      sex: 'Male',
      feet: '6',
      inches: '0',
      weight: '220',
      'goal-weight': '180',
      bmi: '30',
      'health-conditions': 'None',
      'glp1-last-30': 'No',
      'preferred-meds': 'Tirzepatide',
      'Checkout Completed': true,
    };
    const normalized = normalizeWellmedrPayload(payload);
    expect(normalized.sections.length).toBeGreaterThan(0);
    const allEntries = normalized.sections.flatMap((s) => s.entries);
    const ids = new Set(allEntries.map((e) => e.id));
    expect(ids.has('first-name')).toBe(true);
    expect(ids.has('height')).toBe(true);
    expect(ids.has('Checkout Completed')).toBe(true);
  });

  describe('phone extraction (recorded on patient profile)', () => {
    it('extracts phone from standard keys', () => {
      const payload = {
        'first-name': 'Test',
        'last-name': 'User',
        email: 'test@example.com',
        phone: '5551234567',
      };
      const normalized = normalizeWellmedrPayload(payload);
      expect(normalized.patient.phone).toBe('5551234567');
    });

    it('extracts phone from "Phone Number" (Fillout/Airtable)', () => {
      const payload = {
        'first-name': 'Test',
        'last-name': 'User',
        email: 'test@example.com',
        'Phone Number': ' (555) 987-6543 ',
      };
      const normalized = normalizeWellmedrPayload(payload);
      expect(normalized.patient.phone).toBe('5559876543');
    });

    it('extracts phone from "Phone (from Contacts)" (Airtable linked field)', () => {
      const payload = {
        'first-name': 'Test',
        'last-name': 'User',
        email: 'test@example.com',
        'Phone (from Contacts)': '+1 555-111-2222',
      };
      const normalized = normalizeWellmedrPayload(payload);
      expect(normalized.patient.phone).toBe('5551112222');
    });

    it('extracts phone from any key containing "phone" (fallback)', () => {
      const payload = {
        'first-name': 'Test',
        'last-name': 'User',
        email: 'test@example.com',
        'Primary Phone': '5554443333',
      };
      const normalized = normalizeWellmedrPayload(payload);
      expect(normalized.patient.phone).toBe('5554443333');
    });

    it('extracts phone from key containing "mobile"', () => {
      const payload = {
        'first-name': 'Test',
        'last-name': 'User',
        email: 'test@example.com',
        'Mobile Number': '5557778888',
      };
      const normalized = normalizeWellmedrPayload(payload);
      expect(normalized.patient.phone).toBe('5557778888');
    });

    it('strips leading 1 and non-digits', () => {
      const payload = {
        'first-name': 'Test',
        'last-name': 'User',
        email: 'test@example.com',
        phone: '1-555-123-4567',
      };
      const normalized = normalizeWellmedrPayload(payload);
      expect(normalized.patient.phone).toBe('5551234567');
    });

    it('leaves phone empty when no phone field in payload', () => {
      const payload = {
        'first-name': 'Test',
        'last-name': 'User',
        email: 'test@example.com',
      };
      const normalized = normalizeWellmedrPayload(payload);
      expect(normalized.patient.phone).toBe('');
    });

    it('extracts phone from object (Airtable linked record shape)', () => {
      const payload = {
        'first-name': 'Test',
        'last-name': 'User',
        email: 'test@example.com',
        phone: { phoneNumber: '+1 555-123-4567', name: 'Primary' },
      };
      const normalized = normalizeWellmedrPayload(payload);
      expect(normalized.patient.phone).toBe('5551234567');
    });

    it('extracts phone when payload is wrapped in data', () => {
      const payload = {
        data: {
          'first-name': 'Test',
          'last-name': 'User',
          email: 'test@example.com',
          phone: '5558889999',
        },
      };
      const normalized = normalizeWellmedrPayload(payload);
      expect(normalized.patient.phone).toBe('5558889999');
    });

    it('last-resort: extracts phone from key containing "contact" with 10+ digits', () => {
      const payload = {
        'first-name': 'Test',
        'last-name': 'User',
        email: 'test@example.com',
        'Contact Number': '(555) 111-2233',
      };
      const normalized = normalizeWellmedrPayload(payload);
      expect(normalized.patient.phone).toBe('5551112233');
    });
  });
});
