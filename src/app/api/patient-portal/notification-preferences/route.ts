import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { logPHIAccess, logPHIUpdate } from '@/lib/audit/hipaa-audit';
import { z } from 'zod';

const preferencesSchema = z.object({
  preferences: z.object({
    emailReminders: z.boolean().optional(),
    smsReminders: z.boolean().optional(),
    shipmentUpdates: z.boolean().optional(),
    promotionalEmails: z.boolean().optional(),
    appointmentReminders: z.boolean().optional(),
  }),
});

const DEFAULT_PREFERENCES = {
  emailReminders: true,
  smsReminders: true,
  shipmentUpdates: true,
  promotionalEmails: false,
  appointmentReminders: true,
};

// GET - Load patient portal notification preferences
export const GET = withAuth(async (req: NextRequest, user) => {
  try {
    if (!user.patientId) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
    }

    const patient = await prisma.patient.findUnique({
      where: { id: user.patientId },
      select: { portalNotificationPrefs: true },
    });

    await logPHIAccess(req, user, 'PatientNotificationPreferences', 'read', user.patientId);

    const stored = patient?.portalNotificationPrefs;
    const prefs =
      stored && typeof stored === 'object' && !Array.isArray(stored)
        ? { ...DEFAULT_PREFERENCES, ...(stored as Record<string, unknown>) }
        : DEFAULT_PREFERENCES;

    return NextResponse.json({ preferences: prefs });
  } catch (error) {
    return handleApiError(error, { context: { route: 'GET /api/patient-portal/notification-preferences' } });
  }
}, { roles: ['patient'] });

// PUT - Save patient portal notification preferences
export const PUT = withAuth(async (req: NextRequest, user) => {
  try {
    if (!user.patientId) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
    }

    const body = await req.json();
    const parsed = preferencesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid preferences', details: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    await prisma.patient.update({
      where: { id: user.patientId },
      data: { portalNotificationPrefs: parsed.data.preferences },
    });

    await logPHIUpdate(req, user, 'PatientNotificationPreferences', user.patientId, user.patientId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { context: { route: 'PUT /api/patient-portal/notification-preferences' } });
  }
}, { roles: ['patient'] });
