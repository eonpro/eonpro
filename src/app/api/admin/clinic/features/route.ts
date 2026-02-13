/**
 * Admin Clinic Features API
 *
 * View enabled features for the clinic.
 * Note: Features are typically managed by super-admin based on billing plan.
 */

import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { handleApiError, BadRequestError, NotFoundError, ForbiddenError } from '@/domains/shared/errors';

interface ClinicFeatures {
  // Core Features
  STRIPE_SUBSCRIPTIONS: boolean;
  TWILIO_SMS: boolean;
  TWILIO_CHAT: boolean;
  ZOOM_TELEHEALTH: boolean;
  AWS_S3: boolean;
  AI_SOAP_NOTES: boolean;
  INTERNAL_MESSAGING: boolean;
  TICKET_SYSTEM: boolean;

  // Advanced Features
  E_PRESCRIBING: boolean;
  LIFEFILE_INTEGRATION: boolean;
  REFILL_QUEUE: boolean;
  AFFILIATE_PROGRAM: boolean;
  MULTI_PROVIDER: boolean;
  APPOINTMENT_SCHEDULING: boolean;
  PATIENT_PORTAL: boolean;
  BECCA_AI: boolean;

  // Enterprise Features
  WHITE_LABEL: boolean;
  CUSTOM_DOMAIN: boolean;
  API_ACCESS: boolean;
  WEBHOOKS: boolean;
  SSO: boolean;
  HIPAA_AUDIT_REPORTS: boolean;

  // Dashboard patient profile
  BLOODWORK_LABS: boolean;
}

const DEFAULT_FEATURES: ClinicFeatures = {
  // Core Features (most are enabled by default)
  STRIPE_SUBSCRIPTIONS: false,
  TWILIO_SMS: false,
  TWILIO_CHAT: false,
  ZOOM_TELEHEALTH: false,
  AWS_S3: false,
  AI_SOAP_NOTES: false,
  INTERNAL_MESSAGING: true,
  TICKET_SYSTEM: true,

  // Advanced Features
  E_PRESCRIBING: false,
  LIFEFILE_INTEGRATION: false,
  REFILL_QUEUE: false,
  AFFILIATE_PROGRAM: false,
  MULTI_PROVIDER: false,
  APPOINTMENT_SCHEDULING: false,
  PATIENT_PORTAL: false,
  BECCA_AI: false,

  // Enterprise Features
  WHITE_LABEL: false,
  CUSTOM_DOMAIN: false,
  API_ACCESS: false,
  WEBHOOKS: false,
  SSO: false,
  HIPAA_AUDIT_REPORTS: false,

  // Dashboard: Labs tab on patient profile (default true for all clinics including OT)
  BLOODWORK_LABS: true,
};

/**
 * GET /api/admin/clinic/features
 * Get the current clinic's enabled features
 */
export const GET = withAuth(
  async (request: NextRequest, user: AuthUser) => {
    try {
      if (!user.clinicId) {
        throw new BadRequestError('User is not associated with a clinic');
      }

      const clinic = await prisma.clinic.findUnique({
        where: { id: user.clinicId },
        select: {
          id: true,
          name: true,
          features: true,
          billingPlan: true,
          patientLimit: true,
          providerLimit: true,
          storageLimit: true,
          lifefileEnabled: true,
          stripeAccountId: true,
        },
      });

      if (!clinic) {
        throw new NotFoundError('Clinic not found');
      }

      // Merge stored features with defaults
      const storedFeatures = (clinic.features as Partial<ClinicFeatures>) || {};
      const features: ClinicFeatures = {
        ...DEFAULT_FEATURES,
        ...storedFeatures,
        LIFEFILE_INTEGRATION: clinic.lifefileEnabled || false,
        STRIPE_SUBSCRIPTIONS: !!clinic.stripeAccountId,
      };

      // Feature descriptions for UI
      const featureDescriptions = {
        STRIPE_SUBSCRIPTIONS: 'Accept payments and manage subscriptions',
        TWILIO_SMS: 'Send SMS notifications to patients',
        TWILIO_CHAT: 'In-app chat with patients',
        ZOOM_TELEHEALTH: 'Video consultations with patients',
        AWS_S3: 'Cloud storage for documents',
        AI_SOAP_NOTES: 'AI-powered clinical documentation',
        INTERNAL_MESSAGING: 'Internal team messaging',
        TICKET_SYSTEM: 'Patient support ticket system',
        E_PRESCRIBING: 'Electronic prescribing (e-Rx)',
        LIFEFILE_INTEGRATION: 'Pharmacy integration via Lifefile',
        REFILL_QUEUE: 'Prescription refill management',
        AFFILIATE_PROGRAM: 'Referral and affiliate tracking',
        MULTI_PROVIDER: 'Multiple providers per clinic',
        APPOINTMENT_SCHEDULING: 'Online appointment booking',
        PATIENT_PORTAL: 'Patient self-service portal',
        BECCA_AI: 'AI assistant for patients',
        WHITE_LABEL: 'Custom branding and white-labeling',
        CUSTOM_DOMAIN: 'Use your own domain name',
        API_ACCESS: 'API access for integrations',
        WEBHOOKS: 'Webhook notifications',
        SSO: 'Single sign-on integration',
        HIPAA_AUDIT_REPORTS: 'HIPAA compliance audit reports',
        BLOODWORK_LABS: 'Labs / bloodwork tab on patient profile',
      };

      return NextResponse.json({
        features,
        featureDescriptions,
        limits: {
          patients: clinic.patientLimit,
          providers: clinic.providerLimit,
          storage: clinic.storageLimit,
        },
        billingPlan: clinic.billingPlan,
      });
    } catch (error) {
      return handleApiError(error, { route: 'GET /api/admin/clinic/features' });
    }
  },
  { roles: ['admin', 'super_admin'] }
);

/**
 * PATCH /api/admin/clinic/features
 * Update clinic features (merge with existing). Body: partial ClinicFeatures, e.g. { BLOODWORK_LABS: true }.
 * Super admins can pass clinicId in body to update any clinic; others update their own clinic.
 */
export const PATCH = withAuth(
  async (request: NextRequest, user: AuthUser) => {
    try {
      const body = await request.json();
      const { clinicId: bodyClinicId, ...featureUpdates } = body;

      const clinicId =
        user.role === 'super_admin' && bodyClinicId != null
          ? Number(bodyClinicId)
          : user.clinicId;

      if (!clinicId) {
        throw new BadRequestError('Clinic not found or not associated');
      }
      if (isNaN(clinicId) || clinicId <= 0) {
        throw new BadRequestError('Invalid clinic ID');
      }
      if (user.role !== 'super_admin' && bodyClinicId != null) {
        throw new ForbiddenError('Only super admins can set clinicId');
      }

      const clinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true, name: true, features: true, lifefileEnabled: true, stripeAccountId: true },
      });

      if (!clinic) {
        throw new NotFoundError('Clinic not found');
      }

      const stored = (clinic.features as Partial<ClinicFeatures>) || {};
      const merged: Partial<ClinicFeatures> = { ...stored };
      for (const key of Object.keys(featureUpdates) as (keyof ClinicFeatures)[]) {
        if (key in DEFAULT_FEATURES && typeof featureUpdates[key] === 'boolean') {
          merged[key] = featureUpdates[key];
        }
      }

      await prisma.clinic.update({
        where: { id: clinicId },
        data: { features: merged },
      });

      const features: ClinicFeatures = {
        ...DEFAULT_FEATURES,
        ...merged,
        LIFEFILE_INTEGRATION: clinic.lifefileEnabled || false,
        STRIPE_SUBSCRIPTIONS: !!clinic.stripeAccountId,
      };

      logger.info('[CLINIC-FEATURES] Updated', {
        clinicId,
        updatedBy: user.id,
        keys: Object.keys(featureUpdates),
      });

      return NextResponse.json({
        features,
        message: 'Features updated successfully',
      });
    } catch (error) {
      return handleApiError(error, { route: 'PATCH /api/admin/clinic/features' });
    }
  },
  { roles: ['admin', 'super_admin'] }
);
