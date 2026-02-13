/**
 * Portal Settings API Integration Tests
 * Tests the actual API endpoints for clinic portal customization
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// MOCK SETUP
// ============================================================================

const mockPrisma = {
  clinic: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/security/rate-limiter-redis', () => ({
  relaxedRateLimiter: (handler: any) => handler,
}));

// Mock auth middleware
const mockUser = {
  id: 1,
  email: 'admin@test.com',
  role: 'admin',
  clinicId: 1,
};

vi.mock('@/lib/auth/middleware', () => ({
  verifyAuth: vi.fn().mockResolvedValue({ success: true, user: mockUser }),
  withAuth: (handler: any, options?: any) => {
    return async (request: NextRequest) => {
      // Check if user has required role
      const requiredRoles = options?.roles || [];
      if (requiredRoles.length > 0 && !requiredRoles.includes(mockUser.role)) {
        const { NextResponse } = await import('next/server');
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return handler(request, mockUser);
    };
  },
}));

// ============================================================================
// TEST DATA
// ============================================================================

const mockClinicData = {
  id: 1,
  name: 'Test Weight Loss Clinic',
  logoUrl: 'https://example.com/logo.png',
  iconUrl: null,
  faviconUrl: null,
  primaryColor: '#4fa77e',
  secondaryColor: '#3B82F6',
  accentColor: '#d3f931',
  customCss: null,
  settings: {
    patientPortal: {
      showBMICalculator: true,
      showWeightTracking: true,
      showDoseCalculator: true,
      welcomeMessage: 'Welcome to Test Clinic!',
      resourceVideos: [
        {
          id: 'video-1',
          title: 'Injection Guide',
          url: 'https://youtube.com/watch?v=abc',
          category: 'tutorials',
        },
      ],
    },
    treatment: {
      treatmentTypes: ['weight_loss'],
      primaryTreatment: 'weight_loss',
      protocols: [],
      medicationCategories: ['glp1'],
    },
  },
  features: {},
  adminEmail: 'admin@test.com',
  phone: '555-123-4567',
};

// ============================================================================
// BRANDING API TESTS
// ============================================================================

describe('Branding API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/patient-portal/branding', () => {
    it('should return complete branding for valid clinic', async () => {
      mockPrisma.clinic.findUnique.mockResolvedValue(mockClinicData);

      const { GET } = await import('@/app/api/patient-portal/branding/route');

      const request = new NextRequest('http://localhost/api/patient-portal/branding?clinicId=1');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.clinicId).toBe(1);
      expect(data.clinicName).toBe('Test Weight Loss Clinic');
      expect(data.primaryColor).toBe('#4fa77e');
      expect(data.treatmentTypes).toContain('weight_loss');
      expect(data.features.showWeightTracking).toBe(true);
      expect(data.welcomeMessage).toBe('Welcome to Test Clinic!');
    });

    it('should return default values for clinic without settings', async () => {
      const minimalClinic = {
        id: 2,
        name: 'Minimal Clinic',
        logoUrl: null,
        iconUrl: null,
        faviconUrl: null,
        primaryColor: null,
        secondaryColor: null,
        accentColor: null,
        customCss: null,
        settings: null,
        adminEmail: 'admin@minimal.com',
        phone: null,
      };

      mockPrisma.clinic.findUnique.mockResolvedValue(minimalClinic);

      const { GET } = await import('@/app/api/patient-portal/branding/route');

      const request = new NextRequest('http://localhost/api/patient-portal/branding?clinicId=2');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.primaryColor).toBe('#4fa77e'); // Default
      expect(data.treatmentTypes).toEqual(['weight_loss']); // Default
      expect(data.features.showBMICalculator).toBe(true); // Default
    });

    it('should return 404 for non-existent clinic', async () => {
      mockPrisma.clinic.findUnique.mockResolvedValue(null);

      const { GET } = await import('@/app/api/patient-portal/branding/route');

      const request = new NextRequest('http://localhost/api/patient-portal/branding?clinicId=999');
      const response = await GET(request);

      expect(response.status).toBe(404);
    });

    it('should return 400 for invalid clinicId', async () => {
      const { GET } = await import('@/app/api/patient-portal/branding/route');

      const request = new NextRequest(
        'http://localhost/api/patient-portal/branding?clinicId=invalid'
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
    });

    it('should return 400 for missing clinicId', async () => {
      const { GET } = await import('@/app/api/patient-portal/branding/route');

      const request = new NextRequest('http://localhost/api/patient-portal/branding');
      const response = await GET(request);

      expect(response.status).toBe(400);
    });

    it('should return all 23 feature flags', async () => {
      mockPrisma.clinic.findUnique.mockResolvedValue(mockClinicData);

      const { GET } = await import('@/app/api/patient-portal/branding/route');

      const request = new NextRequest('http://localhost/api/patient-portal/branding?clinicId=1');
      const response = await GET(request);
      const data = await response.json();

      const expectedFeatures = [
        'showBMICalculator',
        'showCalorieCalculator',
        'showDoseCalculator',
        'showShipmentTracking',
        'showMedicationReminders',
        'showWeightTracking',
        'showResources',
        'showBilling',
        'showProgressPhotos',
        'showLabResults',
        'showDietaryPlans',
        'showExerciseTracking',
        'showWaterTracking',
        'showSleepTracking',
        'showSymptomChecker',
        'showHealthScore',
        'showAchievements',
        'showCommunityChat',
        'showAppointments',
        'showTelehealth',
        'showChat',
        'showCarePlan',
        'showCareTeam',
      ];

      expectedFeatures.forEach((feature) => {
        expect(data.features).toHaveProperty(feature);
      });
    });

    it('should return treatment configuration', async () => {
      mockPrisma.clinic.findUnique.mockResolvedValue(mockClinicData);

      const { GET } = await import('@/app/api/patient-portal/branding/route');

      const request = new NextRequest('http://localhost/api/patient-portal/branding?clinicId=1');
      const response = await GET(request);
      const data = await response.json();

      expect(data.treatmentTypes).toBeInstanceOf(Array);
      expect(data.primaryTreatment).toBeDefined();
      expect(data.treatmentProtocols).toBeInstanceOf(Array);
      expect(data.medicationCategories).toBeInstanceOf(Array);
    });

    it('should return content customization', async () => {
      mockPrisma.clinic.findUnique.mockResolvedValue(mockClinicData);

      const { GET } = await import('@/app/api/patient-portal/branding/route');

      const request = new NextRequest('http://localhost/api/patient-portal/branding?clinicId=1');
      const response = await GET(request);
      const data = await response.json();

      expect(data).toHaveProperty('welcomeMessage');
      expect(data).toHaveProperty('dashboardMessage');
      expect(data).toHaveProperty('resourceVideos');
      expect(data).toHaveProperty('dietaryPlans');
    });

    it('should return support information', async () => {
      mockPrisma.clinic.findUnique.mockResolvedValue(mockClinicData);

      const { GET } = await import('@/app/api/patient-portal/branding/route');

      const request = new NextRequest('http://localhost/api/patient-portal/branding?clinicId=1');
      const response = await GET(request);
      const data = await response.json();

      expect(data).toHaveProperty('supportEmail');
      expect(data).toHaveProperty('supportPhone');
      expect(data).toHaveProperty('supportHours');
      expect(data).toHaveProperty('emergencyContact');
    });
  });
});

// ============================================================================
// PORTAL SETTINGS API TESTS
// ============================================================================

describe('Portal Settings API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/admin/clinic/portal-settings', () => {
    it('should return current portal settings for admin', async () => {
      mockPrisma.clinic.findUnique.mockResolvedValue(mockClinicData);

      const { GET } = await import('@/app/api/admin/clinic/portal-settings/route');

      const request = new NextRequest(
        'http://localhost/api/admin/clinic/portal-settings?clinicId=1'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.clinicId).toBe(1);
      expect(data.clinicName).toBe('Test Weight Loss Clinic');
      expect(data.treatmentTypes).toContain('weight_loss');
      expect(data.features).toBeDefined();
    });

    it('should return 404 for non-existent clinic', async () => {
      mockPrisma.clinic.findUnique.mockResolvedValue(null);

      const { GET } = await import('@/app/api/admin/clinic/portal-settings/route');

      const request = new NextRequest(
        'http://localhost/api/admin/clinic/portal-settings?clinicId=999'
      );
      const response = await GET(request);

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/admin/clinic/portal-settings', () => {
    it('should update portal features', async () => {
      mockPrisma.clinic.findUnique.mockResolvedValue(mockClinicData);
      mockPrisma.clinic.update.mockResolvedValue({ ...mockClinicData });

      const { PUT } = await import('@/app/api/admin/clinic/portal-settings/route');

      const updateData = {
        clinicId: 1,
        features: {
          showBMICalculator: false,
          showLabResults: true,
        },
      };

      const request = new NextRequest('http://localhost/api/admin/clinic/portal-settings', {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockPrisma.clinic.update).toHaveBeenCalled();
    });

    it('should update treatment types', async () => {
      mockPrisma.clinic.findUnique.mockResolvedValue(mockClinicData);
      mockPrisma.clinic.update.mockResolvedValue({ ...mockClinicData });

      const { PUT } = await import('@/app/api/admin/clinic/portal-settings/route');

      const updateData = {
        clinicId: 1,
        treatmentTypes: ['weight_loss', 'hormone_therapy'],
        primaryTreatment: 'weight_loss',
      };

      const request = new NextRequest('http://localhost/api/admin/clinic/portal-settings', {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      const response = await PUT(request);

      expect(response.status).toBe(200);
    });

    it('should update medication categories', async () => {
      mockPrisma.clinic.findUnique.mockResolvedValue(mockClinicData);
      mockPrisma.clinic.update.mockResolvedValue({ ...mockClinicData });

      const { PUT } = await import('@/app/api/admin/clinic/portal-settings/route');

      const updateData = {
        clinicId: 1,
        medicationCategories: ['glp1', 'testosterone'],
      };

      const request = new NextRequest('http://localhost/api/admin/clinic/portal-settings', {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      const response = await PUT(request);

      expect(response.status).toBe(200);
    });

    it('should update welcome message', async () => {
      mockPrisma.clinic.findUnique.mockResolvedValue(mockClinicData);
      mockPrisma.clinic.update.mockResolvedValue({ ...mockClinicData });

      const { PUT } = await import('@/app/api/admin/clinic/portal-settings/route');

      const updateData = {
        clinicId: 1,
        welcomeMessage: 'Welcome to our updated clinic!',
      };

      const request = new NextRequest('http://localhost/api/admin/clinic/portal-settings', {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      const response = await PUT(request);

      expect(response.status).toBe(200);
    });

    it('should update resource videos', async () => {
      mockPrisma.clinic.findUnique.mockResolvedValue(mockClinicData);
      mockPrisma.clinic.update.mockResolvedValue({ ...mockClinicData });

      const { PUT } = await import('@/app/api/admin/clinic/portal-settings/route');

      const updateData = {
        clinicId: 1,
        resourceVideos: [
          {
            id: 'new-video',
            title: 'New Guide',
            url: 'https://youtube.com/watch?v=new',
            category: 'tutorials',
          },
        ],
      };

      const request = new NextRequest('http://localhost/api/admin/clinic/portal-settings', {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      const response = await PUT(request);

      expect(response.status).toBe(200);
    });

    it('should update dietary plans', async () => {
      mockPrisma.clinic.findUnique.mockResolvedValue(mockClinicData);
      mockPrisma.clinic.update.mockResolvedValue({ ...mockClinicData });

      const { PUT } = await import('@/app/api/admin/clinic/portal-settings/route');

      const updateData = {
        clinicId: 1,
        dietaryPlans: [
          {
            id: 'low-carb',
            name: 'Low Carb Diet',
            calorieTarget: 1500,
            pdfUrl: null,
          },
        ],
      };

      const request = new NextRequest('http://localhost/api/admin/clinic/portal-settings', {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      const response = await PUT(request);

      expect(response.status).toBe(200);
    });

    it('should reject invalid treatment type', async () => {
      const { PUT } = await import('@/app/api/admin/clinic/portal-settings/route');

      const updateData = {
        clinicId: 1,
        treatmentTypes: ['invalid_type'],
      };

      const request = new NextRequest('http://localhost/api/admin/clinic/portal-settings', {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      const response = await PUT(request);

      expect(response.status).toBe(400);
    });

    it('should reject invalid medication category', async () => {
      const { PUT } = await import('@/app/api/admin/clinic/portal-settings/route');

      const updateData = {
        clinicId: 1,
        medicationCategories: ['invalid_category'],
      };

      const request = new NextRequest('http://localhost/api/admin/clinic/portal-settings', {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      const response = await PUT(request);

      expect(response.status).toBe(400);
    });

    it('should reject invalid check-in frequency', async () => {
      const { PUT } = await import('@/app/api/admin/clinic/portal-settings/route');

      const updateData = {
        clinicId: 1,
        treatmentProtocols: [
          {
            id: 'protocol-1',
            name: 'Test Protocol',
            medicationCategories: ['glp1'],
            durationWeeks: 12,
            checkInFrequency: 'yearly', // Invalid
            requiresWeightTracking: true,
            requiresPhotos: false,
            requiresLabWork: false,
          },
        ],
      };

      const request = new NextRequest('http://localhost/api/admin/clinic/portal-settings', {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      const response = await PUT(request);

      expect(response.status).toBe(400);
    });

    it('should reject protocol duration out of range', async () => {
      const { PUT } = await import('@/app/api/admin/clinic/portal-settings/route');

      const updateData = {
        clinicId: 1,
        treatmentProtocols: [
          {
            id: 'protocol-1',
            name: 'Test Protocol',
            medicationCategories: ['glp1'],
            durationWeeks: 200, // Out of range (max 104)
            checkInFrequency: 'weekly',
            requiresWeightTracking: true,
            requiresPhotos: false,
            requiresLabWork: false,
          },
        ],
      };

      const request = new NextRequest('http://localhost/api/admin/clinic/portal-settings', {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      const response = await PUT(request);

      expect(response.status).toBe(400);
    });

    it('should reject calorie target out of range', async () => {
      const { PUT } = await import('@/app/api/admin/clinic/portal-settings/route');

      const updateData = {
        clinicId: 1,
        dietaryPlans: [
          {
            id: 'diet-1',
            name: 'Invalid Diet',
            calorieTarget: 500, // Below minimum (800)
          },
        ],
      };

      const request = new NextRequest('http://localhost/api/admin/clinic/portal-settings', {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      const response = await PUT(request);

      expect(response.status).toBe(400);
    });

    it('should reject invalid video URL', async () => {
      const { PUT } = await import('@/app/api/admin/clinic/portal-settings/route');

      const updateData = {
        clinicId: 1,
        resourceVideos: [
          {
            id: 'video-1',
            title: 'Invalid Video',
            url: 'not-a-valid-url',
          },
        ],
      };

      const request = new NextRequest('http://localhost/api/admin/clinic/portal-settings', {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      const response = await PUT(request);

      expect(response.status).toBe(400);
    });

    it('should return 403 for clinic admin cannot access', async () => {
      // Admin with clinicId=1 tries to update clinicId=999
      // Authorization happens before database lookup, so 403 is expected
      const { PUT } = await import('@/app/api/admin/clinic/portal-settings/route');

      const updateData = {
        clinicId: 999, // Different from mockUser.clinicId (1)
        features: { showChat: false },
      };

      const request = new NextRequest('http://localhost/api/admin/clinic/portal-settings', {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      const response = await PUT(request);

      // Admin cannot update clinic they don't own - returns 403 before DB lookup
      expect(response.status).toBe(403);
    });

    it('should return 404 for own clinic that does not exist', async () => {
      // This tests the case where clinic ID matches user's clinic but doesn't exist
      mockPrisma.clinic.findUnique.mockResolvedValue(null);

      const { PUT } = await import('@/app/api/admin/clinic/portal-settings/route');

      const updateData = {
        clinicId: 1, // Same as mockUser.clinicId
        features: { showChat: false },
      };

      const request = new NextRequest('http://localhost/api/admin/clinic/portal-settings', {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      const response = await PUT(request);

      expect(response.status).toBe(404);
    });
  });
});

// ============================================================================
// SETTINGS MERGE TESTS
// ============================================================================

describe('Settings Merge Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should preserve existing settings when updating features only', async () => {
    const clinicWithExistingSettings = {
      ...mockClinicData,
      settings: {
        patientPortal: {
          welcomeMessage: 'Existing message',
          resourceVideos: [{ id: '1', title: 'Video', url: 'https://example.com' }],
          showBMICalculator: true,
        },
        treatment: {
          treatmentTypes: ['weight_loss'],
        },
      },
    };

    mockPrisma.clinic.findUnique.mockResolvedValue(clinicWithExistingSettings);
    mockPrisma.clinic.update.mockImplementation(({ data }: any) => {
      // Verify the merged settings
      expect(data.settings.patientPortal.welcomeMessage).toBe('Existing message');
      expect(data.settings.patientPortal.resourceVideos).toHaveLength(1);
      return Promise.resolve(clinicWithExistingSettings);
    });

    const { PUT } = await import('@/app/api/admin/clinic/portal-settings/route');

    const updateData = {
      clinicId: 1,
      features: { showChat: false },
    };

    const request = new NextRequest('http://localhost/api/admin/clinic/portal-settings', {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });

    await PUT(request);

    expect(mockPrisma.clinic.update).toHaveBeenCalled();
  });

  it('should update specific feature without affecting others', async () => {
    mockPrisma.clinic.findUnique.mockResolvedValue(mockClinicData);
    mockPrisma.clinic.update.mockImplementation(({ data }: any) => {
      // Verify only the specified feature was updated
      expect(data.settings.patientPortal.showBMICalculator).toBe(false);
      return Promise.resolve(mockClinicData);
    });

    const { PUT } = await import('@/app/api/admin/clinic/portal-settings/route');

    const updateData = {
      clinicId: 1,
      features: { showBMICalculator: false },
    };

    const request = new NextRequest('http://localhost/api/admin/clinic/portal-settings', {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });

    await PUT(request);

    expect(mockPrisma.clinic.update).toHaveBeenCalled();
  });
});

// ============================================================================
// CLINIC ISOLATION TESTS
// ============================================================================

describe('Clinic Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should only return data for requested clinic', async () => {
    mockPrisma.clinic.findUnique.mockResolvedValue(mockClinicData);

    const { GET } = await import('@/app/api/patient-portal/branding/route');

    const request = new NextRequest('http://localhost/api/patient-portal/branding?clinicId=1');
    const response = await GET(request);
    const data = await response.json();

    // Verify the correct clinic was queried
    expect(mockPrisma.clinic.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
      })
    );

    expect(data.clinicId).toBe(1);
  });

  it('should not expose data from other clinics', async () => {
    // First clinic's data
    const clinic1Data = { ...mockClinicData, id: 1, name: 'Clinic 1' };
    // Second clinic's data
    const clinic2Data = { ...mockClinicData, id: 2, name: 'Clinic 2', settings: null };

    mockPrisma.clinic.findUnique
      .mockResolvedValueOnce(clinic1Data)
      .mockResolvedValueOnce(clinic2Data);

    const { GET } = await import('@/app/api/patient-portal/branding/route');

    // Request clinic 1
    const request1 = new NextRequest('http://localhost/api/patient-portal/branding?clinicId=1');
    const response1 = await GET(request1);
    const data1 = await response1.json();

    // Request clinic 2
    const request2 = new NextRequest('http://localhost/api/patient-portal/branding?clinicId=2');
    const response2 = await GET(request2);
    const data2 = await response2.json();

    // Verify data isolation
    expect(data1.clinicId).toBe(1);
    expect(data1.clinicName).toBe('Clinic 1');
    expect(data1.welcomeMessage).toBe('Welcome to Test Clinic!');

    expect(data2.clinicId).toBe(2);
    expect(data2.clinicName).toBe('Clinic 2');
    expect(data2.welcomeMessage).toBeNull(); // Different settings
  });
});
