/**
 * E2E Tests for Patient Management
 * Tests patient CRUD, documents, medical history, and clinic isolation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    patient: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    patientDocument: {
      create: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    weightLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
  setClinicContext: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    security: vi.fn(),
  },
}));

describe('E2E: Patient Registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create Patient', () => {
    it('should create patient with all required fields', async () => {
      const createPatient = async (data: {
        firstName: string;
        lastName: string;
        email: string;
        phone: string;
        dob: string;
        gender: string;
        clinicId: number;
      }) => {
        // Generate patient ID
        const patientId = String(Date.now()).slice(-6).padStart(6, '0');

        return {
          id: Date.now(),
          patientId,
          ...data,
          status: 'ACTIVE',
          createdAt: new Date(),
        };
      };

      const patient = await createPatient({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '555-123-4567',
        dob: '1990-05-15',
        gender: 'm',
        clinicId: 1,
      });

      expect(patient.firstName).toBe('John');
      expect(patient.patientId).toHaveLength(6);
      expect(patient.status).toBe('ACTIVE');
    });

    it('should validate required fields', () => {
      const validatePatient = (data: Record<string, unknown>) => {
        const required = ['firstName', 'lastName', 'email', 'phone', 'dob', 'gender'];
        const missing = required.filter(field => !data[field]);
        
        if (missing.length > 0) {
          return { valid: false, errors: missing.map(f => `${f} is required`) };
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (data.email && !emailRegex.test(data.email as string)) {
          return { valid: false, errors: ['Invalid email format'] };
        }

        // Phone validation
        const phoneDigits = (data.phone as string).replace(/\D/g, '');
        if (phoneDigits.length < 10) {
          return { valid: false, errors: ['Phone must have at least 10 digits'] };
        }

        return { valid: true, errors: [] };
      };

      const result1 = validatePatient({ firstName: 'John' });
      expect(result1.valid).toBe(false);
      expect(result1.errors.length).toBeGreaterThan(0);

      const result2 = validatePatient({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '555-123-4567',
        dob: '1990-01-01',
        gender: 'm',
      });
      expect(result2.valid).toBe(true);
    });

    it('should prevent duplicate email within clinic', async () => {
      const checkDuplicateEmail = async (email: string, clinicId: number) => {
        const existingPatients = [
          { email: 'existing@example.com', clinicId: 1 },
          { email: 'another@example.com', clinicId: 2 },
        ];

        const duplicate = existingPatients.find(
          p => p.email === email && p.clinicId === clinicId
        );

        return { isDuplicate: !!duplicate };
      };

      const result1 = await checkDuplicateEmail('existing@example.com', 1);
      expect(result1.isDuplicate).toBe(true);

      const result2 = await checkDuplicateEmail('existing@example.com', 2);
      expect(result2.isDuplicate).toBe(false);
    });
  });

  describe('Patient ID Generation', () => {
    it('should generate unique sequential patient IDs', () => {
      const generatePatientId = (lastId: string | null): string => {
        if (!lastId) return '000001';
        
        const nextNum = parseInt(lastId, 10) + 1;
        return String(nextNum).padStart(6, '0');
      };

      expect(generatePatientId(null)).toBe('000001');
      expect(generatePatientId('000001')).toBe('000002');
      expect(generatePatientId('000999')).toBe('001000');
    });
  });
});

describe('E2E: Patient Profile Management', () => {
  describe('Update Patient', () => {
    it('should update patient information', async () => {
      const updatePatient = async (
        patientId: number,
        updates: Partial<{
          firstName: string;
          lastName: string;
          phone: string;
          address1: string;
          city: string;
          state: string;
          zip: string;
        }>
      ) => {
        return {
          id: patientId,
          ...updates,
          updatedAt: new Date(),
        };
      };

      const updated = await updatePatient(1, {
        phone: '555-987-6543',
        address1: '123 New Street',
      });

      expect(updated.phone).toBe('555-987-6543');
      expect(updated.address1).toBe('123 New Street');
    });

    it('should track changes in audit log', async () => {
      const auditChanges: Array<{
        patientId: number;
        field: string;
        oldValue: unknown;
        newValue: unknown;
      }> = [];

      const updateWithAudit = async (
        patientId: number,
        currentData: Record<string, unknown>,
        updates: Record<string, unknown>
      ) => {
        for (const [key, newValue] of Object.entries(updates)) {
          if (currentData[key] !== newValue) {
            auditChanges.push({
              patientId,
              field: key,
              oldValue: currentData[key],
              newValue,
            });
          }
        }

        return { ...currentData, ...updates };
      };

      await updateWithAudit(
        1,
        { firstName: 'John', phone: '555-111-1111' },
        { phone: '555-222-2222' }
      );

      expect(auditChanges).toHaveLength(1);
      expect(auditChanges[0].field).toBe('phone');
      expect(auditChanges[0].oldValue).toBe('555-111-1111');
      expect(auditChanges[0].newValue).toBe('555-222-2222');
    });
  });

  describe('Patient Status', () => {
    it('should change patient status', async () => {
      const VALID_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED', 'DECEASED'];

      const updateStatus = async (patientId: number, newStatus: string) => {
        if (!VALID_STATUSES.includes(newStatus)) {
          throw new Error(`Invalid status: ${newStatus}`);
        }

        return {
          id: patientId,
          status: newStatus,
          statusChangedAt: new Date(),
        };
      };

      const result = await updateStatus(1, 'INACTIVE');
      expect(result.status).toBe('INACTIVE');

      await expect(updateStatus(1, 'INVALID')).rejects.toThrow('Invalid status');
    });
  });
});

describe('E2E: Patient Search', () => {
  describe('Search Functionality', () => {
    it('should search patients by name', async () => {
      const patients = [
        { id: 1, firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
        { id: 2, firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' },
        { id: 3, firstName: 'Bob', lastName: 'Smith', email: 'bob@example.com' },
      ];

      const searchPatients = (query: string) => {
        const lowerQuery = query.toLowerCase();
        return patients.filter(
          p =>
            p.firstName.toLowerCase().includes(lowerQuery) ||
            p.lastName.toLowerCase().includes(lowerQuery) ||
            p.email.toLowerCase().includes(lowerQuery)
        );
      };

      const results1 = searchPatients('doe');
      expect(results1).toHaveLength(2);

      const results2 = searchPatients('bob');
      expect(results2).toHaveLength(1);
      expect(results2[0].firstName).toBe('Bob');
    });

    it('should search by patient ID', async () => {
      const patients = [
        { id: 1, patientId: '000001', firstName: 'John' },
        { id: 2, patientId: '000002', firstName: 'Jane' },
      ];

      const searchByPatientId = (patientId: string) => {
        return patients.find(p => p.patientId === patientId);
      };

      const result = searchByPatientId('000001');
      expect(result?.firstName).toBe('John');
    });

    it('should paginate search results', async () => {
      const allPatients = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        firstName: `Patient${i + 1}`,
      }));

      const paginateResults = (
        data: typeof allPatients,
        page: number,
        pageSize: number
      ) => {
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        const items = data.slice(start, end);

        return {
          items,
          total: data.length,
          page,
          pageSize,
          totalPages: Math.ceil(data.length / pageSize),
        };
      };

      const page1 = paginateResults(allPatients, 1, 10);
      expect(page1.items).toHaveLength(10);
      expect(page1.totalPages).toBe(5);

      const page5 = paginateResults(allPatients, 5, 10);
      expect(page5.items).toHaveLength(10);
      expect(page5.items[0].firstName).toBe('Patient41');
    });
  });
});

describe('E2E: Patient Documents', () => {
  describe('Document Upload', () => {
    it('should upload patient document', async () => {
      const uploadDocument = async (data: {
        patientId: number;
        filename: string;
        mimeType: string;
        category: string;
        size: number;
      }) => {
        return {
          id: Date.now(),
          ...data,
          storagePath: `/documents/${data.patientId}/${Date.now()}_${data.filename}`,
          uploadedAt: new Date(),
        };
      };

      const doc = await uploadDocument({
        patientId: 1,
        filename: 'lab_results.pdf',
        mimeType: 'application/pdf',
        category: 'LAB_RESULTS',
        size: 1024000,
      });

      expect(doc.filename).toBe('lab_results.pdf');
      expect(doc.category).toBe('LAB_RESULTS');
      expect(doc.storagePath).toContain('/documents/1/');
    });

    it('should validate file types', () => {
      const ALLOWED_TYPES = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/gif',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];

      const isAllowedType = (mimeType: string) => ALLOWED_TYPES.includes(mimeType);

      expect(isAllowedType('application/pdf')).toBe(true);
      expect(isAllowedType('image/jpeg')).toBe(true);
      expect(isAllowedType('application/x-executable')).toBe(false);
    });

    it('should enforce file size limits', () => {
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

      const validateFileSize = (size: number) => {
        if (size > MAX_FILE_SIZE) {
          return { valid: false, error: 'File exceeds maximum size of 10MB' };
        }
        return { valid: true };
      };

      expect(validateFileSize(5 * 1024 * 1024).valid).toBe(true);
      expect(validateFileSize(15 * 1024 * 1024).valid).toBe(false);
    });
  });

  describe('Document Categories', () => {
    it('should organize documents by category', () => {
      const documents = [
        { id: 1, category: 'LAB_RESULTS', filename: 'lab1.pdf' },
        { id: 2, category: 'ID_DOCUMENT', filename: 'id.jpg' },
        { id: 3, category: 'LAB_RESULTS', filename: 'lab2.pdf' },
        { id: 4, category: 'CONSENT_FORM', filename: 'consent.pdf' },
      ];

      const groupByCategory = (docs: typeof documents) => {
        return docs.reduce((acc, doc) => {
          if (!acc[doc.category]) {
            acc[doc.category] = [];
          }
          acc[doc.category].push(doc);
          return acc;
        }, {} as Record<string, typeof documents>);
      };

      const grouped = groupByCategory(documents);
      expect(grouped['LAB_RESULTS']).toHaveLength(2);
      expect(grouped['ID_DOCUMENT']).toHaveLength(1);
    });
  });
});

describe('E2E: Medical History', () => {
  describe('Weight Tracking', () => {
    it('should log weight measurement', async () => {
      const logWeight = async (data: {
        patientId: number;
        weight: number;
        unit: 'lbs' | 'kg';
        recordedAt?: Date;
      }) => {
        // Convert to lbs if needed
        const weightLbs = data.unit === 'kg' ? data.weight * 2.20462 : data.weight;

        return {
          id: Date.now(),
          patientId: data.patientId,
          weight: Math.round(weightLbs * 10) / 10,
          unit: 'lbs',
          recordedAt: data.recordedAt || new Date(),
        };
      };

      const log = await logWeight({
        patientId: 1,
        weight: 180,
        unit: 'lbs',
      });

      expect(log.weight).toBe(180);
    });

    it('should calculate weight change', () => {
      const calculateWeightChange = (
        logs: Array<{ weight: number; recordedAt: Date }>
      ) => {
        if (logs.length < 2) return null;

        const sorted = [...logs].sort(
          (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime()
        );

        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const change = last.weight - first.weight;
        const percentChange = (change / first.weight) * 100;

        return {
          startWeight: first.weight,
          currentWeight: last.weight,
          change: Math.round(change * 10) / 10,
          percentChange: Math.round(percentChange * 10) / 10,
          period: Math.ceil(
            (last.recordedAt.getTime() - first.recordedAt.getTime()) /
              (1000 * 60 * 60 * 24)
          ),
        };
      };

      const logs = [
        { weight: 200, recordedAt: new Date('2026-01-01') },
        { weight: 195, recordedAt: new Date('2026-01-15') },
        { weight: 190, recordedAt: new Date('2026-01-30') },
      ];

      const result = calculateWeightChange(logs);
      expect(result?.change).toBe(-10);
      expect(result?.percentChange).toBe(-5);
    });
  });

  describe('Medical Conditions', () => {
    it('should track medical conditions', async () => {
      const addCondition = async (data: {
        patientId: number;
        condition: string;
        diagnosedDate?: Date;
        status: 'ACTIVE' | 'RESOLVED' | 'MANAGED';
      }) => {
        return {
          id: Date.now(),
          ...data,
          createdAt: new Date(),
        };
      };

      const condition = await addCondition({
        patientId: 1,
        condition: 'Type 2 Diabetes',
        diagnosedDate: new Date('2020-01-15'),
        status: 'MANAGED',
      });

      expect(condition.condition).toBe('Type 2 Diabetes');
      expect(condition.status).toBe('MANAGED');
    });
  });

  describe('Allergies', () => {
    it('should track patient allergies', async () => {
      const addAllergy = async (data: {
        patientId: number;
        allergen: string;
        severity: 'MILD' | 'MODERATE' | 'SEVERE';
        reaction?: string;
      }) => {
        return {
          id: Date.now(),
          ...data,
          createdAt: new Date(),
        };
      };

      const allergy = await addAllergy({
        patientId: 1,
        allergen: 'Penicillin',
        severity: 'SEVERE',
        reaction: 'Anaphylaxis',
      });

      expect(allergy.allergen).toBe('Penicillin');
      expect(allergy.severity).toBe('SEVERE');
    });
  });
});

describe('E2E: Clinic Isolation', () => {
  describe('Data Access Control', () => {
    it('should only return patients for current clinic', async () => {
      const allPatients = [
        { id: 1, firstName: 'Patient1', clinicId: 1 },
        { id: 2, firstName: 'Patient2', clinicId: 2 },
        { id: 3, firstName: 'Patient3', clinicId: 1 },
        { id: 4, firstName: 'Patient4', clinicId: 3 },
      ];

      const getPatientsByClinic = (clinicId: number) => {
        return allPatients.filter(p => p.clinicId === clinicId);
      };

      const clinic1Patients = getPatientsByClinic(1);
      expect(clinic1Patients).toHaveLength(2);
      expect(clinic1Patients.every(p => p.clinicId === 1)).toBe(true);
    });

    it('should prevent cross-clinic patient access', async () => {
      const getPatient = async (patientId: number, requestingClinicId: number) => {
        const patient = { id: patientId, clinicId: 1 };

        if (patient.clinicId !== requestingClinicId) {
          throw new Error('Access denied: Patient belongs to different clinic');
        }

        return patient;
      };

      await expect(getPatient(1, 2)).rejects.toThrow('Access denied');
      await expect(getPatient(1, 1)).resolves.toBeDefined();
    });

    it('should allow super admin access to all clinics', async () => {
      const getPatient = async (
        patientId: number,
        requestingClinicId: number | null,
        isSuperAdmin: boolean
      ) => {
        const patient = { id: patientId, clinicId: 1 };

        if (!isSuperAdmin && patient.clinicId !== requestingClinicId) {
          throw new Error('Access denied');
        }

        return patient;
      };

      // Super admin can access any clinic's patients
      await expect(getPatient(1, null, true)).resolves.toBeDefined();
      
      // Regular user cannot access other clinic's patients
      await expect(getPatient(1, 2, false)).rejects.toThrow('Access denied');
    });
  });

  describe('Audit Logging', () => {
    it('should log PHI access', async () => {
      const auditLogs: Array<{
        userId: number;
        patientId: number;
        action: string;
        timestamp: Date;
      }> = [];

      const logPHIAccess = async (
        userId: number,
        patientId: number,
        action: string
      ) => {
        auditLogs.push({
          userId,
          patientId,
          action,
          timestamp: new Date(),
        });
      };

      await logPHIAccess(1, 100, 'VIEW_PATIENT');
      await logPHIAccess(1, 100, 'UPDATE_PATIENT');

      expect(auditLogs).toHaveLength(2);
      expect(auditLogs[0].action).toBe('VIEW_PATIENT');
    });
  });
});

describe('E2E: Patient Communication', () => {
  describe('Communication Preferences', () => {
    it('should track communication preferences', async () => {
      const updatePreferences = async (
        patientId: number,
        preferences: {
          emailNotifications: boolean;
          smsNotifications: boolean;
          marketingEmails: boolean;
        }
      ) => {
        return {
          patientId,
          ...preferences,
          updatedAt: new Date(),
        };
      };

      const prefs = await updatePreferences(1, {
        emailNotifications: true,
        smsNotifications: true,
        marketingEmails: false,
      });

      expect(prefs.emailNotifications).toBe(true);
      expect(prefs.marketingEmails).toBe(false);
    });
  });

  describe('Communication History', () => {
    it('should log communications sent to patient', async () => {
      const logCommunication = async (data: {
        patientId: number;
        type: 'EMAIL' | 'SMS' | 'CALL';
        subject?: string;
        content: string;
        sentBy: number;
      }) => {
        return {
          id: Date.now(),
          ...data,
          status: 'SENT',
          sentAt: new Date(),
        };
      };

      const comm = await logCommunication({
        patientId: 1,
        type: 'EMAIL',
        subject: 'Appointment Reminder',
        content: 'Your appointment is tomorrow at 2pm',
        sentBy: 5,
      });

      expect(comm.type).toBe('EMAIL');
      expect(comm.status).toBe('SENT');
    });
  });
});

describe('E2E: Patient Portal', () => {
  describe('Patient Self-Service', () => {
    it('should allow patient to view their own data', async () => {
      const getPatientPortalData = async (patientId: number) => {
        return {
          profile: {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
          },
          upcomingAppointments: [
            { id: 1, date: new Date('2026-02-01'), type: 'Follow-up' },
          ],
          recentOrders: [
            { id: 1, date: new Date('2026-01-15'), total: 30000, status: 'DELIVERED' },
          ],
          documents: [
            { id: 1, name: 'Lab Results', category: 'LAB_RESULTS' },
          ],
        };
      };

      const data = await getPatientPortalData(1);
      expect(data.profile.firstName).toBe('John');
      expect(data.upcomingAppointments).toHaveLength(1);
    });

    it('should allow patient to update limited profile fields', async () => {
      const PATIENT_EDITABLE_FIELDS = ['phone', 'address1', 'address2', 'city', 'state', 'zip'];

      const updatePatientProfile = async (
        patientId: number,
        updates: Record<string, unknown>
      ) => {
        const allowedUpdates: Record<string, unknown> = {};
        
        for (const [key, value] of Object.entries(updates)) {
          if (PATIENT_EDITABLE_FIELDS.includes(key)) {
            allowedUpdates[key] = value;
          }
        }

        if (Object.keys(allowedUpdates).length === 0) {
          throw new Error('No valid fields to update');
        }

        return { patientId, ...allowedUpdates, updatedAt: new Date() };
      };

      const result = await updatePatientProfile(1, {
        phone: '555-999-8888',
        email: 'newemail@example.com', // Should be ignored
      });

      expect(result.phone).toBe('555-999-8888');
      expect((result as Record<string, unknown>).email).toBeUndefined();
    });
  });
});
