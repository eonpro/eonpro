import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import PatientIntakeView from '@/components/PatientIntakeView';
import { PatientBillingView } from '@/components/PatientBillingView';
import PatientPaymentMethods from '@/components/PatientPaymentMethods';
import PatientSOAPNotesView from '@/components/PatientSOAPNotesView';
import PatientChatView from '@/components/PatientChatView';
import PatientAppointmentsView from '@/components/PatientAppointmentsView';
import PatientProgressView from '@/components/PatientProgressView';
import PatientSidebar from '@/components/PatientSidebar';
import PatientTags from '@/components/PatientTags';
import PatientPortalAccessBlock from '@/components/PatientPortalAccessBlock';
import { prisma, basePrisma, runWithClinicContext } from '@/lib/db';
import { getClinicFeatureBoolean } from '@/lib/clinic/utils';
import { SHIPPING_METHODS } from '@/lib/shipping';
import { logger } from '@/lib/logger';
import { decryptPatientPHI, DEFAULT_PHI_FIELDS } from '@/lib/security/phi-encryption';
import { getUserFromCookies } from '@/lib/auth/session';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';

// Force dynamic rendering to ensure fresh data after intake edits
export const dynamic = 'force-dynamic';

type Params = {
  params: { id: string };
};

import PatientPrescriptionsTab from '@/components/PatientPrescriptionsTab';
import PatientDocumentsView from '@/components/PatientDocumentsView';
import PatientLabView from '@/components/PatientLabView';
import PatientPhotosView from '@/components/PatientPhotosView';
import PatientPrescriptionSummary from '@/components/PatientPrescriptionSummary';
import PatientQuickSearch from '@/components/PatientQuickSearch';
import WeightProgressSummary from '@/components/WeightProgressSummary';
import PatientProgressSummary from '@/components/PatientProgressSummary';
import { Patient, Provider, Order } from '@/types/models';
import { extractVitalsFromIntake, parseDocumentData } from '@/lib/utils/vitals-extraction';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string; submitted?: string; admin?: string }>;
  /** When rendered from /provider/patients/[id], pass '/provider/patients' for back links */
  patientsListPath?: string;
};

/**
 * When clinicSubdomain is null (e.g. patient.clinic not loaded) but clinicId matches
 * known clinic env vars, return subdomain for intake section selection.
 * Prevents tenant drift where OT/Wellmedr patients show default sections.
 *
 * OVERTIME_CLINIC_ID: ot.eonpro.io → 8 (verified 2026-02-10)
 * OVERTIME_EONMEDS_CLINIC_ID: optional second OT instance on different domain
 */
function resolveFallbackSubdomain(
  clinicSubdomain: string | null | undefined,
  clinicId: number | null | undefined
): string | null {
  if (clinicSubdomain) return null; // Already have subdomain
  if (!clinicId) return null;
  const otId = process.env.OVERTIME_CLINIC_ID ? parseInt(process.env.OVERTIME_CLINIC_ID, 10) : NaN;
  const otEonmedsId = process.env.OVERTIME_EONMEDS_CLINIC_ID
    ? parseInt(process.env.OVERTIME_EONMEDS_CLINIC_ID, 10)
    : NaN;
  const wellmedrId = process.env.WELLMEDR_CLINIC_ID
    ? parseInt(process.env.WELLMEDR_CLINIC_ID, 10)
    : NaN;
  if (!isNaN(otId) && clinicId === otId) return 'ot';
  if (!isNaN(otEonmedsId) && clinicId === otEonmedsId) return 'ot';
  if (!isNaN(wellmedrId) && clinicId === wellmedrId) return 'wellmedr';
  return null;
}

const DEFAULT_PATIENTS_LIST_PATH = '/patients';

export default async function PatientDetailPage({
  params,
  searchParams,
  patientsListPath = DEFAULT_PATIENTS_LIST_PATH,
}: PageProps) {
  const PATIENTS_LIST_PATH = patientsListPath;
  let patientIdForLog: number | undefined;
  try {
    // Verify user is authenticated via cookies
    const user = await getUserFromCookies();
    if (!user) {
      // Not authenticated - redirect to login
      redirect('/login?redirect=' + encodeURIComponent('/patients'));
    }

    // Get request headers for audit logging (server components don't have NextRequest)
    const headersList = await headers();

    const resolvedParams = await params;
    const id = Number(resolvedParams.id);
    patientIdForLog = id;

    // Validate the ID
    if (isNaN(id) || id <= 0) {
      return (
        <div className="p-10">
          <p className="text-red-600">Invalid patient ID.</p>
          <Link
            href={PATIENTS_LIST_PATH}
            className="mt-4 block underline"
            style={{ color: 'var(--brand-primary, #4fa77e)' }}
          >
            ← Back to patients
          </Link>
        </div>
      );
    }

    // Fetch patient with clinic context for proper isolation
    // Super admins can access any clinic (use basePrisma to bypass filter); others restricted to their clinic
    const isSuperAdmin = user.role === 'super_admin';
    const clinicId = isSuperAdmin ? undefined : user.clinicId ?? undefined;

    // Non-super-admin must have clinic assignment
    if (!isSuperAdmin && clinicId == null) {
      return (
        <div className="p-10">
          <p className="text-red-600">You must be assigned to a clinic to view patients.</p>
          <Link
            href={PATIENTS_LIST_PATH}
            className="mt-4 block underline"
            style={{ color: 'var(--brand-primary, #4fa77e)' }}
          >
            ← Back to patients
          </Link>
        </div>
      );
    }

    const patientInclude = {
      user: { select: { id: true } },
      clinic: {
        select: { id: true, subdomain: true, name: true, features: true, address: true, phone: true },
      },
      orders: {
        orderBy: { createdAt: 'desc' } as const,
        include: {
          rxs: true,
          provider: true,
          events: { orderBy: { createdAt: 'desc' } as const },
        },
      },
      documents: {
        orderBy: { createdAt: 'desc' } as const,
        select: {
          id: true,
          filename: true,
          mimeType: true,
          createdAt: true,
          externalUrl: true,
          category: true,
          sourceSubmissionId: true,
          data: true,
        },
      },
      intakeSubmissions: {
        orderBy: { createdAt: 'desc' } as const,
        include: {
          template: true,
          responses: { include: { question: true } },
        },
      },
      auditEntries: {
        orderBy: { createdAt: 'desc' } as const,
        take: 10,
      },
      attributionAffiliate: {
        select: { id: true, displayName: true, status: true },
      },
    };

    let patient;
    let salesRepAssignments: any[] = [];
    try {
      if (isSuperAdmin) {
        // Super admin: bypass clinic filter (basePrisma allows patient in allowlist)
        patient = await basePrisma.patient.findUnique({
          where: { id },
          include: patientInclude,
        });
      } else {
        patient = await runWithClinicContext(clinicId ?? undefined, async () => {
          return prisma.patient.findUnique({
            where: { id },
            include: patientInclude,
          });
        });
      }

      // Fetch sales rep assignments separately (use patient's clinicId for context when super_admin)
      if (patient) {
        try {
          const salesRepClinicId = isSuperAdmin ? patient.clinicId : clinicId;
          if (salesRepClinicId != null) {
            salesRepAssignments = await runWithClinicContext(salesRepClinicId, async () => {
              return prisma.patientSalesRepAssignment.findMany({
                where: { patientId: id, isActive: true },
                orderBy: { assignedAt: 'desc' },
                take: 1,
                include: {
                  salesRep: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              });
            });
          }
        } catch (salesRepError) {
          logger.warn('[PATIENT-DETAIL] Could not fetch sales rep assignments:', {
            patientId: id,
            error: salesRepError instanceof Error ? salesRepError.message : String(salesRepError),
          });
          salesRepAssignments = [];
        }
      }
    } catch (dbError) {
      logger.error('Database error fetching patient:', {
        patientId: id,
        clinicId: clinicId,
        userId: user.id,
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
      return (
        <div className="p-10">
          <p className="text-red-600">Error loading patient data. Please try again.</p>
          <Link
            href={PATIENTS_LIST_PATH}
            className="mt-4 block underline"
            style={{ color: 'var(--brand-primary, #4fa77e)' }}
          >
            ← Back to patients
          </Link>
        </div>
      );
    }

    if (!patient) {
      // Patient not found or not in user's clinic - log access attempt
      await auditLog(headersList, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        clinicId: user.clinicId,
        eventType: AuditEventType.PHI_VIEW,
        resourceType: 'Patient',
        resourceId: id,
        patientId: id,
        action: 'VIEW_PATIENT_DENIED',
        outcome: 'FAILURE',
        reason: 'Patient not found or access denied',
      });

      return (
        <div className="p-10">
          <p className="text-red-600">
            Patient not found or you don't have access to this patient.
          </p>
          <p className="mt-2 text-sm text-gray-600">
            If you are a clinic admin, this patient may belong to a different clinic.
          </p>
          <Link
            href={PATIENTS_LIST_PATH}
            className="mt-4 block underline"
            style={{ color: 'var(--brand-primary, #4fa77e)' }}
          >
            ← Back to patients
          </Link>
        </div>
      );
    }

    // HIPAA Audit: Log successful PHI access
    await auditLog(headersList, {
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      clinicId: user.clinicId,
      eventType: AuditEventType.PHI_VIEW,
      resourceType: 'Patient',
      resourceId: id,
      patientId: id,
      action: 'VIEW_PATIENT_RECORD',
      outcome: 'SUCCESS',
    });

    // Decrypt PHI fields for display (with error handling)
    let patientWithDecryptedPHI: any;
    try {
      const decryptedPatient = decryptPatientPHI(patient, [...DEFAULT_PHI_FIELDS]);
      patientWithDecryptedPHI = {
        ...patient,
        ...decryptedPatient,
        // Include salesRepAssignments that were fetched separately
        salesRepAssignments: salesRepAssignments || [],
      };
    } catch (decryptError) {
      // Log the error but continue with original data
      logger.error('Failed to decrypt patient PHI, showing encrypted values:', {
        patientId: patient.id,
        error: decryptError instanceof Error ? decryptError.message : String(decryptError),
      });
      // Use original patient data as fallback
      patientWithDecryptedPHI = {
        ...patient,
        // Include salesRepAssignments that were fetched separately
        salesRepAssignments: salesRepAssignments || [],
      };
    }

    // Parse intake document data from Buffer/Uint8Array to JSON (defensive: Prisma includes are arrays)
    const documentsWithParsedData = (patientWithDecryptedPHI.documents ?? []).map((doc: any) => {
      if (doc.data && doc.category === 'MEDICAL_INTAKE_FORM') {
        try {
          let dataStr: string;

          // Handle Uint8Array (Prisma 6.x returns Bytes as Uint8Array)
          if (doc.data instanceof Uint8Array) {
            dataStr = Buffer.from(doc.data).toString('utf8');
          }
          // Handle Buffer object serialized as {type: 'Buffer', data: number[]}
          else if (
            typeof doc.data === 'object' &&
            doc.data.type === 'Buffer' &&
            Array.isArray(doc.data.data)
          ) {
            dataStr = Buffer.from(doc.data.data).toString('utf8');
          }
          // Handle actual Buffer
          else if (Buffer.isBuffer(doc.data)) {
            dataStr = doc.data.toString('utf8');
          }
          // Handle string
          else if (typeof doc.data === 'string') {
            dataStr = doc.data;
          }
          // If it's already a parsed object with answers, use it directly
          else if (typeof doc.data === 'object' && (doc.data.answers || doc.data.sections)) {
            return doc; // Already parsed
          } else {
            // Unknown format - skip parsing
            logger.warn('Unknown data format for document:', {
              docId: doc.id,
              dataType: typeof doc.data,
            });
            return doc;
          }

          // Parse the JSON string (skip if it's PDF binary data)
          const trimmed = dataStr.trim();
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            const parsedData = JSON.parse(trimmed);
            return {
              ...doc,
              data: parsedData,
            };
          } else {
            // Not JSON (likely PDF bytes) - return as-is
            return doc;
          }
        } catch (err: any) {
          logger.error('Failed to parse document data:', err.message);
          return doc;
        }
      }
      return doc;
    });

    // Format gender - handles "m", "f", "male", "female", "man", "woman"
    const formatGenderValue = (gender: string | null | undefined): string => {
      if (!gender) return 'Not set';
      const g = gender.toLowerCase().trim();
      if (g === 'm' || g === 'male' || g === 'man') return 'Male';
      if (g === 'f' || g === 'female' || g === 'woman') return 'Female';
      return gender;
    };
    const genderLabel = formatGenderValue(patientWithDecryptedPHI.gender);
    const patientTags = Array.isArray(patientWithDecryptedPHI.tags)
      ? (patientWithDecryptedPHI.tags as string[]).map((tag: any) => tag.replace(/^#/, ''))
      : [];

    // Generate consistent colors for hashtags
    const getTagColor = (tag: string) => {
      const colors = [
        { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
        { bg: 'bg-[var(--brand-primary-light)]', border: 'border-[var(--brand-primary-medium)]', text: 'text-[var(--brand-primary)]' },
        { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700' },
        { bg: 'bg-[var(--brand-secondary-light)]', border: 'border-[var(--brand-secondary)]', text: 'text-[var(--brand-secondary)]' },
        { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
        { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700' },
        { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
        { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700' },
        { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
      ];

      // Generate a consistent hash from the tag string
      let hash = 0;
      for (let i = 0; i < tag.length; i++) {
        hash = (hash << 5) - hash + tag.charCodeAt(i);
        hash = hash & hash; // Convert to 32bit integer
      }

      return colors[Math.abs(hash) % colors.length];
    };
    const shippingLabelMap = new Map(
      SHIPPING_METHODS.map((method: any) => [method.id, method.label])
    );

    // Labs tab visibility: driven by clinic feature BLOODWORK_LABS (default true).
    const showLabsTab = getClinicFeatureBoolean(
      patientWithDecryptedPHI.clinic?.features,
      'BLOODWORK_LABS',
      true
    );

    const resolvedSearchParams = searchParams ? await searchParams : undefined;
    let activeTab = resolvedSearchParams?.tab || 'profile';
    // Support both ?tab=lab and ?tab=labs (normalize to 'lab')
    if (activeTab === 'labs') activeTab = 'lab';
    const validTabs = [
      'profile',
      'intake',
      'prescriptions',
      'soap-notes',
      'appointments',
      'progress',
      ...(showLabsTab ? ['lab'] : []),
      'photos',
      'billing',
      'chat',
      'documents',
    ];
    const currentTab = validTabs.includes(activeTab) ? activeTab : 'profile';
    const submittedFlag = resolvedSearchParams?.submitted === '1';

    // Timeline event type
    interface TimelineEvent {
      id: string;
      date: Date;
      type: string;
      title: string;
      description?: string;
      data?: unknown;
    }

    // Generate timeline events from patient data
    const timelineEvents: TimelineEvent[] = [];

    // Add intake form submissions
    (patientWithDecryptedPHI.intakeSubmissions ?? []).forEach((submission: any) => {
      timelineEvents.push({
        id: `intake-${submission.id}`,
        date: new Date(submission.createdAt),
        type: 'intake',
        title: 'Patient intake',
        description: submission.template?.name || 'Intake form submitted',
      });
    });

    // Add prescriptions/orders
    (patientWithDecryptedPHI.orders ?? []).forEach((order: any) => {
      timelineEvents.push({
        id: `rx-${order.id}`,
        date: new Date(order.createdAt),
        type: 'prescription',
        title: 'Patient paid for rx',
        description: `Order #${order.id} - ${order.rxs?.length || 0} prescriptions`,
      });
    });

    // Add documents
    (patientWithDecryptedPHI.documents ?? []).forEach((doc: any) => {
      if (doc.category !== 'MEDICAL_INTAKE_FORM') {
        timelineEvents.push({
          id: `doc-${doc.id}`,
          date: new Date(doc.createdAt),
          type: 'document',
          title: 'Document uploaded',
          description: doc.filename,
        });
      }
    });

    // Add pharmacy tracking info
    (patientWithDecryptedPHI.orders ?? []).forEach((order: any) => {
      order.events?.forEach((event: any) => {
        if (event.type === 'TRACKING_UPDATE') {
          timelineEvents.push({
            id: `tracking-${event.id}`,
            date: new Date(event.createdAt),
            type: 'prescription',
            title: 'Pharmacy tracking info',
            description: event.status,
          });
        }
      });
    });

    const vitals = extractVitalsFromIntake(
      documentsWithParsedData,
      patientWithDecryptedPHI.intakeSubmissions ?? []
    );

    // ═══════════════════════════════════════════════════════════════════
    // AFFILIATE CODE EXTRACTION
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Extract affiliate/promo code from intake data
     * Checks multiple field names: "Who Recommended Us?", "Promo Code", "Influencer Code", "Affiliate Code"
     */
    const extractAffiliateCode = (): string | null => {
      const affiliateLabels = [
        'who recommended us',
        'who recommended',
        'who reccomended', // Common typo
        'promo code',
        'promocode',
        'influencer code',
        'influencercode',
        'affiliate code',
        'affiliatecode',
        'referral code',
        'referralcode',
        'partner code',
        'referred by',
      ];

      // Generic sources to skip (not actual affiliate codes)
      const genericSources = [
        'instagram',
        'facebook',
        'google',
        'tiktok',
        'youtube',
        'twitter',
        'friend',
        'family',
        'other',
        'n/a',
        'none',
        '-',
        'word of mouth',
        'social media',
        'online',
        'web search',
        'advertisement',
        'ad',
      ];

      // Source 1: Document data with sections array
      const intakeDoc = documentsWithParsedData.find(
        (d: any) =>
          d.category === 'MEDICAL_INTAKE_FORM' &&
          d.data &&
          typeof d.data === 'object' &&
          !Buffer.isBuffer(d.data) &&
          !(d.data.type === 'Buffer')
      );

      if (intakeDoc?.data) {
        // Check sections array
        if (intakeDoc.data.sections && Array.isArray(intakeDoc.data.sections)) {
          for (const section of intakeDoc.data.sections) {
            if (section.entries && Array.isArray(section.entries)) {
              for (const entry of section.entries) {
                const entryLabel = (entry.label || '').toLowerCase();
                for (const label of affiliateLabels) {
                  if (entryLabel.includes(label) && entry.value && entry.value !== '') {
                    const value = String(entry.value).trim();
                    if (!genericSources.includes(value.toLowerCase()) && value.length > 1) {
                      return value.toUpperCase();
                    }
                  }
                }
              }
            }
          }
        }

        // Check answers array directly
        if (intakeDoc.data.answers && Array.isArray(intakeDoc.data.answers)) {
          for (const answer of intakeDoc.data.answers) {
            const answerLabel = (answer.label || '').toLowerCase();
            for (const label of affiliateLabels) {
              if (answerLabel.includes(label) && answer.value && answer.value !== '') {
                const value = String(answer.value).trim();
                if (!genericSources.includes(value.toLowerCase()) && value.length > 1) {
                  return value.toUpperCase();
                }
              }
            }
          }
        }

        // Check flat key-value pairs
        for (const label of affiliateLabels) {
          const searchKey = label.replace(/[^a-z0-9]/g, '');
          for (const [key, value] of Object.entries(intakeDoc.data)) {
            const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normalizedKey.includes(searchKey) && value && value !== '') {
              const strValue = String(value).trim();
              if (!genericSources.includes(strValue.toLowerCase()) && strValue.length > 1) {
                return strValue.toUpperCase();
              }
            }
          }
        }
      }

      // Source 2: IntakeSubmissions responses
      if (patientWithDecryptedPHI.intakeSubmissions?.length > 0) {
        for (const submission of patientWithDecryptedPHI.intakeSubmissions) {
          if (submission.responses && Array.isArray(submission.responses)) {
            for (const response of submission.responses) {
              const resp = response as any;
              const questionText = (
                resp.question?.text ||
                resp.question?.label ||
                resp.question?.questionText ||
                ''
              ).toLowerCase();
              for (const label of affiliateLabels) {
                if (questionText.includes(label) && resp.value && resp.value !== '') {
                  const value = String(resp.value).trim();
                  if (!genericSources.includes(value.toLowerCase()) && value.length > 1) {
                    return value.toUpperCase();
                  }
                }
              }
            }
          }
        }
      }

      return null;
    };

    const affiliateCode = extractAffiliateCode();

    // ═══════════════════════════════════════════════════════════════════
    // HEALTH RISK COLOR HELPERS
    // ═══════════════════════════════════════════════════════════════════

    // BMI Risk Levels:
    // - Underweight: < 18.5 (yellow)
    // - Normal: 18.5 - 24.9 (green)
    // - Overweight: 25 - 29.9 (yellow)
    // - Obese: 30+ (red)
    const getBmiColor = (
      bmi: string | null | undefined
    ): { bar: string; text: string; width: string } => {
      if (!bmi) return { bar: 'bg-gray-400', text: 'text-gray-600', width: '0%' };
      const bmiNum = parseFloat(bmi);
      if (isNaN(bmiNum)) return { bar: 'bg-gray-400', text: 'text-gray-600', width: '0%' };

      // Calculate width based on BMI (scale: 15-50 range mapped to 0-100%)
      const width = Math.min(100, Math.max(0, ((bmiNum - 15) / 35) * 100));

      if (bmiNum < 18.5)
        return { bar: 'bg-yellow-500', text: 'text-yellow-600', width: `${width}%` };
      if (bmiNum < 25)
        return { bar: 'bg-emerald-500', text: 'text-emerald-600', width: `${width}%` };
      if (bmiNum < 30) return { bar: 'bg-yellow-500', text: 'text-yellow-600', width: `${width}%` };
      return { bar: 'bg-red-500', text: 'text-red-600', width: `${width}%` };
    };

    // Blood Pressure Risk Levels:
    // - Normal: < 120/80 (green)
    // - Elevated: 120-129 / < 80 (yellow)
    // - High Stage 1: 130-139 / 80-89 (yellow)
    // - High Stage 2: 140+ / 90+ (red)
    const getBloodPressureColor = (
      bp: string | null | undefined
    ): { bar: string; text: string; width: string } => {
      if (!bp || bp.toLowerCase() === 'unknown')
        return { bar: 'bg-gray-400', text: 'text-gray-600', width: '0%' };

      // Parse blood pressure (format: "120/80" or "120 / 80")
      const parts = bp.replace(/\s/g, '').split('/');
      if (parts.length !== 2) return { bar: 'bg-gray-400', text: 'text-gray-600', width: '50%' };

      const systolic = parseInt(parts[0]);
      const diastolic = parseInt(parts[1]);
      if (isNaN(systolic) || isNaN(diastolic))
        return { bar: 'bg-gray-400', text: 'text-gray-600', width: '50%' };

      // Calculate width based on systolic (scale: 90-180 range mapped to 0-100%)
      const width = Math.min(100, Math.max(0, ((systolic - 90) / 90) * 100));

      if (systolic < 120 && diastolic < 80)
        return { bar: 'bg-emerald-500', text: 'text-emerald-600', width: `${width}%` };
      if (systolic < 130 && diastolic < 80)
        return { bar: 'bg-yellow-500', text: 'text-yellow-600', width: `${width}%` };
      if (systolic < 140 || diastolic < 90)
        return { bar: 'bg-yellow-500', text: 'text-yellow-600', width: `${width}%` };
      return { bar: 'bg-red-500', text: 'text-red-600', width: `${width}%` };
    };

    // Weight Risk (based on BMI since weight alone is not meaningful)
    // Uses BMI color if available, otherwise gray
    const getWeightColor = (
      weight: string | null | undefined,
      bmi: string | null | undefined
    ): { bar: string; text: string; width: string } => {
      if (!weight) return { bar: 'bg-gray-400', text: 'text-gray-600', width: '0%' };

      const weightNum = parseFloat(weight.replace(/[^\d.]/g, ''));
      if (isNaN(weightNum)) return { bar: 'bg-gray-400', text: 'text-gray-600', width: '0%' };

      // Calculate width based on weight (scale: 100-400 lbs range mapped to 0-100%)
      const width = Math.min(100, Math.max(0, ((weightNum - 100) / 300) * 100));

      // Use BMI color if available
      if (bmi) {
        const bmiColor = getBmiColor(bmi);
        return { ...bmiColor, width: `${width}%` };
      }

      return { bar: 'bg-gray-500', text: 'text-gray-600', width: `${width}%` };
    };

    const bmiColor = getBmiColor(vitals.bmi);
    const bpColor = getBloodPressureColor(vitals.bloodPressure);
    const weightColor = getWeightColor(vitals.weight, vitals.bmi);

    return (
      <div className="min-h-screen bg-[#efece7] p-6">
        <div className="flex gap-6">
          {/* Left Sidebar - Patient Info & Navigation */}
          <PatientSidebar
            patient={patientWithDecryptedPHI}
            currentTab={currentTab}
            affiliateCode={affiliateCode}
            affiliateAttribution={
              patientWithDecryptedPHI.attributionAffiliateId
                ? {
                    affiliateId: patientWithDecryptedPHI.attributionAffiliateId,
                    refCode: patientWithDecryptedPHI.attributionRefCode || undefined,
                    affiliateName: patientWithDecryptedPHI.attributionAffiliate?.displayName || undefined,
                  }
                : undefined
            }
            currentSalesRep={patientWithDecryptedPHI.salesRepAssignments?.[0]?.salesRep || null}
            userRole={user.role}
            clinicInfo={
              patientWithDecryptedPHI.clinic
                ? {
                    name: patientWithDecryptedPHI.clinic.name,
                    phone: (patientWithDecryptedPHI.clinic as any).phone ?? undefined,
                    address: (patientWithDecryptedPHI.clinic as any).address ?? null,
                  }
                : undefined
            }
            showLabsTab={showLabsTab}
            patientDetailBasePath={PATIENTS_LIST_PATH}
          />

          {/* Main Content Area */}
          <div className="min-w-0 flex-1">
            {/* Quick Search Bar - full width to match content boxes */}
            <div className="mb-4 w-full">
              <PatientQuickSearch
                currentPatientId={patientWithDecryptedPHI.id}
                placeholder="Search for another patient..."
                className="w-full"
                patientDetailBasePath={PATIENTS_LIST_PATH}
              />
            </div>

            {submittedFlag && (currentTab === 'profile' || currentTab === 'prescriptions') && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <svg
                  className="h-5 w-5 flex-shrink-0 text-emerald-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Prescription submitted successfully.
              </div>
            )}

            {currentTab === 'profile' ? (
              <div className="space-y-6">
                {/* Title */}
                <h1 className="text-2xl font-bold text-gray-900">Patient Overview</h1>

                {/* Portal access + Send invite */}
                <PatientPortalAccessBlock
                  patientId={patientWithDecryptedPHI.id}
                  hasPortalAccess={!!patientWithDecryptedPHI.user}
                  hasEmail={
                    !!(
                      patientWithDecryptedPHI.email && String(patientWithDecryptedPHI.email).trim()
                    )
                  }
                  hasPhone={
                    !!(
                      patientWithDecryptedPHI.phone && String(patientWithDecryptedPHI.phone).trim()
                    )
                  }
                />

                {/* Vitals Section */}
                <div className="rounded-2xl border border-gray-200 bg-white p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <svg
                      className="h-5 w-5 text-gray-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    <h2 className="text-lg font-semibold text-gray-900">Vitals</h2>
                  </div>

                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {/* Height - No health indicator (neutral) */}
                    <div className="rounded-xl bg-[#efece7] p-4">
                      <p className="mb-1 text-sm text-gray-500">Height</p>
                      <p className="text-2xl font-bold text-gray-900">{vitals.height || '—'}</p>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-300">
                        <div
                          className="h-full rounded-full bg-gray-500"
                          style={{ width: vitals.height ? '100%' : '0%' }}
                        />
                      </div>
                    </div>

                    {/* Weight - Color based on BMI */}
                    <div className="rounded-xl bg-[#efece7] p-4">
                      <p className="mb-1 text-sm text-gray-500">Weight</p>
                      <p
                        className={`text-2xl font-bold ${vitals.weight ? weightColor.text : 'text-gray-900'}`}
                      >
                        {vitals.weight ? `${vitals.weight}lbs` : '—'}
                      </p>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-300">
                        <div
                          className={`h-full ${weightColor.bar} rounded-full transition-all duration-500`}
                          style={{ width: weightColor.width }}
                        />
                      </div>
                    </div>

                    {/* BMI - Color coded by obesity level */}
                    <div className="rounded-xl bg-[#efece7] p-4">
                      <p className="mb-1 text-sm text-gray-500">BMI</p>
                      <p
                        className={`text-2xl font-bold ${vitals.bmi ? bmiColor.text : 'text-gray-900'}`}
                      >
                        {vitals.bmi || '—'}
                      </p>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-300">
                        <div
                          className={`h-full ${bmiColor.bar} rounded-full transition-all duration-500`}
                          style={{ width: bmiColor.width }}
                        />
                      </div>
                    </div>

                    {/* Blood Pressure - Color coded by hypertension level */}
                    <div className="rounded-xl bg-[#efece7] p-4">
                      <p className="mb-1 text-sm text-gray-500">Blood pressure</p>
                      <p
                        className={`text-2xl font-bold ${vitals.bloodPressure && vitals.bloodPressure !== 'unknown' ? bpColor.text : 'text-gray-900'}`}
                      >
                        {vitals.bloodPressure && vitals.bloodPressure.toLowerCase() !== 'unknown'
                          ? vitals.bloodPressure
                          : '—'}
                      </p>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-300">
                        <div
                          className={`h-full ${bpColor.bar} rounded-full transition-all duration-500`}
                          style={{ width: bpColor.width }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Prescription & Tracking Summary */}
                <PatientPrescriptionSummary patientId={patientWithDecryptedPHI.id} />

                {/* Tags and Overview */}
                <div className="rounded-2xl border border-gray-200 bg-white p-6">
                  {/* Editable Tags Component */}
                  <PatientTags patientId={patientWithDecryptedPHI.id} initialTags={patientTags} />

                  <div>
                    <h3 className="mb-2 text-lg font-semibold text-gray-900">Overview</h3>
                    <p className="text-sm text-gray-600">
                      Total prescriptions: {patientWithDecryptedPHI.orders.length}
                    </p>
                    <p className="mt-1 text-sm text-gray-500" suppressHydrationWarning>
                      Last updated: {new Date(patientWithDecryptedPHI.createdAt).toLocaleString()}
                    </p>
                  </div>

                  {/* Weight Progress Summary - Shows patient's journey entries */}
                  <WeightProgressSummary patientId={patientWithDecryptedPHI.id} />

                  {/* Activity Summary - Water, Exercise, Sleep, Nutrition */}
                  <PatientProgressSummary patientId={patientWithDecryptedPHI.id} />
                </div>

                {/* Audit Log for admins */}
                {resolvedSearchParams?.admin === 'true' && (
                  <div className="rounded-2xl border border-gray-200 bg-white p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-lg font-semibold">Patient Audit Log</h2>
                      <span className="rounded bg-red-100 px-2 py-1 text-xs text-red-700">
                        Admin Only
                      </span>
                    </div>
                    {patientWithDecryptedPHI.auditEntries.length === 0 ? (
                      <p className="text-sm text-gray-500">No edits recorded yet.</p>
                    ) : (
                      <div className="space-y-3 text-sm">
                        {patientWithDecryptedPHI.auditEntries.map((entry: any) => (
                          <div key={entry.id} className="rounded-lg border bg-[#efece7] p-3">
                            <div className="mb-2 flex justify-between text-xs text-gray-500">
                              <span>{entry.actorEmail ?? 'Unknown actor'}</span>
                              <span suppressHydrationWarning>
                                {new Date(entry.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <pre className="whitespace-pre-wrap rounded border bg-white p-2 text-xs">
                              {JSON.stringify(entry.diff, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : currentTab === 'intake' ? (
              <PatientIntakeView
                patient={patientWithDecryptedPHI}
                documents={documentsWithParsedData}
                intakeFormSubmissions={patientWithDecryptedPHI.intakeSubmissions}
                clinicSubdomain={patientWithDecryptedPHI.clinic?.subdomain}
                fallbackSubdomainForSections={resolveFallbackSubdomain(
                  patientWithDecryptedPHI.clinic?.subdomain,
                  patientWithDecryptedPHI.clinicId
                )}
              />
            ) : currentTab === 'soap-notes' ? (
              <PatientSOAPNotesView patientId={patientWithDecryptedPHI.id} />
            ) : currentTab === 'appointments' ? (
              <PatientAppointmentsView
                patient={patientWithDecryptedPHI}
                clinicId={patientWithDecryptedPHI.clinicId || undefined}
              />
            ) : currentTab === 'progress' ? (
              <PatientProgressView patient={patientWithDecryptedPHI} />
            ) : currentTab === 'prescriptions' ? (
              <PatientPrescriptionsTab
                patient={patientWithDecryptedPHI}
                orders={patientWithDecryptedPHI.orders}
                shippingLabelMap={shippingLabelMap}
              />
            ) : currentTab === 'billing' ? (
              <div className="space-y-6">
                <PatientBillingView
                  patientId={patientWithDecryptedPHI.id}
                  patientName={`${patientWithDecryptedPHI.firstName} ${patientWithDecryptedPHI.lastName}`}
                  clinicSubdomain={patientWithDecryptedPHI.clinic?.subdomain ?? resolveFallbackSubdomain(patientWithDecryptedPHI.clinic?.subdomain, patientWithDecryptedPHI.clinicId)}
                />
                <div className="rounded-2xl border border-gray-200 bg-white p-6">
                  <h3 className="mb-4 border-b border-gray-200 pb-3 text-lg font-semibold">
                    Payment Methods
                  </h3>
                  <PatientPaymentMethods
                    patientId={patientWithDecryptedPHI.id}
                    patientName={`${patientWithDecryptedPHI.firstName} ${patientWithDecryptedPHI.lastName}`}
                  />
                </div>
              </div>
            ) : currentTab === 'lab' ? (
              <PatientLabView
                patientId={patientWithDecryptedPHI.id}
                patientName={`${patientWithDecryptedPHI.firstName} ${patientWithDecryptedPHI.lastName}`}
              />
            ) : currentTab === 'documents' ? (
              <PatientDocumentsView
                patientId={patientWithDecryptedPHI.id}
                patientName={`${patientWithDecryptedPHI.firstName} ${patientWithDecryptedPHI.lastName}`}
              />
            ) : currentTab === 'chat' ? (
              <PatientChatView patient={patientWithDecryptedPHI} />
            ) : currentTab === 'photos' ? (
              <PatientPhotosView
                patientId={patientWithDecryptedPHI.id}
                patientName={`${patientWithDecryptedPHI.firstName} ${patientWithDecryptedPHI.lastName}`}
              />
            ) : null}
          </div>
        </div>
      </div>
    );
  } catch (error) {
    // Global error handler - catch any unexpected errors
    logger.error('Unexpected error in PatientDetailPage:', {
      patientId: patientIdForLog,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return (
      <div className="p-10">
        <p className="text-red-600">An error occurred while loading this page.</p>
        <p className="mt-2 text-sm text-gray-500">
          Please try refreshing the page or contact support if the problem persists.
        </p>
        <Link
          href={PATIENTS_LIST_PATH}
          className="mt-4 block underline"
          style={{ color: 'var(--brand-primary, #4fa77e)' }}
        >
          ← Back to patients
        </Link>
      </div>
    );
  }
}

function formatDob(dob: string | null) {
  if (!dob) return '—';
  const clean = dob.trim();
  if (!clean) return '—';
  if (clean.includes('/')) return clean;
  const parts = clean.split('-');
  if (parts.length === 3) {
    const [yyyy, mm, dd] = parts;
    if (yyyy && mm && dd) {
      return `${mm.padStart(2, '0')}/${dd.padStart(2, '0')}/${yyyy}`;
    }
  }
  return clean;
}
