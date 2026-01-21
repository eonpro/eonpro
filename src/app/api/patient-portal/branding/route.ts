import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/patient-portal/branding
 *
 * Fetches clinic branding for the patient portal
 * Query params: clinicId (required)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });
    }

    const clinic = await prisma.clinic.findUnique({
      where: { id: parseInt(clinicId) },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        faviconUrl: true,
        primaryColor: true,
        secondaryColor: true,
        customCss: true,
        settings: true,
        adminEmail: true,
        phone: true,
      },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    // Parse settings JSON for features and resources
    const settings = (clinic.settings as any) || {};
    const patientPortalSettings = settings.patientPortal || {};

    const branding = {
      clinicId: clinic.id,
      clinicName: clinic.name,
      logoUrl: clinic.logoUrl,
      faviconUrl: clinic.faviconUrl,
      primaryColor: clinic.primaryColor || '#4fa77e',
      secondaryColor: clinic.secondaryColor || '#3B82F6',
      accentColor: patientPortalSettings.accentColor || '#d3f931',
      customCss: clinic.customCss,
      features: {
        showBMICalculator: patientPortalSettings.showBMICalculator ?? true,
        showCalorieCalculator: patientPortalSettings.showCalorieCalculator ?? true,
        showDoseCalculator: patientPortalSettings.showDoseCalculator ?? true,
        showShipmentTracking: patientPortalSettings.showShipmentTracking ?? true,
        showMedicationReminders: patientPortalSettings.showMedicationReminders ?? true,
        showWeightTracking: patientPortalSettings.showWeightTracking ?? true,
        showResources: patientPortalSettings.showResources ?? true,
        showBilling: patientPortalSettings.showBilling ?? true,
      },
      resourceVideos: patientPortalSettings.resourceVideos || [
        {
          id: 'injection-guide',
          title: 'How to Self-Inject',
          description: 'Step-by-step guide for subcutaneous injection',
          url: 'https://www.youtube.com/watch?v=example1',
          thumbnail: '/images/injection-thumbnail.jpg',
          category: 'tutorials',
        },
        {
          id: 'diet-tips',
          title: 'Diet Tips for Weight Loss',
          description: 'Nutrition guidelines while on GLP-1 medication',
          url: 'https://www.youtube.com/watch?v=example2',
          thumbnail: '/images/diet-thumbnail.jpg',
          category: 'nutrition',
        },
      ],
      supportEmail: clinic.adminEmail,
      supportPhone: clinic.phone,
    };

    return NextResponse.json(branding);
  } catch (error: any) {
    console.error('Error fetching clinic branding:', error);
    return NextResponse.json({ error: 'Failed to fetch clinic branding' }, { status: 500 });
  }
}

/**
 * PUT /api/patient-portal/branding
 *
 * Updates clinic branding settings (admin only)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { clinicId, ...brandingData } = body;

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });
    }

    // Verify the clinic exists
    const existingClinic = await prisma.clinic.findUnique({
      where: { id: parseInt(clinicId) },
    });

    if (!existingClinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    // Build update object
    const updateData: any = {};

    if (brandingData.logoUrl !== undefined) {
      updateData.logoUrl = brandingData.logoUrl;
    }
    if (brandingData.faviconUrl !== undefined) {
      updateData.faviconUrl = brandingData.faviconUrl;
    }
    if (brandingData.primaryColor !== undefined) {
      updateData.primaryColor = brandingData.primaryColor;
    }
    if (brandingData.secondaryColor !== undefined) {
      updateData.secondaryColor = brandingData.secondaryColor;
    }
    if (brandingData.customCss !== undefined) {
      updateData.customCss = brandingData.customCss;
    }

    // Update settings JSON for patient portal specific settings
    if (brandingData.features || brandingData.accentColor || brandingData.resourceVideos) {
      const currentSettings = (existingClinic.settings as any) || {};
      updateData.settings = {
        ...currentSettings,
        patientPortal: {
          ...(currentSettings.patientPortal || {}),
          ...(brandingData.accentColor && { accentColor: brandingData.accentColor }),
          ...(brandingData.features && { ...brandingData.features }),
          ...(brandingData.resourceVideos && { resourceVideos: brandingData.resourceVideos }),
        },
      };
    }

    const updatedClinic = await prisma.clinic.update({
      where: { id: parseInt(clinicId) },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      clinic: {
        id: updatedClinic.id,
        name: updatedClinic.name,
        logoUrl: updatedClinic.logoUrl,
        primaryColor: updatedClinic.primaryColor,
      },
    });
  } catch (error: any) {
    console.error('Error updating clinic branding:', error);
    return NextResponse.json({ error: 'Failed to update clinic branding' }, { status: 500 });
  }
}
