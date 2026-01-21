import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/white-label/test?clinicId=X
 *
 * Comprehensive test endpoint to verify all white-label capabilities.
 * Returns a detailed report of white-label configuration and status.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');

    const results: any = {
      timestamp: new Date().toISOString(),
      tests: {},
      summary: { passed: 0, failed: 0 },
    };

    // Test 1: Database connection
    try {
      await prisma.$queryRaw`SELECT 1`;
      results.tests.databaseConnection = { status: 'PASS', message: 'Database connected' };
      results.summary.passed++;
    } catch (error: any) {
      results.tests.databaseConnection = { status: 'FAIL', message: error.message };
      results.summary.failed++;
    }

    // Test 2: Clinic table exists
    try {
      const clinicCount = await prisma.clinic.count();
      results.tests.clinicTable = {
        status: 'PASS',
        message: `Clinic table accessible, ${clinicCount} clinics in system`,
      };
      results.summary.passed++;
    } catch (error: any) {
      results.tests.clinicTable = { status: 'FAIL', message: error.message };
      results.summary.failed++;
    }

    // Test 3: List all clinics with white-label config
    try {
      const clinics = await prisma.clinic.findMany({
        select: {
          id: true,
          name: true,
          subdomain: true,
          customDomain: true,
          status: true,
          primaryColor: true,
          secondaryColor: true,
          logoUrl: true,
          faviconUrl: true,
          settings: true,
        },
        take: 10,
      });

      results.tests.clinicList = {
        status: 'PASS',
        message: `Found ${clinics.length} clinics`,
        clinics: clinics.map((c: typeof clinics[0]) => ({
          id: c.id,
          name: c.name,
          subdomain: c.subdomain,
          customDomain: c.customDomain,
          status: c.status,
          hasLogo: !!c.logoUrl,
          hasFavicon: !!c.faviconUrl,
          primaryColor: c.primaryColor,
          secondaryColor: c.secondaryColor,
          hasSettings: !!c.settings,
        })),
      };
      results.summary.passed++;
    } catch (error: any) {
      results.tests.clinicList = { status: 'FAIL', message: error.message };
      results.summary.failed++;
    }

    // If clinicId provided, run specific clinic tests
    if (clinicId) {
      const cId = parseInt(clinicId);

      // Test 4: Specific clinic exists
      try {
        const clinic = await prisma.clinic.findUnique({
          where: { id: cId },
        });

        if (clinic) {
          results.tests.clinicExists = {
            status: 'PASS',
            message: `Clinic "${clinic.name}" found`,
            clinic: {
              id: clinic.id,
              name: clinic.name,
              subdomain: clinic.subdomain,
              customDomain: clinic.customDomain,
              status: clinic.status,
            },
          };
          results.summary.passed++;

          // Test 5: Branding configuration
          const settings = (clinic.settings as any) || {};
          const patientPortal = settings.patientPortal || {};

          results.tests.brandingConfig = {
            status: 'PASS',
            message: 'Branding configuration available',
            branding: {
              logoUrl: clinic.logoUrl || null,
              faviconUrl: clinic.faviconUrl || null,
              primaryColor: clinic.primaryColor || '#3B82F6',
              secondaryColor: clinic.secondaryColor || '#10B981',
              accentColor: patientPortal.accentColor || '#d3f931',
              customCss: clinic.customCss || null,
            },
          };
          results.summary.passed++;

          // Test 6: Feature flags
          results.tests.featureFlags = {
            status: 'PASS',
            message: 'Feature flags configuration',
            features: {
              showBMICalculator: patientPortal.showBMICalculator ?? true,
              showCalorieCalculator: patientPortal.showCalorieCalculator ?? true,
              showDoseCalculator: patientPortal.showDoseCalculator ?? true,
              showShipmentTracking: patientPortal.showShipmentTracking ?? true,
              showMedicationReminders: patientPortal.showMedicationReminders ?? true,
              showWeightTracking: patientPortal.showWeightTracking ?? true,
              showResources: patientPortal.showResources ?? true,
              showBilling: patientPortal.showBilling ?? true,
            },
          };
          results.summary.passed++;

          // Test 7: Resource videos
          const resourceVideos = patientPortal.resourceVideos || [];
          results.tests.resourceVideos = {
            status: 'PASS',
            message: `${resourceVideos.length} resource videos configured`,
            videos: resourceVideos,
          };
          results.summary.passed++;

          // Test 8: Contact info
          results.tests.contactInfo = {
            status: 'PASS',
            message: 'Contact information',
            contact: {
              adminEmail: clinic.adminEmail,
              supportEmail: clinic.supportEmail || null,
              phone: clinic.phone || null,
              timezone: clinic.timezone,
            },
          };
          results.summary.passed++;

          // Test 9: Stripe integration
          results.tests.stripeIntegration = {
            status: clinic.stripeAccountId ? 'PASS' : 'INFO',
            message: clinic.stripeAccountId
              ? 'Stripe Connect configured'
              : 'Stripe Connect not configured (optional)',
            stripe: {
              hasAccountId: !!clinic.stripeAccountId,
              chargesEnabled: clinic.stripeChargesEnabled,
              payoutsEnabled: clinic.stripePayoutsEnabled,
              onboardingComplete: clinic.stripeOnboardingComplete,
            },
          };
          if (clinic.stripeAccountId) results.summary.passed++;
          else results.summary.passed++; // Info is still a pass

          // Test 10: Lifefile integration
          results.tests.lifefileIntegration = {
            status: clinic.lifefileBaseUrl ? 'PASS' : 'INFO',
            message: clinic.lifefileBaseUrl
              ? 'Lifefile pharmacy configured'
              : 'Lifefile pharmacy not configured (optional)',
            lifefile: {
              hasBaseUrl: !!clinic.lifefileBaseUrl,
              hasCredentials: !!clinic.lifefileUsername,
              practiceName: clinic.lifefilePracticeName || null,
            },
          };
          results.summary.passed++;

          // Test 11: Patient count for this clinic
          try {
            const patientCount = await prisma.patient.count({
              where: { clinicId: cId },
            });
            results.tests.clinicPatients = {
              status: 'PASS',
              message: `${patientCount} patients in clinic`,
              count: patientCount,
            };
            results.summary.passed++;
          } catch (e) {
            results.tests.clinicPatients = {
              status: 'FAIL',
              message: 'Could not count patients',
            };
            results.summary.failed++;
          }

          // Test 12: Provider count for this clinic
          try {
            const providerCount = await prisma.provider.count({
              where: { clinicId: cId },
            });
            results.tests.clinicProviders = {
              status: 'PASS',
              message: `${providerCount} providers in clinic`,
              count: providerCount,
            };
            results.summary.passed++;
          } catch (e) {
            results.tests.clinicProviders = {
              status: 'FAIL',
              message: 'Could not count providers',
            };
            results.summary.failed++;
          }
        } else {
          results.tests.clinicExists = {
            status: 'FAIL',
            message: `Clinic with ID ${cId} not found`,
          };
          results.summary.failed++;
        }
      } catch (error: any) {
        results.tests.clinicExists = { status: 'FAIL', message: error.message };
        results.summary.failed++;
      }
    }

    // Overall status
    results.overallStatus = results.summary.failed === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED';

    return NextResponse.json(results, {
      status: results.summary.failed > 0 ? 500 : 200,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'White-label test endpoint failed',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/white-label/test
 *
 * Create a test clinic for white-label testing (development only)
 */
export async function POST(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { clinicName = 'Test Clinic', subdomain = `test-${Date.now()}` } = body;

    // Create test clinic
    const clinic = await prisma.clinic.create({
      data: {
        name: clinicName,
        subdomain,
        adminEmail: 'admin@test.com',
        primaryColor: '#4fa77e',
        secondaryColor: '#3B82F6',
        status: 'ACTIVE',
        billingPlan: 'starter',
        patientLimit: 100,
        providerLimit: 5,
        storageLimit: 5000,
        timezone: 'America/New_York',
        settings: {
          patientPortal: {
            accentColor: '#d3f931',
            showBMICalculator: true,
            showCalorieCalculator: true,
            showDoseCalculator: true,
            showShipmentTracking: true,
            showMedicationReminders: true,
            showWeightTracking: true,
            showResources: true,
            showBilling: true,
            resourceVideos: [
              {
                id: 'test-video-1',
                title: 'Test Tutorial',
                description: 'A test video for white-label testing',
                url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                thumbnail: '/images/test-thumb.jpg',
                category: 'tutorials',
              },
            ],
          },
        },
        features: {
          enableEPrescriptions: true,
          enableTelemedicine: true,
          enableAI: true,
        },
        integrations: {},
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Test clinic created',
      clinic: {
        id: clinic.id,
        name: clinic.name,
        subdomain: clinic.subdomain,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to create test clinic', message: error.message },
      { status: 500 }
    );
  }
}
