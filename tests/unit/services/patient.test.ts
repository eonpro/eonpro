import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    patient: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    subscription: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    appointment: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Patient Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Patient ID Generation', () => {
    const generatePatientId = (clinicId: number, sequence: number): string => {
      const paddedSequence = String(sequence).padStart(6, '0');
      return `PT-${clinicId}-${paddedSequence}`;
    };

    it('generates patient IDs with correct format', () => {
      expect(generatePatientId(1, 1)).toBe('PT-1-000001');
      expect(generatePatientId(1, 999)).toBe('PT-1-000999');
      expect(generatePatientId(5, 12345)).toBe('PT-5-012345');
    });

    it('pads sequence numbers correctly', () => {
      expect(generatePatientId(1, 1)).toContain('000001');
      expect(generatePatientId(1, 100)).toContain('000100');
    });
  });

  describe('Date of Birth Validation', () => {
    const validateDOB = (dob: string): { valid: boolean; error?: string } => {
      const date = new Date(dob);
      
      if (isNaN(date.getTime())) {
        return { valid: false, error: 'Invalid date format' };
      }
      
      const now = new Date();
      if (date > now) {
        return { valid: false, error: 'Date of birth cannot be in the future' };
      }
      
      const minDate = new Date(now.getFullYear() - 150, 0, 1);
      if (date < minDate) {
        return { valid: false, error: 'Invalid date of birth' };
      }
      
      return { valid: true };
    };

    const calculateAge = (dob: string): number => {
      const birthDate = new Date(dob);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      
      return age;
    };

    it('validates correct DOB formats', () => {
      expect(validateDOB('1990-01-15')).toEqual({ valid: true });
      expect(validateDOB('2000-12-31')).toEqual({ valid: true });
    });

    it('rejects future dates', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      expect(validateDOB(futureDate.toISOString())).toEqual({
        valid: false,
        error: 'Date of birth cannot be in the future',
      });
    });

    it('rejects invalid date formats', () => {
      expect(validateDOB('invalid')).toEqual({
        valid: false,
        error: 'Invalid date format',
      });
    });

    it('calculates age correctly', () => {
      const today = new Date();
      const thirtyYearsAgo = new Date(
        today.getFullYear() - 30,
        today.getMonth(),
        today.getDate()
      );
      
      expect(calculateAge(thirtyYearsAgo.toISOString().split('T')[0])).toBe(30);
    });

    it('handles birthday edge cases', () => {
      const today = new Date();
      // Birthday tomorrow = age should be 29
      const birthDate = new Date(
        today.getFullYear() - 30,
        today.getMonth(),
        today.getDate() + 1
      );
      
      expect(calculateAge(birthDate.toISOString().split('T')[0])).toBe(29);
    });
  });

  describe('Name Formatting', () => {
    const formatFullName = (firstName: string, lastName: string, middleName?: string): string => {
      const parts = [firstName, middleName, lastName].filter(Boolean);
      return parts.join(' ');
    };

    const formatDisplayName = (firstName: string, lastName: string): string => {
      return `${lastName}, ${firstName}`;
    };

    const capitalizeNames = (name: string): string => {
      return name
        .split(' ')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
    };

    it('formats full name correctly', () => {
      expect(formatFullName('John', 'Doe')).toBe('John Doe');
      expect(formatFullName('John', 'Doe', 'Michael')).toBe('John Michael Doe');
    });

    it('formats display name correctly', () => {
      expect(formatDisplayName('John', 'Doe')).toBe('Doe, John');
    });

    it('capitalizes names properly', () => {
      expect(capitalizeNames('john doe')).toBe('John Doe');
      expect(capitalizeNames('JOHN DOE')).toBe('John Doe');
      expect(capitalizeNames('john MICHAEL doe')).toBe('John Michael Doe');
    });
  });

  describe('Contact Information Validation', () => {
    const validateEmail = (email: string): boolean => {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    const validatePhone = (phone: string): boolean => {
      const cleaned = phone.replace(/\D/g, '');
      return cleaned.length === 10 || (cleaned.length === 11 && cleaned.startsWith('1'));
    };

    const sanitizePhone = (phone: string): string => {
      return phone.replace(/\D/g, '');
    };

    it('validates email addresses', () => {
      expect(validateEmail('patient@example.com')).toBe(true);
      expect(validateEmail('invalid-email')).toBe(false);
    });

    it('validates phone numbers', () => {
      expect(validatePhone('(555) 123-4567')).toBe(true);
      expect(validatePhone('5551234567')).toBe(true);
      expect(validatePhone('+1 555 123 4567')).toBe(true);
      expect(validatePhone('123')).toBe(false);
    });

    it('sanitizes phone numbers', () => {
      expect(sanitizePhone('(555) 123-4567')).toBe('5551234567');
      expect(sanitizePhone('+1-555-123-4567')).toBe('15551234567');
    });
  });

  describe('Patient Search', () => {
    interface Patient {
      id: number;
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      dob: string;
    }

    const searchPatients = (patients: Patient[], query: string): Patient[] => {
      const normalizedQuery = query.toLowerCase().trim();
      
      if (!normalizedQuery) return patients;
      
      return patients.filter(patient => {
        const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase();
        return (
          fullName.includes(normalizedQuery) ||
          patient.email.toLowerCase().includes(normalizedQuery) ||
          patient.phone.replace(/\D/g, '').includes(normalizedQuery.replace(/\D/g, ''))
        );
      });
    };

    const testPatients: Patient[] = [
      { id: 1, firstName: 'John', lastName: 'Doe', email: 'john@example.com', phone: '555-123-4567', dob: '1990-01-15' },
      { id: 2, firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com', phone: '555-987-6543', dob: '1985-06-20' },
      { id: 3, firstName: 'Bob', lastName: 'Johnson', email: 'bob@test.com', phone: '555-456-7890', dob: '1978-11-30' },
    ];

    it('searches by name', () => {
      expect(searchPatients(testPatients, 'John')).toHaveLength(2); // John Doe & Bob Johnson
      expect(searchPatients(testPatients, 'Doe')).toHaveLength(1);
    });

    it('searches by email', () => {
      const results = searchPatients(testPatients, 'test.com');
      expect(results).toHaveLength(1);
      expect(results[0].firstName).toBe('Bob');
    });

    it('searches by phone', () => {
      const results = searchPatients(testPatients, '555-123');
      expect(results).toHaveLength(1);
      expect(results[0].firstName).toBe('John');
    });

    it('returns all patients for empty query', () => {
      expect(searchPatients(testPatients, '')).toHaveLength(3);
    });

    it('is case insensitive', () => {
      expect(searchPatients(testPatients, 'JOHN')).toHaveLength(2);
      expect(searchPatients(testPatients, 'jane')).toHaveLength(1);
    });
  });

  describe('Medical Record Number (MRN)', () => {
    const generateMRN = (patientId: number, createdAt: Date): string => {
      const year = createdAt.getFullYear().toString().slice(-2);
      const month = String(createdAt.getMonth() + 1).padStart(2, '0');
      const paddedId = String(patientId).padStart(6, '0');
      return `MRN${year}${month}${paddedId}`;
    };

    const parseMRN = (mrn: string): { year: string; month: string; patientId: number } | null => {
      const match = mrn.match(/^MRN(\d{2})(\d{2})(\d{6})$/);
      if (!match) return null;
      
      return {
        year: match[1],
        month: match[2],
        patientId: parseInt(match[3], 10),
      };
    };

    it('generates MRN correctly', () => {
      const mrn = generateMRN(123, new Date('2024-03-15'));
      expect(mrn).toBe('MRN2403000123');
    });

    it('parses MRN correctly', () => {
      const parsed = parseMRN('MRN2403000123');
      expect(parsed).toEqual({
        year: '24',
        month: '03',
        patientId: 123,
      });
    });

    it('returns null for invalid MRN', () => {
      expect(parseMRN('invalid')).toBeNull();
      expect(parseMRN('MRN123')).toBeNull();
    });
  });

  describe('Patient Status', () => {
    type PatientStatus = 'active' | 'inactive' | 'deceased' | 'transferred';

    const getPatientStatus = (
      hasActiveSubscription: boolean,
      lastVisitDate: Date | null,
      isDeceased: boolean,
      transferDate: Date | null
    ): PatientStatus => {
      if (isDeceased) return 'deceased';
      if (transferDate) return 'transferred';
      if (hasActiveSubscription) return 'active';
      
      if (lastVisitDate) {
        const monthsAgo = (Date.now() - lastVisitDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
        if (monthsAgo < 12) return 'active';
      }
      
      return 'inactive';
    };

    it('returns active for patients with subscriptions', () => {
      expect(getPatientStatus(true, null, false, null)).toBe('active');
    });

    it('returns deceased for deceased patients', () => {
      expect(getPatientStatus(true, new Date(), true, null)).toBe('deceased');
    });

    it('returns transferred for transferred patients', () => {
      expect(getPatientStatus(true, new Date(), false, new Date())).toBe('transferred');
    });

    it('returns inactive for patients without recent visits', () => {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      expect(getPatientStatus(false, twoYearsAgo, false, null)).toBe('inactive');
    });

    it('returns active for recent visits without subscription', () => {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      expect(getPatientStatus(false, oneMonthAgo, false, null)).toBe('active');
    });
  });

  describe('Insurance Information', () => {
    interface Insurance {
      provider: string;
      memberId: string;
      groupNumber: string;
      isPrimary: boolean;
    }

    const validateInsurance = (insurance: Insurance): { valid: boolean; errors: string[] } => {
      const errors: string[] = [];
      
      if (!insurance.provider.trim()) {
        errors.push('Insurance provider is required');
      }
      if (!insurance.memberId.trim()) {
        errors.push('Member ID is required');
      }
      if (insurance.memberId && !/^[A-Za-z0-9-]+$/.test(insurance.memberId)) {
        errors.push('Member ID contains invalid characters');
      }
      
      return { valid: errors.length === 0, errors };
    };

    it('validates complete insurance info', () => {
      const insurance: Insurance = {
        provider: 'Blue Cross',
        memberId: 'ABC123456',
        groupNumber: 'GRP001',
        isPrimary: true,
      };
      
      expect(validateInsurance(insurance)).toEqual({ valid: true, errors: [] });
    });

    it('requires provider', () => {
      const insurance: Insurance = {
        provider: '',
        memberId: 'ABC123',
        groupNumber: 'GRP001',
        isPrimary: true,
      };
      
      const result = validateInsurance(insurance);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Insurance provider is required');
    });

    it('validates member ID format', () => {
      const insurance: Insurance = {
        provider: 'Blue Cross',
        memberId: 'ABC 123!@#',
        groupNumber: 'GRP001',
        isPrimary: true,
      };
      
      const result = validateInsurance(insurance);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Member ID contains invalid characters');
    });
  });

  describe('Allergy Management', () => {
    interface Allergy {
      allergen: string;
      severity: 'mild' | 'moderate' | 'severe';
      reaction: string;
    }

    const formatAllergyList = (allergies: Allergy[]): string => {
      if (allergies.length === 0) return 'No known allergies (NKA)';
      
      return allergies
        .sort((a, b) => {
          const severityOrder = { severe: 0, moderate: 1, mild: 2 };
          return severityOrder[a.severity] - severityOrder[b.severity];
        })
        .map(a => `${a.allergen} (${a.severity})`)
        .join(', ');
    };

    it('formats allergy list', () => {
      const allergies: Allergy[] = [
        { allergen: 'Penicillin', severity: 'severe', reaction: 'Anaphylaxis' },
        { allergen: 'Peanuts', severity: 'mild', reaction: 'Hives' },
      ];
      
      expect(formatAllergyList(allergies)).toBe('Penicillin (severe), Peanuts (mild)');
    });

    it('returns NKA for no allergies', () => {
      expect(formatAllergyList([])).toBe('No known allergies (NKA)');
    });

    it('sorts by severity (severe first)', () => {
      const allergies: Allergy[] = [
        { allergen: 'Mild', severity: 'mild', reaction: 'Test' },
        { allergen: 'Severe', severity: 'severe', reaction: 'Test' },
        { allergen: 'Moderate', severity: 'moderate', reaction: 'Test' },
      ];
      
      const result = formatAllergyList(allergies);
      expect(result.indexOf('Severe')).toBeLessThan(result.indexOf('Moderate'));
      expect(result.indexOf('Moderate')).toBeLessThan(result.indexOf('Mild'));
    });
  });
});

describe('PHI Protection', () => {
  describe('Data Masking', () => {
    const maskSSN = (ssn: string): string => {
      const cleaned = ssn.replace(/\D/g, '');
      if (cleaned.length !== 9) return '***-**-****';
      return `***-**-${cleaned.slice(-4)}`;
    };

    const maskEmail = (email: string): string => {
      const [local, domain] = email.split('@');
      if (!domain) return '***@***.***';
      const maskedLocal = local.charAt(0) + '***' + local.charAt(local.length - 1);
      return `${maskedLocal}@${domain}`;
    };

    const maskPhone = (phone: string): string => {
      const cleaned = phone.replace(/\D/g, '');
      if (cleaned.length < 4) return '***-***-****';
      return `***-***-${cleaned.slice(-4)}`;
    };

    it('masks SSN correctly', () => {
      expect(maskSSN('123-45-6789')).toBe('***-**-6789');
      expect(maskSSN('123456789')).toBe('***-**-6789');
    });

    it('masks email correctly', () => {
      expect(maskEmail('john.doe@example.com')).toBe('j***e@example.com');
    });

    it('masks phone correctly', () => {
      expect(maskPhone('555-123-4567')).toBe('***-***-4567');
      expect(maskPhone('(555) 123-4567')).toBe('***-***-4567');
    });
  });

  describe('Audit Logging', () => {
    interface AuditEntry {
      action: string;
      userId: number;
      patientId: number;
      timestamp: Date;
      ipAddress: string;
      details: Record<string, unknown>;
    }

    const createAuditEntry = (
      action: string,
      userId: number,
      patientId: number,
      ipAddress: string,
      details: Record<string, unknown> = {}
    ): AuditEntry => {
      return {
        action,
        userId,
        patientId,
        timestamp: new Date(),
        ipAddress,
        details,
      };
    };

    it('creates audit entries with required fields', () => {
      const entry = createAuditEntry('VIEW_RECORD', 1, 100, '127.0.0.1');
      
      expect(entry.action).toBe('VIEW_RECORD');
      expect(entry.userId).toBe(1);
      expect(entry.patientId).toBe(100);
      expect(entry.timestamp).toBeInstanceOf(Date);
    });

    it('includes optional details', () => {
      const entry = createAuditEntry('UPDATE_RECORD', 1, 100, '127.0.0.1', {
        fieldChanged: 'phone',
        oldValue: '555-123-4567',
        newValue: '555-987-6543',
      });
      
      expect(entry.details).toEqual({
        fieldChanged: 'phone',
        oldValue: '555-123-4567',
        newValue: '555-987-6543',
      });
    });
  });
});
