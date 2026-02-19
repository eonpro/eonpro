import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  generateWidgetSession,
  deauthenticateUser,
  getProviderLabel,
} from '@/lib/integrations/terra/client';

/**
 * GET /api/patient-portal/devices
 * List the patient's connected wearable devices.
 */
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.patientId) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
    }

    const connections = await prisma.patientDeviceConnection.findMany({
      where: { patientId: user.patientId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        provider: true,
        isActive: true,
        lastSyncAt: true,
        createdAt: true,
        terraUserId: true,
      },
    });

    const devices = connections.map((c) => ({
      id: c.id,
      provider: c.provider,
      providerLabel: getProviderLabel(c.provider),
      isActive: c.isActive,
      lastSyncAt: c.lastSyncAt?.toISOString() || null,
      connectedAt: c.createdAt.toISOString(),
    }));

    return NextResponse.json({ devices });
  } catch (error) {
    logger.error('Failed to list devices', {
      patientId: user.patientId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to load devices' },
      { status: 500 }
    );
  }
}, { roles: ['patient'] });

/**
 * POST /api/patient-portal/devices
 * Generate a Terra widget session to connect a new device.
 * Body: { providers?: string[] }
 */
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.patientId) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
    }

    const patient = await prisma.patient.findUnique({
      where: { id: user.patientId },
      select: { clinicId: true },
    });

    if (!patient?.clinicId) {
      return NextResponse.json({ error: 'Patient clinic not found' }, { status: 400 });
    }

    let body: { providers?: string[] } = {};
    try {
      body = await req.json();
    } catch {
      // No body is fine — connect all providers
    }

    // reference_id links the Terra user back to our patient
    const referenceId = `${user.patientId}:${patient.clinicId}`;

    const session = await generateWidgetSession(
      referenceId,
      body.providers
    );

    logger.info('Terra widget session generated', {
      patientId: user.patientId,
      clinicId: patient.clinicId,
      sessionId: session.session_id,
    });

    return NextResponse.json({
      url: session.url,
      sessionId: session.session_id,
    });
  } catch (error) {
    logger.error('Failed to generate Terra widget session', {
      patientId: user.patientId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to start device connection' },
      { status: 500 }
    );
  }
}, { roles: ['patient'] });

/**
 * DELETE /api/patient-portal/devices
 * Disconnect a device. Body: { deviceId: number }
 */
export const DELETE = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.patientId) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
    }

    let body: { deviceId?: number } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Request body required' }, { status: 400 });
    }

    if (!body.deviceId) {
      return NextResponse.json({ error: 'deviceId is required' }, { status: 400 });
    }

    const connection = await prisma.patientDeviceConnection.findFirst({
      where: {
        id: body.deviceId,
        patientId: user.patientId,
      },
    });

    if (!connection) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    // Deauth from Terra's side
    try {
      await deauthenticateUser(connection.terraUserId);
    } catch (err) {
      logger.warn('Terra deauth API call failed — marking inactive locally', {
        terraUserId: connection.terraUserId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await prisma.patientDeviceConnection.update({
      where: { id: connection.id },
      data: { isActive: false },
    });

    logger.info('Device disconnected', {
      patientId: user.patientId,
      deviceId: connection.id,
      provider: connection.provider,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to disconnect device', {
      patientId: user.patientId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to disconnect device' },
      { status: 500 }
    );
  }
}, { roles: ['patient'] });
