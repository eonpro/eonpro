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
        return NextResponse.json(
          { error: 'User is not associated with a clinic' },
          { status: 400 }
        );
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
        return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
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
      logger.error('Error fetching clinic features:', error);
      return NextResponse.json({ error: 'Failed to fetch features' }, { status: 500 });
    }
  },
  { roles: ['admin', 'super_admin'] }
);
