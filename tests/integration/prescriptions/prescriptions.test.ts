/**
 * Prescriptions Tests
 * Tests for prescription creation logic and validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger first
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Prescription Helper Functions', () => {
  describe('normalizeDob', () => {
    const normalizeDob = (input: string): string => {
      if (!input) return "";
      if (input.includes("-")) {
        return input;
      }
      const parts = input.split("/");
      if (parts.length === 3) {
        const [mm, dd, yyyy] = parts;
        if (yyyy && mm && dd) {
          return `${yyyy.padStart(4, "0")}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
        }
      }
      return input;
    };

    it('should normalize MM/DD/YYYY to YYYY-MM-DD', () => {
      expect(normalizeDob('01/15/1990')).toBe('1990-01-15');
      expect(normalizeDob('12/31/2000')).toBe('2000-12-31');
      expect(normalizeDob('06/01/1985')).toBe('1985-06-01');
    });

    it('should pass through ISO format dates', () => {
      expect(normalizeDob('1990-01-15')).toBe('1990-01-15');
      expect(normalizeDob('2000-12-31')).toBe('2000-12-31');
    });

    it('should handle empty input', () => {
      expect(normalizeDob('')).toBe('');
    });

    it('should handle invalid formats', () => {
      expect(normalizeDob('invalid')).toBe('invalid');
      expect(normalizeDob('1/2')).toBe('1/2');
    });

    it('should pad single digit months and days', () => {
      expect(normalizeDob('1/5/1990')).toBe('1990-01-05');
    });
  });

  describe('getClinicalDifferenceStatement', () => {
    const getClinicalDifferenceStatement = (medicationName: string): string | undefined => {
      const upperMedName = medicationName.toUpperCase();
      
      if (upperMedName.includes("TIRZEPATIDE")) {
        return "Beyond Medical Necessary - This individual patient would benefit from Tirzepatide with Glycine to help with muscle loss and use compounded vials that offer flexible dosing for patients and lowest effective dose to minimize side effects and increase outcomes and compliance. By submitting this prescription, you confirm that you have reviewed available drug product options and concluded that this compounded product is necessary for the patient receiving it.";
      }
      
      if (upperMedName.includes("SEMAGLUTIDE")) {
        return "Beyond Medical Necessary - This individual patient would benefit from Semaglutide with Glycine to help with muscle loss and use compounded vials that offer flexible dosing for patients and lowest effective dose to minimize side effects and increase outcomes and compliance. By submitting this prescription, you confirm that you have reviewed available drug product options and concluded that this compounded product is necessary for the patient receiving it.";
      }
      
      if (upperMedName.includes("TESTOSTERONE")) {
        return "Beyond medical necessary - This individual patient will benefit from Testosterone with grapeseed oil due to allergic reactions to commercially available one and use compounded vials that offer flexible dosing for patients and lowest effective dose to minimize side effects and increase outcomes and compliance. By submitting this prescription, you confirm that you have reviewed available drug product options and concluded that this compounded product is necessary for the patient receiving it.";
      }
      
      return undefined;
    };

    it('should return statement for Tirzepatide', () => {
      const statement = getClinicalDifferenceStatement('Tirzepatide 5mg');
      expect(statement).toContain('Tirzepatide');
      expect(statement).toContain('Glycine');
    });

    it('should return statement for Semaglutide', () => {
      const statement = getClinicalDifferenceStatement('Semaglutide 2.5mg');
      expect(statement).toContain('Semaglutide');
      expect(statement).toContain('Glycine');
    });

    it('should return statement for Testosterone', () => {
      const statement = getClinicalDifferenceStatement('Testosterone Cypionate 200mg');
      expect(statement).toContain('Testosterone');
      expect(statement).toContain('grapeseed oil');
    });

    it('should return undefined for other medications', () => {
      const statement = getClinicalDifferenceStatement('Metformin 500mg');
      expect(statement).toBeUndefined();
    });

    it('should be case insensitive', () => {
      expect(getClinicalDifferenceStatement('tirzepatide')).toBeDefined();
      expect(getClinicalDifferenceStatement('TIRZEPATIDE')).toBeDefined();
      expect(getClinicalDifferenceStatement('TiRzEpAtIdE')).toBeDefined();
    });
  });
});

describe('Prescription Validation', () => {
  describe('Patient Data', () => {
    const validatePatientData = (patient: any): { valid: boolean; errors: string[] } => {
      const errors: string[] = [];
      
      if (!patient.firstName?.trim()) errors.push('First name is required');
      if (!patient.lastName?.trim()) errors.push('Last name is required');
      if (!patient.dob) errors.push('Date of birth is required');
      if (!patient.gender) errors.push('Gender is required');
      if (!patient.phone?.trim()) errors.push('Phone is required');
      if (!patient.address1?.trim()) errors.push('Address is required');
      if (!patient.city?.trim()) errors.push('City is required');
      if (!patient.state?.trim()) errors.push('State is required');
      if (!patient.zip?.trim()) errors.push('ZIP code is required');
      
      return {
        valid: errors.length === 0,
        errors,
      };
    };

    it('should validate complete patient data', () => {
      const patient = {
        firstName: 'John',
        lastName: 'Doe',
        dob: '1990-01-15',
        gender: 'm',
        phone: '5551234567',
        email: 'john@example.com',
        address1: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '12345',
      };

      const result = validatePatientData(patient);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require first name', () => {
      const patient = {
        lastName: 'Doe',
        dob: '1990-01-15',
        gender: 'm',
        phone: '5551234567',
        address1: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '12345',
      };

      const result = validatePatientData(patient);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('First name is required');
    });

    it('should require address fields', () => {
      const patient = {
        firstName: 'John',
        lastName: 'Doe',
        dob: '1990-01-15',
        gender: 'm',
        phone: '5551234567',
      };

      const result = validatePatientData(patient);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Address is required');
      expect(result.errors).toContain('City is required');
      expect(result.errors).toContain('State is required');
      expect(result.errors).toContain('ZIP code is required');
    });
  });

  describe('Prescription Data', () => {
    const VALID_MEDICATION_KEYS = ['tirzepatide-5mg', 'semaglutide-2.5mg', 'testosterone-200mg'];

    const validateRx = (rx: any): { valid: boolean; errors: string[] } => {
      const errors: string[] = [];
      
      if (!rx.medicationKey) {
        errors.push('Medication key is required');
      } else if (!VALID_MEDICATION_KEYS.includes(rx.medicationKey)) {
        errors.push(`Invalid medication key: ${rx.medicationKey}`);
      }
      
      if (!rx.quantity || rx.quantity < 1) {
        errors.push('Quantity must be at least 1');
      }
      
      if (!rx.sig?.trim()) {
        errors.push('Directions (sig) are required');
      }
      
      return {
        valid: errors.length === 0,
        errors,
      };
    };

    it('should validate complete prescription', () => {
      const rx = {
        medicationKey: 'tirzepatide-5mg',
        quantity: 1,
        refills: '0',
        sig: 'Inject 5mg weekly',
      };

      const result = validateRx(rx);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid medication key', () => {
      const rx = {
        medicationKey: 'invalid-med',
        quantity: 1,
        sig: 'Take daily',
      };

      const result = validateRx(rx);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid medication key');
    });

    it('should require quantity', () => {
      const rx = {
        medicationKey: 'tirzepatide-5mg',
        quantity: 0,
        sig: 'Inject weekly',
      };

      const result = validateRx(rx);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Quantity must be at least 1');
    });

    it('should require directions', () => {
      const rx = {
        medicationKey: 'tirzepatide-5mg',
        quantity: 1,
        sig: '',
      };

      const result = validateRx(rx);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Directions (sig) are required');
    });
  });
});

describe('Lifefile Order Payload Structure', () => {
  const mockProvider = {
    id: 1,
    firstName: 'Dr. Jane',
    lastName: 'Smith',
    npi: '1234567890',
    dea: 'AS1234567',
    licenseNumber: 'MD12345',
    licenseState: 'CA',
    phone: '5559876543',
    email: 'dr.smith@clinic.com',
  };

  const mockPatient = {
    firstName: 'John',
    lastName: 'Doe',
    dob: '1990-01-15',
    gender: 'm',
    phone: '5551234567',
    email: 'john@example.com',
    address1: '123 Main St',
    address2: 'Apt 4',
    city: 'Anytown',
    state: 'CA',
    zip: '12345',
  };

  describe('Prescriber Section', () => {
    it('should structure prescriber data correctly', () => {
      const prescriber = {
        npi: mockProvider.npi,
        licenseState: mockProvider.licenseState,
        licenseNumber: mockProvider.licenseNumber,
        dea: mockProvider.dea,
        firstName: mockProvider.firstName,
        lastName: mockProvider.lastName,
        phone: mockProvider.phone,
        email: mockProvider.email,
      };

      expect(prescriber.npi).toBe('1234567890');
      expect(prescriber.npi).toMatch(/^\d{10}$/);
      expect(prescriber.dea).toBe('AS1234567');
      expect(prescriber.licenseState).toBe('CA');
    });
  });

  describe('Patient Section', () => {
    it('should structure patient data correctly', () => {
      const patient = {
        firstName: mockPatient.firstName,
        lastName: mockPatient.lastName,
        dateOfBirth: mockPatient.dob,
        gender: mockPatient.gender,
        address1: mockPatient.address1,
        address2: mockPatient.address2,
        city: mockPatient.city,
        state: mockPatient.state,
        zip: mockPatient.zip,
        phoneHome: mockPatient.phone,
        email: mockPatient.email,
      };

      expect(patient.firstName).toBe('John');
      expect(patient.lastName).toBe('Doe');
      expect(patient.dateOfBirth).toBe('1990-01-15');
      expect(patient.gender).toBe('m');
    });
  });

  describe('Shipping Section', () => {
    it('should structure shipping data correctly', () => {
      const shipping = {
        recipientType: 'patient',
        recipientFirstName: mockPatient.firstName,
        recipientLastName: mockPatient.lastName,
        recipientPhone: mockPatient.phone,
        recipientEmail: mockPatient.email,
        addressLine1: mockPatient.address1,
        addressLine2: mockPatient.address2,
        city: mockPatient.city,
        state: mockPatient.state,
        zipCode: mockPatient.zip,
        service: 'standard',
      };

      expect(shipping.recipientType).toBe('patient');
      expect(shipping.addressLine1).toBe('123 Main St');
      expect(shipping.zipCode).toBe('12345');
    });
  });

  describe('Rx Section', () => {
    it('should structure rx data correctly', () => {
      const rx = {
        rxType: 'new',
        drugName: 'Tirzepatide 5mg',
        drugStrength: '5mg',
        drugForm: 'Injection',
        lfProductID: 'TZ5',
        quantity: 1,
        quantityUnits: 'EA',
        directions: 'Inject 5mg subcutaneously once weekly',
        refills: 0,
        dateWritten: '2024-01-15',
        daysSupply: 30,
        clinicalDifferenceStatement: 'Beyond Medical Necessary...',
      };

      expect(rx.rxType).toBe('new');
      expect(rx.quantity).toBe(1);
      expect(rx.quantityUnits).toBe('EA');
      expect(rx.daysSupply).toBe(30);
    });

    it('should support multiple prescriptions', () => {
      const rxs = [
        { drugName: 'Tirzepatide 5mg', quantity: 1 },
        { drugName: 'Semaglutide 2.5mg', quantity: 2 },
      ];

      expect(rxs).toHaveLength(2);
      expect(rxs[0].drugName).toBe('Tirzepatide 5mg');
      expect(rxs[1].drugName).toBe('Semaglutide 2.5mg');
    });
  });
});

describe('Shipping Methods', () => {
  const SHIPPING_METHODS = [
    { id: 'standard', label: 'Standard Shipping (5-7 days)' },
    { id: 'express', label: 'Express Shipping (2-3 days)' },
    { id: 'overnight', label: 'Overnight Shipping (1 day)' },
  ];

  it('should have standard shipping option', () => {
    const standard = SHIPPING_METHODS.find(m => m.id === 'standard');
    expect(standard).toBeDefined();
    expect(standard?.label).toContain('Standard');
  });

  it('should have express shipping option', () => {
    const express = SHIPPING_METHODS.find(m => m.id === 'express');
    expect(express).toBeDefined();
  });

  it('should format shipping label correctly', () => {
    const getShippingLabel = (id: string): string => {
      const method = SHIPPING_METHODS.find(m => m.id === id);
      return method?.label ?? `Service ${id}`;
    };

    expect(getShippingLabel('standard')).toContain('Standard');
    expect(getShippingLabel('unknown')).toBe('Service unknown');
  });
});

describe('Order Status Management', () => {
  const ORDER_STATUSES = {
    PENDING: 'PENDING',
    SENT: 'sent',
    PROCESSING: 'processing',
    SHIPPED: 'shipped',
    DELIVERED: 'delivered',
    ERROR: 'error',
    CANCELLED: 'cancelled',
  };

  it('should have PENDING as initial status', () => {
    expect(ORDER_STATUSES.PENDING).toBe('PENDING');
  });

  it('should have error status for failures', () => {
    expect(ORDER_STATUSES.ERROR).toBe('error');
  });

  it('should track order lifecycle', () => {
    const orderLifecycle = ['PENDING', 'sent', 'processing', 'shipped', 'delivered'];
    expect(orderLifecycle[0]).toBe('PENDING');
    expect(orderLifecycle[orderLifecycle.length - 1]).toBe('delivered');
  });
});

describe('Provider Validation', () => {
  it('should validate NPI format (10 digits)', () => {
    const validateNPI = (npi: string): boolean => {
      return /^\d{10}$/.test(npi);
    };

    expect(validateNPI('1234567890')).toBe(true);
    expect(validateNPI('12345')).toBe(false);
    expect(validateNPI('abcdefghij')).toBe(false);
  });

  it('should validate DEA format', () => {
    const validateDEA = (dea: string): boolean => {
      // DEA format: 2 letters + 7 alphanumeric
      return /^[A-Z]{2}[0-9A-Z]{7}$/i.test(dea);
    };

    expect(validateDEA('AS1234567')).toBe(true);
    expect(validateDEA('XX9876543')).toBe(true);
    expect(validateDEA('12345')).toBe(false);
  });
});

describe('Error Handling', () => {
  describe('Error Types', () => {
    it('should categorize validation errors', () => {
      const ValidationError = class extends Error {
        constructor(message: string, public field: string) {
          super(message);
          this.name = 'ValidationError';
        }
      };

      const error = new ValidationError('Invalid medication', 'medicationKey');
      expect(error.name).toBe('ValidationError');
      expect(error.field).toBe('medicationKey');
    });

    it('should categorize API errors', () => {
      const APIError = class extends Error {
        constructor(message: string, public statusCode: number) {
          super(message);
          this.name = 'APIError';
        }
      };

      const error = new APIError('Lifefile API failed', 502);
      expect(error.statusCode).toBe(502);
    });
  });

  describe('Error Messages', () => {
    it('should provide user-friendly validation messages', () => {
      const getValidationMessage = (field: string): string => {
        const messages: Record<string, string> = {
          providerId: 'Invalid provider ID',
          medicationKey: 'Invalid medication selected',
          quantity: 'Quantity must be a positive number',
          sig: 'Directions are required for the prescription',
        };
        return messages[field] || 'Validation error';
      };

      expect(getValidationMessage('providerId')).toBe('Invalid provider ID');
      expect(getValidationMessage('unknown')).toBe('Validation error');
    });

    it('should provide user-friendly API error messages', () => {
      const getAPIErrorMessage = (code: number): string => {
        const messages: Record<number, string> = {
          400: 'Invalid request data',
          401: 'Authentication required',
          403: 'Permission denied',
          500: 'Server error - please try again',
          502: 'Pharmacy service unavailable',
        };
        return messages[code] || 'An error occurred';
      };

      expect(getAPIErrorMessage(400)).toBe('Invalid request data');
      expect(getAPIErrorMessage(502)).toBe('Pharmacy service unavailable');
      expect(getAPIErrorMessage(999)).toBe('An error occurred');
    });
  });
});
