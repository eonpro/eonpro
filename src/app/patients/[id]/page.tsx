import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import PatientDetailShell from '@/components/PatientDetailShell';
import PatientProfileClient from '@/components/PatientProfileClient';
import PatientQuickSearch from '@/components/PatientQuickSearch';
import PatientSidebar from '@/components/PatientSidebar';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { getUserFromCookies } from '@/lib/auth/session';
import { getClinicFeatureBoolean } from '@/lib/clinic/utils';
import { queryOptimizer } from '@/lib/database';
import { basePrisma } from '@/lib/db';
import { isS3Enabled } from '@/lib/integrations/aws/s3Config';
import { generateSignedUrl } from '@/lib/integrations/aws/s3Service';
import { logger } from '@/lib/logger';
import { decryptPatientPHI, DEFAULT_PHI_FIELDS } from '@/lib/security/phi-encryption';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function resolveFallbackSubdomain(
  clinicSubdomain: string | null | undefined,
  clinicId: number | null | undefined
): string | null {
  if (clinicSubdomain) return null;
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

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string; submitted?: string; admin?: string }>;
  patientsListPath?: string;
};

const DEFAULT_PATIENTS_LIST_PATH = '/patients';

export default async function PatientDetailPage({
  params,
  searchParams,
  patientsListPath = DEFAULT_PATIENTS_LIST_PATH,
}: PageProps) {
  const PATIENTS_LIST_PATH = patientsListPath;
  let patientIdForLog: number | undefined;
  try {
    const user = await getUserFromCookies();
    if (!user) {
      redirect('/login?redirect=' + encodeURIComponent('/patients'));
    }

    const headersList = await headers();
    const resolvedParams = await params;
    const id = Number(resolvedParams.id);
    patientIdForLog = id;
    const resolvedSearchParams = searchParams ? await searchParams : undefined;
    let requestedTab = resolvedSearchParams?.tab || 'profile';
    if (requestedTab === 'labs') requestedTab = 'lab';

    if (isNaN(id) || id <= 0) {
      return (
        <div className="p-10">
          <p className="text-red-600">Invalid patient ID.</p>
          <Link href={PATIENTS_LIST_PATH} className="mt-4 block underline" style={{ color: 'var(--brand-primary, #4fa77e)' }}>
            ← Back to patients
          </Link>
        </div>
      );
    }

    const isSuperAdmin = user.role === 'super_admin';
    // getUserFromCookies() already resolved subdomain → clinicId and verified
    // clinic access, so user.clinicId is authoritative — no need to re-resolve.
    const clinicId = isSuperAdmin ? undefined : user.clinicId ?? undefined;

    if (!isSuperAdmin && clinicId == null) {
      return (
        <div className="p-10">
          <p className="text-red-600">You must be assigned to a clinic to view patients.</p>
          <Link href={PATIENTS_LIST_PATH} className="mt-4 block underline" style={{ color: 'var(--brand-primary, #4fa77e)' }}>
            ← Back to patients
          </Link>
        </div>
      );
    }

    // ─── Phase 1: Core patient query with L1/L2 caching ───────────────
    const coreWhere: any = { id };
    if (!isSuperAdmin && clinicId) {
      coreWhere.clinicId = clinicId;
    }

    const cacheKey = `patient:detail:c${clinicId ?? 'all'}:p${id}`;
    const t0 = Date.now();
    let patient: any;

    try {
      patient = await queryOptimizer.query(
        () =>
          basePrisma.patient.findFirst({
            where: coreWhere,
            include: {
              user: { select: { id: true, avatarUrl: true } },
              clinic: {
                select: { id: true, subdomain: true, name: true, features: true, address: true, phone: true },
              },
              attributionAffiliate: {
                select: { id: true, displayName: true, status: true },
              },
              portalInvites: {
                orderBy: { createdAt: 'desc' } as const,
                take: 1,
                select: { id: true, createdAt: true, trigger: true, usedAt: true, expiresAt: true },
              },
              subscriptions: {
                where: { status: 'ACTIVE' },
                take: 1,
                select: { id: true, planName: true },
              },
            },
          }),
        {
          cacheKey,
          cache: { ttl: 300, prefix: 'patient', useL1Cache: true, l1Ttl: 30 },
          timeout: 8000,
        }
      );
      logger.info('[PATIENT-DETAIL] Phase 1 (cached):', { patientId: id, durationMs: Date.now() - t0 });
    } catch (dbError) {
      logger.error('Database error fetching patient core:', {
        patientId: id, clinicId, userId: user.id, durationMs: Date.now() - t0,
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
      return (
        <div className="p-10">
          <p className="text-red-600">Error loading patient data. Please try again.</p>
          <Link href={PATIENTS_LIST_PATH} className="mt-4 block underline" style={{ color: 'var(--brand-primary, #4fa77e)' }}>
            ← Back to patients
          </Link>
        </div>
      );
    }

    // Clinic isolation enforcement
    if (patient && !isSuperAdmin && clinicId && patient.clinicId !== clinicId) {
      patient = null;
    }

    if (!patient) {
      const host = headersList.get('x-forwarded-host')?.split(',')[0]?.trim() ?? headersList.get('host') ?? '';
      logger.warn('[PATIENT-DETAIL] Patient not found / access denied', {
        patientId: id, userId: user.id, userRole: user.role,
        jwtClinicId: user.clinicId ?? null, effectiveClinicId: clinicId ?? null, host,
      });
      auditLog(headersList, {
        userId: user.id, userEmail: user.email, userRole: user.role, clinicId: user.clinicId,
        eventType: AuditEventType.PHI_VIEW, resourceType: 'Patient', resourceId: id, patientId: id,
        action: 'VIEW_PATIENT_DENIED', outcome: 'FAILURE',
        reason: `Patient not found or access denied (effectiveClinicId=${clinicId}, jwtClinicId=${user.clinicId})`,
      }).catch(() => {});

      return (
        <div className="p-10">
          <p className="text-red-600">Patient not found or you don&apos;t have access to this patient.</p>
          <p className="mt-2 text-sm text-gray-600">If you are a clinic admin, this patient may belong to a different clinic.</p>
          <p className="mt-1 text-xs text-gray-400">Clinic context: {clinicId ?? 'none'} | Role: {user.role}</p>
          <Link href={PATIENTS_LIST_PATH} className="mt-4 block underline" style={{ color: 'var(--brand-primary, #4fa77e)' }}>
            ← Back to patients
          </Link>
        </div>
      );
    }

    // HIPAA Audit (non-blocking)
    auditLog(headersList, {
      userId: user.id, userEmail: user.email, userRole: user.role, clinicId: user.clinicId,
      eventType: AuditEventType.PHI_VIEW, resourceType: 'Patient', resourceId: id, patientId: id,
      action: 'VIEW_PATIENT_RECORD', outcome: 'SUCCESS',
    }).catch(() => {});

    // Decrypt PHI fields
    let patientDecrypted: any;
    try {
      const decrypted = decryptPatientPHI(patient, [...DEFAULT_PHI_FIELDS]);
      patientDecrypted = { ...patient, ...decrypted };
    } catch {
      patientDecrypted = { ...patient };
    }

    // Strip heavy nested includes for RSC serialization safety
    const {
      orders: _o, documents: _d, intakeSubmissions: _i, auditEntries: _a,
      ...patientCore
    } = patientDecrypted;

    // Resolve avatar URL
    let patientAvatarUrl: string | null = null;
    const rawAvatarKey = patientDecrypted.user?.avatarUrl;
    if (rawAvatarKey) {
      try {
        if (rawAvatarKey.startsWith('http')) {
          patientAvatarUrl = rawAvatarKey;
        } else if (isS3Enabled()) {
          patientAvatarUrl = await Promise.race([
            generateSignedUrl(rawAvatarKey, 'GET', 3600),
            new Promise<string>((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000)),
          ]);
        }
      } catch {
        patientAvatarUrl = null;
      }
    }

    // Feature flags
    const showLabsTab = getClinicFeatureBoolean(patientDecrypted.clinic?.features, 'BLOODWORK_LABS', true);
    const doseSpotEnabled = getClinicFeatureBoolean(patientDecrypted.clinic?.features, 'DOSESPOT', false);

    // Tab validation
    const validTabs = [
      'profile', 'notes', 'intake', 'prescriptions', 'soap-notes', 'appointments', 'progress',
      ...(showLabsTab ? ['lab'] : []),
      'photos', 'billing', 'chat', 'documents',
    ];
    const effectiveTabs = user.role === 'pharmacy_rep' ? ['profile', 'prescriptions'] : validTabs;
    const currentTab = effectiveTabs.includes(requestedTab) ? requestedTab : 'profile';

    // Prepare client component props
    const patientTags = Array.isArray(patientDecrypted.tags)
      ? (patientDecrypted.tags as string[]).map((tag: any) => tag.replace(/^#/, ''))
      : [];

    const rawInvite = (patientDecrypted as any).portalInvites?.[0];
    const portalInvite = rawInvite
      ? {
          sentAt: typeof rawInvite.createdAt === 'string' ? rawInvite.createdAt : rawInvite.createdAt?.toISOString?.() ?? new Date().toISOString(),
          trigger: rawInvite.trigger as string,
          used: !!rawInvite.usedAt,
          expired: new Date(rawInvite.expiresAt) < new Date(),
        }
      : null;

    const clinicSubdomain = patientDecrypted.clinic?.subdomain;
    const fallbackSubdomain = resolveFallbackSubdomain(clinicSubdomain, patientDecrypted.clinicId);

    // ─── Render: Thin shell — sidebar + client tab router ──────────────
    return (
      <PatientDetailShell initialTab={currentTab} patientId={id} basePath={PATIENTS_LIST_PATH}>
      <div className="min-h-screen bg-[#efece7] p-3 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:gap-6">
          <PatientSidebar
            patient={patientCore}
            avatarUrl={patientAvatarUrl}
            currentTab={currentTab}
            affiliateCode={null}
            affiliateAttribution={
              patientDecrypted.attributionAffiliateId
                ? {
                    affiliateId: patientDecrypted.attributionAffiliateId,
                    refCode: patientDecrypted.attributionRefCode || undefined,
                    affiliateName: patientDecrypted.attributionAffiliate?.displayName || undefined,
                  }
                : undefined
            }
            currentSalesRep={null}
            userRole={user.role}
            currentUserId={user.id}
            clinicInfo={
              patientDecrypted.clinic
                ? {
                    name: patientDecrypted.clinic.name,
                    phone: (patientDecrypted.clinic as any).phone ?? undefined,
                    address: (patientDecrypted.clinic as any).address ?? null,
                  }
                : undefined
            }
            showLabsTab={showLabsTab}
            patientDetailBasePath={PATIENTS_LIST_PATH}
            activeMembership={
              (patientDecrypted.subscriptions as { id: number; planName: string }[])?.[0]
                ? { planName: (patientDecrypted.subscriptions as { id: number; planName: string }[])[0].planName }
                : null
            }
            orders={[]}
          />

          <div className="min-w-0 flex-1">
            <div className="mb-4 w-full">
              <PatientQuickSearch
                currentPatientId={patientDecrypted.id}
                placeholder="Search for another patient..."
                className="w-full"
                patientDetailBasePath={PATIENTS_LIST_PATH}
              />
            </div>

            <PatientProfileClient
              patientId={id}
              patientCore={patientCore}
              currentTab={currentTab}
              userRole={user.role}
              patientsListPath={PATIENTS_LIST_PATH}
              showLabsTab={showLabsTab}
              doseSpotEnabled={doseSpotEnabled}
              clinicSubdomain={clinicSubdomain}
              providerId={user.providerId}
              hasPortalAccess={!!patientDecrypted.user}
              hasEmail={!!(patientDecrypted.email && String(patientDecrypted.email).trim())}
              hasPhone={!!(patientDecrypted.phone && String(patientDecrypted.phone).trim())}
              portalInvite={portalInvite}
              patientTags={patientTags}
              patientCreatedAt={typeof patientDecrypted.createdAt === 'string' ? patientDecrypted.createdAt : patientDecrypted.createdAt?.toISOString?.() ?? new Date().toISOString()}
              submittedFlag={resolvedSearchParams?.submitted === '1'}
              isAdminView={resolvedSearchParams?.admin === 'true'}
              fallbackSubdomain={fallbackSubdomain}
            />
          </div>
        </div>
      </div>
      </PatientDetailShell>
    );
  } catch (error) {
    logger.error('Unexpected error in PatientDetailPage:', {
      patientId: patientIdForLog,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return (
      <div className="p-10">
        <p className="text-red-600">An error occurred while loading this page.</p>
        <p className="mt-2 text-sm text-gray-500">Please try refreshing the page or contact support if the problem persists.</p>
        <Link href={patientsListPath ?? '/patients'} className="mt-4 block underline" style={{ color: 'var(--brand-primary, #4fa77e)' }}>
          ← Back to patients
        </Link>
      </div>
    );
  }
}
