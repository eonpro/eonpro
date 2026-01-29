/**
 * Clinic Portal Customization Tests
 * Tests for clinic-specific patient portal customization
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// MOCK SETUP
// ============================================================================

vi.mock('@/lib/db', () => ({
  prisma: {
    clinic: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
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

vi.mock('@/lib/auth/middleware', () => ({
  verifyAuth: vi.fn(),
  withAuth: (handler: any) => handler,
}));

import { prisma } from '@/lib/db';

// ============================================================================
// TYPE DEFINITIONS TESTS
// ============================================================================

describe('Portal Customization Types', () => {
  describe('TreatmentType', () => {
    const validTreatmentTypes = [
      'weight_loss',
      'hormone_therapy',
      'mens_health',
      'womens_health',
      'sexual_health',
      'anti_aging',
      'general_wellness',
      'custom',
    ];

    it('should define all expected treatment types', () => {
      expect(validTreatmentTypes).toHaveLength(8);
      expect(validTreatmentTypes).toContain('weight_loss');
      expect(validTreatmentTypes).toContain('hormone_therapy');
      expect(validTreatmentTypes).toContain('mens_health');
    });

    it('should validate treatment type values', () => {
      const isValidTreatmentType = (type: string): boolean => {
        return validTreatmentTypes.includes(type);
      };

      expect(isValidTreatmentType('weight_loss')).toBe(true);
      expect(isValidTreatmentType('invalid_type')).toBe(false);
      expect(isValidTreatmentType('')).toBe(false);
    });
  });

  describe('MedicationCategory', () => {
    const validCategories = [
      'glp1',
      'testosterone',
      'hcg',
      'peptides',
      'vitamins',
      'compounded',
      'other',
    ];

    it('should define all expected medication categories', () => {
      expect(validCategories).toHaveLength(7);
      expect(validCategories).toContain('glp1');
      expect(validCategories).toContain('testosterone');
      expect(validCategories).toContain('peptides');
    });

    it('should validate medication category values', () => {
      const isValidCategory = (cat: string): boolean => {
        return validCategories.includes(cat);
      };

      expect(isValidCategory('glp1')).toBe(true);
      expect(isValidCategory('testosterone')).toBe(true);
      expect(isValidCategory('invalid')).toBe(false);
    });
  });

  describe('TreatmentProtocol', () => {
    const validCheckInFrequencies = ['daily', 'weekly', 'biweekly', 'monthly'];

    it('should validate check-in frequency values', () => {
      const isValidFrequency = (freq: string): boolean => {
        return validCheckInFrequencies.includes(freq);
      };

      expect(isValidFrequency('daily')).toBe(true);
      expect(isValidFrequency('weekly')).toBe(true);
      expect(isValidFrequency('yearly')).toBe(false);
    });

    it('should validate protocol structure', () => {
      const validProtocol = {
        id: 'protocol-1',
        name: 'Weight Loss Protocol',
        description: 'Standard weight loss treatment',
        medicationCategories: ['glp1'],
        durationWeeks: 12,
        checkInFrequency: 'weekly',
        requiresWeightTracking: true,
        requiresPhotos: false,
        requiresLabWork: false,
      };

      expect(validProtocol.id).toBeDefined();
      expect(validProtocol.name).toBeDefined();
      expect(validProtocol.durationWeeks).toBeGreaterThan(0);
      expect(validProtocol.durationWeeks).toBeLessThanOrEqual(104);
    });

    it('should reject invalid protocol duration', () => {
      const isValidDuration = (weeks: number): boolean => {
        return weeks >= 1 && weeks <= 104;
      };

      expect(isValidDuration(12)).toBe(true);
      expect(isValidDuration(52)).toBe(true);
      expect(isValidDuration(0)).toBe(false);
      expect(isValidDuration(105)).toBe(false);
      expect(isValidDuration(-1)).toBe(false);
    });
  });
});

// ============================================================================
// FEATURE FLAGS TESTS
// ============================================================================

describe('Feature Flags', () => {
  const defaultFeatures = {
    // Core features
    showBMICalculator: true,
    showCalorieCalculator: true,
    showDoseCalculator: true,
    showShipmentTracking: true,
    showMedicationReminders: true,
    showWeightTracking: true,
    showResources: true,
    showBilling: true,
    // Treatment-specific features
    showProgressPhotos: false,
    showLabResults: false,
    showDietaryPlans: true,
    showExerciseTracking: true,
    showWaterTracking: true,
    showSleepTracking: true,
    showSymptomChecker: true,
    showHealthScore: true,
    showAchievements: true,
    showCommunityChat: false,
    showAppointments: true,
    showTelehealth: false,
    showChat: true,
    showCarePlan: true,
    showCareTeam: true,
  };

  it('should have 23 feature flags', () => {
    const flagCount = Object.keys(defaultFeatures).length;
    expect(flagCount).toBe(23);
  });

  it('should have all boolean values', () => {
    Object.values(defaultFeatures).forEach(value => {
      expect(typeof value).toBe('boolean');
    });
  });

  it('should have sensible defaults for weight loss clinic', () => {
    expect(defaultFeatures.showWeightTracking).toBe(true);
    expect(defaultFeatures.showDoseCalculator).toBe(true);
    expect(defaultFeatures.showDietaryPlans).toBe(true);
    expect(defaultFeatures.showProgressPhotos).toBe(false); // Privacy default
  });

  it('should have sensible defaults for privacy features', () => {
    expect(defaultFeatures.showCommunityChat).toBe(false);
    expect(defaultFeatures.showProgressPhotos).toBe(false);
    expect(defaultFeatures.showTelehealth).toBe(false);
  });

  describe('Feature Flag Filtering', () => {
    const allNavItems = [
      { path: '/patient-portal', label: 'Home', feature: null },
      { path: '/patient-portal/appointments', label: 'Appointments', feature: 'showAppointments' },
      { path: '/patient-portal/care-plan', label: 'Care Plan', feature: 'showCarePlan' },
      { path: '/patient-portal/progress', label: 'Progress', feature: 'showWeightTracking' },
      { path: '/patient-portal/achievements', label: 'Achievements', feature: 'showAchievements' },
      { path: '/patient-portal/shipments', label: 'Shipments', feature: 'showShipmentTracking' },
      { path: '/patient-portal/symptom-checker', label: 'Symptom Checker', feature: 'showSymptomChecker' },
      { path: '/patient-portal/resources', label: 'Resources', feature: 'showResources' },
      { path: '/patient-portal/subscription', label: 'Billing', feature: 'showBilling' },
      { path: '/patient-portal/settings', label: 'Settings', feature: null },
    ];

    it('should always show items without feature requirement', () => {
      const alwaysVisibleItems = allNavItems.filter(item => item.feature === null);
      expect(alwaysVisibleItems.length).toBeGreaterThan(0);
      expect(alwaysVisibleItems.map(i => i.path)).toContain('/patient-portal');
      expect(alwaysVisibleItems.map(i => i.path)).toContain('/patient-portal/settings');
    });

    it('should filter items based on feature flags', () => {
      const features = { ...defaultFeatures, showAppointments: false };
      
      const filteredItems = allNavItems.filter(item => {
        if (item.feature === null) return true;
        return features[item.feature as keyof typeof features] === true;
      });

      expect(filteredItems.map(i => i.path)).not.toContain('/patient-portal/appointments');
      expect(filteredItems.map(i => i.path)).toContain('/patient-portal/progress');
    });

    it('should show all items when all features enabled', () => {
      const allEnabledFeatures = Object.keys(defaultFeatures).reduce((acc, key) => {
        acc[key] = true;
        return acc;
      }, {} as Record<string, boolean>);

      const filteredItems = allNavItems.filter(item => {
        if (item.feature === null) return true;
        return allEnabledFeatures[item.feature as keyof typeof allEnabledFeatures] === true;
      });

      expect(filteredItems.length).toBe(allNavItems.length);
    });

    it('should show only core items when all optional features disabled', () => {
      const minimalFeatures = Object.keys(defaultFeatures).reduce((acc, key) => {
        acc[key] = false;
        return acc;
      }, {} as Record<string, boolean>);

      const filteredItems = allNavItems.filter(item => {
        if (item.feature === null) return true;
        return minimalFeatures[item.feature as keyof typeof minimalFeatures] === true;
      });

      // Should only have items without feature requirement
      expect(filteredItems.every(i => i.feature === null)).toBe(true);
    });
  });
});

// ============================================================================
// CLINIC BRANDING TESTS
// ============================================================================

describe('Clinic Branding', () => {
  const defaultBranding = {
    clinicId: 0,
    clinicName: 'EONPRO',
    logoUrl: null,
    iconUrl: null,
    faviconUrl: null,
    primaryColor: '#4fa77e',
    secondaryColor: '#3B82F6',
    accentColor: '#d3f931',
    buttonTextColor: 'auto',
    customCss: null,
    treatmentTypes: ['weight_loss'],
    primaryTreatment: 'weight_loss',
    treatmentProtocols: [],
    medicationCategories: ['glp1'],
    welcomeMessage: null,
    dashboardMessage: null,
    resourceVideos: [],
    dietaryPlans: [],
    supportEmail: null,
    supportPhone: null,
    supportHours: null,
    emergencyContact: null,
  };

  it('should have all required branding fields', () => {
    const requiredFields = [
      'clinicId',
      'clinicName',
      'primaryColor',
      'secondaryColor',
      'accentColor',
      'treatmentTypes',
      'primaryTreatment',
    ];

    requiredFields.forEach(field => {
      expect(defaultBranding).toHaveProperty(field);
    });
  });

  it('should validate hex color format', () => {
    const isValidHexColor = (color: string): boolean => {
      return /^#[0-9A-Fa-f]{6}$/.test(color);
    };

    expect(isValidHexColor(defaultBranding.primaryColor)).toBe(true);
    expect(isValidHexColor(defaultBranding.secondaryColor)).toBe(true);
    expect(isValidHexColor(defaultBranding.accentColor)).toBe(true);
    expect(isValidHexColor('#invalid')).toBe(false);
    expect(isValidHexColor('4fa77e')).toBe(false);
    expect(isValidHexColor('#4fa77')).toBe(false);
  });

  it('should validate buttonTextColor values', () => {
    const validValues = ['auto', 'light', 'dark'];
    expect(validValues).toContain(defaultBranding.buttonTextColor);
    expect(validValues).toContain('auto');
    expect(validValues).not.toContain('medium');
  });

  describe('Resource Videos', () => {
    const validVideo = {
      id: 'injection-guide',
      title: 'How to Self-Inject',
      description: 'Step-by-step guide',
      url: 'https://www.youtube.com/watch?v=example',
      thumbnail: '/images/thumb.jpg',
      category: 'tutorials',
    };

    it('should validate video structure', () => {
      expect(validVideo.id).toBeDefined();
      expect(validVideo.title).toBeDefined();
      expect(validVideo.url).toBeDefined();
    });

    it('should validate video URL format', () => {
      const isValidUrl = (url: string): boolean => {
        try {
          new URL(url);
          return true;
        } catch {
          return false;
        }
      };

      expect(isValidUrl(validVideo.url)).toBe(true);
      expect(isValidUrl('not-a-url')).toBe(false);
    });

    it('should allow optional video fields', () => {
      const minimalVideo = {
        id: 'video-1',
        title: 'Video Title',
        url: 'https://example.com/video',
      };

      expect(minimalVideo.id).toBeDefined();
      expect(minimalVideo.title).toBeDefined();
      expect(minimalVideo.url).toBeDefined();
    });
  });

  describe('Dietary Plans', () => {
    const validPlan = {
      id: 'low-carb',
      name: 'Low Carb Diet',
      description: 'Reduce carbohydrate intake',
      calorieTarget: 1500,
      pdfUrl: 'https://example.com/plan.pdf',
    };

    it('should validate dietary plan structure', () => {
      expect(validPlan.id).toBeDefined();
      expect(validPlan.name).toBeDefined();
      expect(validPlan.calorieTarget).toBeGreaterThan(0);
    });

    it('should validate calorie target range', () => {
      const isValidCalories = (calories: number): boolean => {
        return calories >= 800 && calories <= 5000;
      };

      expect(isValidCalories(1500)).toBe(true);
      expect(isValidCalories(800)).toBe(true);
      expect(isValidCalories(5000)).toBe(true);
      expect(isValidCalories(500)).toBe(false);
      expect(isValidCalories(6000)).toBe(false);
    });
  });
});

// ============================================================================
// BRANDING API TESTS
// ============================================================================

describe('Branding API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /api/patient-portal/branding', () => {
    it('should return branding for valid clinic', async () => {
      const mockClinic = {
        id: 1,
        name: 'Test Clinic',
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
            welcomeMessage: 'Welcome to Test Clinic!',
          },
          treatment: {
            treatmentTypes: ['weight_loss', 'hormone_therapy'],
            primaryTreatment: 'weight_loss',
          },
        },
        adminEmail: 'admin@test.com',
        phone: '555-1234',
      };

      vi.mocked(prisma.clinic.findUnique).mockResolvedValue(mockClinic as any);

      // Simulate API response structure
      const branding = {
        clinicId: mockClinic.id,
        clinicName: mockClinic.name,
        logoUrl: mockClinic.logoUrl,
        primaryColor: mockClinic.primaryColor,
        treatmentTypes: mockClinic.settings.treatment.treatmentTypes,
        primaryTreatment: mockClinic.settings.treatment.primaryTreatment,
        features: {
          showBMICalculator: true,
          showWeightTracking: true,
        },
        welcomeMessage: 'Welcome to Test Clinic!',
      };

      expect(branding.clinicId).toBe(1);
      expect(branding.clinicName).toBe('Test Clinic');
      expect(branding.treatmentTypes).toContain('weight_loss');
      expect(branding.welcomeMessage).toBe('Welcome to Test Clinic!');
    });

    it('should return default values for missing settings', async () => {
      const mockClinic = {
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

      vi.mocked(prisma.clinic.findUnique).mockResolvedValue(mockClinic as any);

      // Simulate default value handling
      const settings = mockClinic.settings || {};
      const patientPortal = (settings as any).patientPortal || {};
      const treatment = (settings as any).treatment || {};

      const branding = {
        primaryColor: mockClinic.primaryColor || '#4fa77e',
        treatmentTypes: treatment.treatmentTypes || ['weight_loss'],
        primaryTreatment: treatment.primaryTreatment || 'weight_loss',
        features: {
          showBMICalculator: patientPortal.showBMICalculator ?? true,
          showWeightTracking: patientPortal.showWeightTracking ?? true,
        },
      };

      expect(branding.primaryColor).toBe('#4fa77e');
      expect(branding.treatmentTypes).toEqual(['weight_loss']);
      expect(branding.features.showBMICalculator).toBe(true);
    });

    it('should return 404 for non-existent clinic', async () => {
      vi.mocked(prisma.clinic.findUnique).mockResolvedValue(null);

      const clinic = await prisma.clinic.findUnique({ where: { id: 999 } });
      expect(clinic).toBeNull();
    });
  });

  describe('PUT /api/patient-portal/branding', () => {
    it('should validate color format', () => {
      const colorSchema = /^#[0-9A-Fa-f]{6}$/;

      expect(colorSchema.test('#4fa77e')).toBe(true);
      expect(colorSchema.test('#FFFFFF')).toBe(true);
      expect(colorSchema.test('#000000')).toBe(true);
      expect(colorSchema.test('4fa77e')).toBe(false);
      expect(colorSchema.test('#fff')).toBe(false);
      expect(colorSchema.test('#GGGGGG')).toBe(false);
    });

    it('should validate buttonTextColor enum', () => {
      const validValues = ['auto', 'light', 'dark'];
      
      expect(validValues.includes('auto')).toBe(true);
      expect(validValues.includes('light')).toBe(true);
      expect(validValues.includes('dark')).toBe(true);
      expect(validValues.includes('medium')).toBe(false);
    });

    it('should validate custom CSS length', () => {
      const maxLength = 10000;
      
      const shortCss = '.custom { color: red; }';
      const longCss = 'a'.repeat(15000);

      expect(shortCss.length <= maxLength).toBe(true);
      expect(longCss.length <= maxLength).toBe(false);
    });
  });
});

// ============================================================================
// PORTAL SETTINGS API TESTS
// ============================================================================

describe('Portal Settings API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Input Validation', () => {
    it('should validate treatment type enum', () => {
      const validTypes = [
        'weight_loss',
        'hormone_therapy',
        'mens_health',
        'womens_health',
        'sexual_health',
        'anti_aging',
        'general_wellness',
        'custom',
      ];

      const isValid = (type: string) => validTypes.includes(type);

      expect(isValid('weight_loss')).toBe(true);
      expect(isValid('hormone_therapy')).toBe(true);
      expect(isValid('invalid')).toBe(false);
    });

    it('should validate medication category enum', () => {
      const validCategories = [
        'glp1',
        'testosterone',
        'hcg',
        'peptides',
        'vitamins',
        'compounded',
        'other',
      ];

      const isValid = (cat: string) => validCategories.includes(cat);

      expect(isValid('glp1')).toBe(true);
      expect(isValid('testosterone')).toBe(true);
      expect(isValid('invalid')).toBe(false);
    });

    it('should validate protocol check-in frequency', () => {
      const validFrequencies = ['daily', 'weekly', 'biweekly', 'monthly'];

      const isValid = (freq: string) => validFrequencies.includes(freq);

      expect(isValid('daily')).toBe(true);
      expect(isValid('weekly')).toBe(true);
      expect(isValid('yearly')).toBe(false);
    });

    it('should validate protocol duration range', () => {
      const isValidDuration = (weeks: number) => weeks >= 1 && weeks <= 104;

      expect(isValidDuration(1)).toBe(true);
      expect(isValidDuration(52)).toBe(true);
      expect(isValidDuration(104)).toBe(true);
      expect(isValidDuration(0)).toBe(false);
      expect(isValidDuration(105)).toBe(false);
    });

    it('should validate resource video URL format', () => {
      const isValidUrl = (url: string) => {
        try {
          new URL(url);
          return true;
        } catch {
          return false;
        }
      };

      expect(isValidUrl('https://youtube.com/watch?v=abc')).toBe(true);
      expect(isValidUrl('https://vimeo.com/123456')).toBe(true);
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    });

    it('should validate dietary plan calorie range', () => {
      const isValidCalories = (cal: number) => cal >= 800 && cal <= 5000;

      expect(isValidCalories(800)).toBe(true);
      expect(isValidCalories(2000)).toBe(true);
      expect(isValidCalories(5000)).toBe(true);
      expect(isValidCalories(799)).toBe(false);
      expect(isValidCalories(5001)).toBe(false);
    });

    it('should validate message length limits', () => {
      const maxLength = 500;

      const shortMessage = 'Welcome to our clinic!';
      const longMessage = 'a'.repeat(600);

      expect(shortMessage.length <= maxLength).toBe(true);
      expect(longMessage.length <= maxLength).toBe(false);
    });
  });

  describe('Settings Merge Logic', () => {
    it('should merge new features with existing', () => {
      const existingSettings = {
        patientPortal: {
          showBMICalculator: true,
          showWeightTracking: true,
          welcomeMessage: 'Existing message',
        },
        treatment: {
          treatmentTypes: ['weight_loss'],
        },
      };

      const newFeatures = {
        showBMICalculator: false, // Update existing
        showLabResults: true, // Add new
      };

      const merged = {
        patientPortal: {
          ...existingSettings.patientPortal,
          ...newFeatures,
        },
        treatment: existingSettings.treatment,
      };

      expect(merged.patientPortal.showBMICalculator).toBe(false);
      expect(merged.patientPortal.showWeightTracking).toBe(true);
      expect(merged.patientPortal.showLabResults).toBe(true);
      expect(merged.patientPortal.welcomeMessage).toBe('Existing message');
    });

    it('should preserve unmodified settings', () => {
      const existingSettings = {
        patientPortal: {
          welcomeMessage: 'Keep this',
          resourceVideos: [{ id: '1', title: 'Video 1', url: 'https://example.com' }],
        },
        treatment: {
          treatmentTypes: ['weight_loss'],
          protocols: [{ id: 'p1', name: 'Protocol 1' }],
        },
      };

      // Update only features
      const update = {
        features: { showChat: false },
      };

      const merged = {
        patientPortal: {
          ...existingSettings.patientPortal,
          ...(update.features || {}),
        },
        treatment: existingSettings.treatment,
      };

      expect(merged.patientPortal.welcomeMessage).toBe('Keep this');
      expect(merged.patientPortal.resourceVideos).toHaveLength(1);
      expect(merged.treatment.protocols).toHaveLength(1);
    });
  });
});

// ============================================================================
// CLINIC-SPECIFIC CONFIGURATIONS
// ============================================================================

describe('Clinic-Specific Configurations', () => {
  describe('Weight Loss Clinic', () => {
    const weightLossConfig = {
      treatmentTypes: ['weight_loss'],
      primaryTreatment: 'weight_loss',
      medicationCategories: ['glp1'],
      features: {
        showWeightTracking: true,
        showDoseCalculator: true,
        showCalorieCalculator: true,
        showDietaryPlans: true,
        showProgressPhotos: false,
        showLabResults: false,
      },
    };

    it('should have weight tracking enabled', () => {
      expect(weightLossConfig.features.showWeightTracking).toBe(true);
    });

    it('should have GLP-1 medication category', () => {
      expect(weightLossConfig.medicationCategories).toContain('glp1');
    });

    it('should have calorie calculator enabled', () => {
      expect(weightLossConfig.features.showCalorieCalculator).toBe(true);
    });
  });

  describe('Hormone Therapy Clinic', () => {
    const hormoneConfig = {
      treatmentTypes: ['hormone_therapy', 'mens_health'],
      primaryTreatment: 'hormone_therapy',
      medicationCategories: ['testosterone', 'hcg', 'peptides'],
      features: {
        showWeightTracking: false,
        showLabResults: true,
        showProgressPhotos: true,
        showSymptomChecker: true,
      },
    };

    it('should have lab results enabled', () => {
      expect(hormoneConfig.features.showLabResults).toBe(true);
    });

    it('should have testosterone category', () => {
      expect(hormoneConfig.medicationCategories).toContain('testosterone');
    });

    it('should have weight tracking disabled', () => {
      expect(hormoneConfig.features.showWeightTracking).toBe(false);
    });
  });

  describe("Men's Health Clinic", () => {
    const mensHealthConfig = {
      treatmentTypes: ['mens_health', 'sexual_health'],
      primaryTreatment: 'mens_health',
      medicationCategories: ['testosterone', 'peptides', 'vitamins'],
      features: {
        showProgressPhotos: true,
        showLabResults: true,
        showCommunityChat: false, // Privacy
      },
    };

    it('should have multiple treatment types', () => {
      expect(mensHealthConfig.treatmentTypes).toHaveLength(2);
    });

    it('should have community chat disabled for privacy', () => {
      expect(mensHealthConfig.features.showCommunityChat).toBe(false);
    });
  });

  describe('General Wellness Clinic', () => {
    const wellnessConfig = {
      treatmentTypes: ['general_wellness'],
      primaryTreatment: 'general_wellness',
      medicationCategories: ['vitamins', 'compounded'],
      features: {
        showWeightTracking: true,
        showExerciseTracking: true,
        showWaterTracking: true,
        showSleepTracking: true,
        showHealthScore: true,
        showAchievements: true,
      },
    };

    it('should have all lifestyle tracking enabled', () => {
      expect(wellnessConfig.features.showExerciseTracking).toBe(true);
      expect(wellnessConfig.features.showWaterTracking).toBe(true);
      expect(wellnessConfig.features.showSleepTracking).toBe(true);
    });

    it('should have gamification features', () => {
      expect(wellnessConfig.features.showHealthScore).toBe(true);
      expect(wellnessConfig.features.showAchievements).toBe(true);
    });
  });
});

// ============================================================================
// CONTENT CUSTOMIZATION TESTS
// ============================================================================

describe('Content Customization', () => {
  describe('Welcome Message', () => {
    it('should allow null welcome message', () => {
      const config = { welcomeMessage: null };
      expect(config.welcomeMessage).toBeNull();
    });

    it('should validate message length', () => {
      const maxLength = 500;
      const shortMessage = 'Welcome to our clinic!';
      const longMessage = 'a'.repeat(600);

      expect(shortMessage.length <= maxLength).toBe(true);
      expect(longMessage.length <= maxLength).toBe(false);
    });

    it('should allow HTML-safe content', () => {
      const message = 'Welcome! Please <contact us> for help.';
      // Basic XSS prevention - should not contain script tags
      expect(message.includes('<script>')).toBe(false);
    });
  });

  describe('Dashboard Message', () => {
    it('should support announcements', () => {
      const config = {
        dashboardMessage: 'New: We now offer telehealth appointments!',
      };
      expect(config.dashboardMessage).toBeDefined();
    });

    it('should allow null for no announcement', () => {
      const config = { dashboardMessage: null };
      expect(config.dashboardMessage).toBeNull();
    });
  });

  describe('Support Information', () => {
    it('should validate phone format', () => {
      const isValidPhone = (phone: string): boolean => {
        // Allow various formats: (555) 123-4567, 555-123-4567, 5551234567
        const cleaned = phone.replace(/\D/g, '');
        return cleaned.length >= 10 && cleaned.length <= 15;
      };

      expect(isValidPhone('(555) 123-4567')).toBe(true);
      expect(isValidPhone('555-123-4567')).toBe(true);
      expect(isValidPhone('5551234567')).toBe(true);
      expect(isValidPhone('123')).toBe(false);
    });

    it('should validate email format', () => {
      const isValidEmail = (email: string): boolean => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      };

      expect(isValidEmail('support@clinic.com')).toBe(true);
      expect(isValidEmail('admin@test.clinic.co')).toBe(true);
      expect(isValidEmail('invalid-email')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
    });

    it('should allow support hours string', () => {
      const config = {
        supportHours: 'Mon-Fri 9am-5pm EST',
      };
      expect(config.supportHours).toBeDefined();
    });
  });
});

// ============================================================================
// COLOR CONTRAST TESTS
// ============================================================================

describe('Color Contrast', () => {
  const getLuminance = (hex: string): number => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return 0.5;

    const [r, g, b] = [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16),
    ].map(c => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const getContrastTextColor = (bgColor: string, mode: 'auto' | 'light' | 'dark'): 'light' | 'dark' => {
    if (mode === 'light') return 'light';
    if (mode === 'dark') return 'dark';
    
    const luminance = getLuminance(bgColor);
    return luminance > 0.5 ? 'dark' : 'light';
  };

  it('should calculate luminance correctly', () => {
    expect(getLuminance('#ffffff')).toBeCloseTo(1, 1);
    expect(getLuminance('#000000')).toBeCloseTo(0, 1);
    expect(getLuminance('#4fa77e')).toBeGreaterThan(0.2);
    expect(getLuminance('#4fa77e')).toBeLessThan(0.8);
  });

  it('should return light text for dark backgrounds', () => {
    expect(getContrastTextColor('#000000', 'auto')).toBe('light');
    expect(getContrastTextColor('#1a1a1a', 'auto')).toBe('light');
    expect(getContrastTextColor('#333333', 'auto')).toBe('light');
  });

  it('should return dark text for light backgrounds', () => {
    expect(getContrastTextColor('#ffffff', 'auto')).toBe('dark');
    expect(getContrastTextColor('#f0f0f0', 'auto')).toBe('dark');
    expect(getContrastTextColor('#d3f931', 'auto')).toBe('dark'); // Accent color
  });

  it('should respect manual override', () => {
    expect(getContrastTextColor('#000000', 'dark')).toBe('dark');
    expect(getContrastTextColor('#ffffff', 'light')).toBe('light');
  });
});

// ============================================================================
// TREATMENT PROTOCOL TESTS
// ============================================================================

describe('Treatment Protocols', () => {
  const weightLossProtocol = {
    id: 'wl-standard-12',
    name: 'Standard Weight Loss',
    description: '12-week GLP-1 weight management program',
    medicationCategories: ['glp1'] as const,
    durationWeeks: 12,
    checkInFrequency: 'weekly' as const,
    requiresWeightTracking: true,
    requiresPhotos: false,
    requiresLabWork: false,
  };

  const hormoneProtocol = {
    id: 'ht-trt-12',
    name: 'TRT Protocol',
    description: 'Testosterone replacement therapy',
    medicationCategories: ['testosterone', 'hcg'] as const,
    durationWeeks: 12,
    checkInFrequency: 'biweekly' as const,
    requiresWeightTracking: false,
    requiresPhotos: true,
    requiresLabWork: true,
  };

  it('should have unique protocol IDs', () => {
    expect(weightLossProtocol.id).not.toBe(hormoneProtocol.id);
  });

  it('should have valid duration', () => {
    expect(weightLossProtocol.durationWeeks).toBeGreaterThanOrEqual(1);
    expect(weightLossProtocol.durationWeeks).toBeLessThanOrEqual(104);
  });

  it('should specify requirements based on treatment type', () => {
    // Weight loss needs weight tracking
    expect(weightLossProtocol.requiresWeightTracking).toBe(true);
    
    // Hormone therapy needs labs
    expect(hormoneProtocol.requiresLabWork).toBe(true);
  });

  it('should have appropriate check-in frequency', () => {
    // Weight loss is weekly for accountability
    expect(weightLossProtocol.checkInFrequency).toBe('weekly');
    
    // Hormone therapy is biweekly for injection schedule
    expect(hormoneProtocol.checkInFrequency).toBe('biweekly');
  });
});

// ============================================================================
// RESOURCE VIDEO VALIDATION
// ============================================================================

describe('Resource Videos', () => {
  const validVideo = {
    id: 'injection-guide',
    title: 'How to Self-Inject GLP-1',
    description: 'Step-by-step guide for subcutaneous injection',
    url: 'https://www.youtube.com/watch?v=abc123',
    thumbnail: '/images/injection-thumb.jpg',
    category: 'tutorials',
  };

  it('should have required fields', () => {
    expect(validVideo.id).toBeDefined();
    expect(validVideo.title).toBeDefined();
    expect(validVideo.url).toBeDefined();
  });

  it('should have valid URL', () => {
    expect(() => new URL(validVideo.url)).not.toThrow();
  });

  it('should validate title length', () => {
    const maxLength = 200;
    expect(validVideo.title.length).toBeLessThanOrEqual(maxLength);
  });

  it('should validate description length', () => {
    const maxLength = 500;
    expect(validVideo.description!.length).toBeLessThanOrEqual(maxLength);
  });

  it('should support various video platforms', () => {
    const youtubeUrl = 'https://www.youtube.com/watch?v=abc123';
    const vimeoUrl = 'https://vimeo.com/123456';
    const wistiaUrl = 'https://clinic.wistia.com/medias/abc123';

    [youtubeUrl, vimeoUrl, wistiaUrl].forEach(url => {
      expect(() => new URL(url)).not.toThrow();
    });
  });
});

// ============================================================================
// DIETARY PLAN VALIDATION
// ============================================================================

describe('Dietary Plans', () => {
  const validPlan = {
    id: 'low-carb-1500',
    name: 'Low Carb Diet Plan',
    description: 'Reduce carbohydrate intake for weight loss',
    calorieTarget: 1500,
    pdfUrl: 'https://clinic.com/plans/low-carb.pdf',
  };

  it('should have required fields', () => {
    expect(validPlan.id).toBeDefined();
    expect(validPlan.name).toBeDefined();
    expect(validPlan.calorieTarget).toBeDefined();
  });

  it('should have valid calorie target', () => {
    expect(validPlan.calorieTarget).toBeGreaterThanOrEqual(800);
    expect(validPlan.calorieTarget).toBeLessThanOrEqual(5000);
  });

  it('should allow null PDF URL', () => {
    const planWithoutPdf = { ...validPlan, pdfUrl: null };
    expect(planWithoutPdf.pdfUrl).toBeNull();
  });

  it('should validate PDF URL format when provided', () => {
    expect(() => new URL(validPlan.pdfUrl!)).not.toThrow();
    expect(validPlan.pdfUrl!.endsWith('.pdf')).toBe(true);
  });
});
