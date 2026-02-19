import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { verifyTerraSignature } from '@/lib/integrations/terra/client';
import {
  mapBodyToWeightLogs,
  mapActivityToExerciseLogs,
  mapSleepToSleepLogs,
  mapNutritionToNutritionLogs,
  mapDailyToExerciseLogs,
} from '@/lib/integrations/terra/data-mapper';
import type {
  TerraBodyData,
  TerraActivityData,
  TerraSleepData,
  TerraNutritionData,
  TerraDailyData,
} from '@/lib/integrations/terra/data-mapper';

interface TerraUser {
  user_id: string;
  provider: string;
  reference_id?: string;
}

interface TerraWebhookPayload {
  type: string;
  status?: string;
  user?: TerraUser;
  old_user?: TerraUser;
  new_user?: TerraUser;
  data?: unknown[];
  reference_id?: string;
  widget_session_id?: string;
  version?: string;
}

/**
 * Resolve the patientId and clinicId from a Terra user_id by looking up
 * the PatientDeviceConnection table.
 */
async function resolvePatient(
  terraUserId: string
): Promise<{ patientId: number; clinicId: number } | null> {
  const conn = await prisma.patientDeviceConnection.findUnique({
    where: { terraUserId },
    select: { patientId: true, clinicId: true, isActive: true },
  });

  if (!conn || !conn.isActive) return null;
  return { patientId: conn.patientId, clinicId: conn.clinicId };
}

async function updateLastSync(terraUserId: string): Promise<void> {
  await prisma.patientDeviceConnection.update({
    where: { terraUserId },
    data: { lastSyncAt: new Date() },
  }).catch((err) => {
    logger.warn('Failed to update lastSyncAt for device', { terraUserId, error: String(err) });
  });
}

// ---- Auth event handler ----

async function handleAuth(payload: TerraWebhookPayload): Promise<void> {
  if (payload.status !== 'success' || !payload.user) {
    logger.info('Terra auth event with non-success status', {
      status: payload.status,
      terraUserId: payload.user?.user_id,
    });
    return;
  }

  const { user, reference_id } = payload;
  if (!reference_id) {
    logger.warn('Terra auth event missing reference_id', { terraUserId: user.user_id });
    return;
  }

  // reference_id is formatted as "patientId:clinicId"
  const [patientIdStr, clinicIdStr] = reference_id.split(':');
  const patientId = parseInt(patientIdStr, 10);
  const clinicId = parseInt(clinicIdStr, 10);

  if (isNaN(patientId) || isNaN(clinicId)) {
    logger.error('Terra auth event has invalid reference_id format', {
      reference_id,
      terraUserId: user.user_id,
    });
    return;
  }

  await prisma.patientDeviceConnection.upsert({
    where: { terraUserId: user.user_id },
    update: {
      provider: user.provider?.toUpperCase() || 'UNKNOWN',
      isActive: true,
      lastSyncAt: new Date(),
    },
    create: {
      patientId,
      clinicId,
      terraUserId: user.user_id,
      provider: user.provider?.toUpperCase() || 'UNKNOWN',
      isActive: true,
      lastSyncAt: new Date(),
    },
  });

  logger.info('Terra device connected', {
    patientId,
    clinicId,
    provider: user.provider,
    terraUserId: user.user_id,
  });
}

// ---- Deauth / access revoked handler ----

async function handleDeauth(payload: TerraWebhookPayload): Promise<void> {
  const terraUserId = payload.user?.user_id;
  if (!terraUserId) return;

  await prisma.patientDeviceConnection.updateMany({
    where: { terraUserId },
    data: { isActive: false },
  });

  logger.info('Terra device disconnected', { terraUserId });
}

// ---- User re-auth handler ----

async function handleUserReauth(payload: TerraWebhookPayload): Promise<void> {
  const oldUser = payload.old_user;
  const newUser = payload.new_user;
  if (!oldUser?.user_id || !newUser?.user_id) return;

  await prisma.$transaction(async (tx) => {
    const oldConn = await tx.patientDeviceConnection.findUnique({
      where: { terraUserId: oldUser.user_id },
    });

    if (oldConn) {
      await tx.patientDeviceConnection.delete({
        where: { terraUserId: oldUser.user_id },
      });

      await tx.patientDeviceConnection.upsert({
        where: { terraUserId: newUser.user_id },
        update: {
          provider: newUser.provider?.toUpperCase() || oldConn.provider,
          isActive: true,
          lastSyncAt: new Date(),
        },
        create: {
          patientId: oldConn.patientId,
          clinicId: oldConn.clinicId,
          terraUserId: newUser.user_id,
          provider: newUser.provider?.toUpperCase() || oldConn.provider,
          isActive: true,
          lastSyncAt: new Date(),
        },
      });

      logger.info('Terra user re-auth: migrated connection', {
        oldTerraUserId: oldUser.user_id,
        newTerraUserId: newUser.user_id,
        patientId: oldConn.patientId,
      });
    }
  });
}

// ---- Data event handlers ----

async function handleBodyData(
  terraUserId: string,
  data: TerraBodyData[],
  provider: string
): Promise<number> {
  const patient = await resolvePatient(terraUserId);
  if (!patient) return 0;

  const logs = mapBodyToWeightLogs(data, provider);
  if (!logs.length) return 0;

  let created = 0;
  for (const log of logs) {
    const existing = await prisma.patientWeightLog.findFirst({
      where: {
        patientId: patient.patientId,
        source: 'device',
        recordedAt: log.recordedAt,
      },
    });

    if (existing) {
      await prisma.patientWeightLog.update({
        where: { id: existing.id },
        data: { weight: log.weight, notes: log.notes },
      });
    } else {
      await prisma.patientWeightLog.create({
        data: {
          patientId: patient.patientId,
          ...log,
        },
      });
      created++;
    }
  }

  await updateLastSync(terraUserId);
  return created;
}

async function handleActivityData(
  terraUserId: string,
  data: TerraActivityData[],
  provider: string
): Promise<number> {
  const patient = await resolvePatient(terraUserId);
  if (!patient) return 0;

  const logs = mapActivityToExerciseLogs(data, provider);
  if (!logs.length) return 0;

  let created = 0;
  for (const log of logs) {
    const existing = await prisma.patientExerciseLog.findFirst({
      where: {
        patientId: patient.patientId,
        source: 'device',
        recordedAt: log.recordedAt,
        activityType: log.activityType,
      },
    });

    if (existing) {
      await prisma.patientExerciseLog.update({
        where: { id: existing.id },
        data: {
          duration: log.duration,
          intensity: log.intensity,
          calories: log.calories,
          steps: log.steps,
          distance: log.distance,
          heartRateAvg: log.heartRateAvg,
        },
      });
    } else {
      await prisma.patientExerciseLog.create({
        data: {
          patientId: patient.patientId,
          clinicId: patient.clinicId,
          ...log,
        },
      });
      created++;
    }
  }

  await updateLastSync(terraUserId);
  return created;
}

async function handleSleepData(
  terraUserId: string,
  data: TerraSleepData[],
  provider: string
): Promise<number> {
  const patient = await resolvePatient(terraUserId);
  if (!patient) return 0;

  const logs = mapSleepToSleepLogs(data, provider);
  if (!logs.length) return 0;

  let created = 0;
  for (const log of logs) {
    const existing = await prisma.patientSleepLog.findFirst({
      where: {
        patientId: patient.patientId,
        source: 'device',
        sleepStart: log.sleepStart,
      },
    });

    if (existing) {
      await prisma.patientSleepLog.update({
        where: { id: existing.id },
        data: {
          sleepEnd: log.sleepEnd,
          duration: log.duration,
          quality: log.quality,
          deepSleep: log.deepSleep,
          remSleep: log.remSleep,
          lightSleep: log.lightSleep,
          awakeTime: log.awakeTime,
        },
      });
    } else {
      await prisma.patientSleepLog.create({
        data: {
          patientId: patient.patientId,
          clinicId: patient.clinicId,
          ...log,
        },
      });
      created++;
    }
  }

  await updateLastSync(terraUserId);
  return created;
}

async function handleNutritionData(
  terraUserId: string,
  data: TerraNutritionData[],
  provider: string
): Promise<number> {
  const patient = await resolvePatient(terraUserId);
  if (!patient) return 0;

  const logs = mapNutritionToNutritionLogs(data, provider);
  if (!logs.length) return 0;

  let created = 0;
  for (const log of logs) {
    const existing = await prisma.patientNutritionLog.findFirst({
      where: {
        patientId: patient.patientId,
        source: 'device',
        recordedAt: log.recordedAt,
        mealType: log.mealType,
      },
    });

    if (existing) {
      await prisma.patientNutritionLog.update({
        where: { id: existing.id },
        data: {
          calories: log.calories,
          protein: log.protein,
          carbs: log.carbs,
          fat: log.fat,
          fiber: log.fiber,
          sugar: log.sugar,
          sodium: log.sodium,
        },
      });
    } else {
      await prisma.patientNutritionLog.create({
        data: {
          patientId: patient.patientId,
          clinicId: patient.clinicId,
          ...log,
        },
      });
      created++;
    }
  }

  await updateLastSync(terraUserId);
  return created;
}

async function handleDailyData(
  terraUserId: string,
  data: TerraDailyData[],
  provider: string
): Promise<number> {
  const patient = await resolvePatient(terraUserId);
  if (!patient) return 0;

  const logs = mapDailyToExerciseLogs(data, provider);
  if (!logs.length) return 0;

  let created = 0;
  for (const log of logs) {
    const existing = await prisma.patientExerciseLog.findFirst({
      where: {
        patientId: patient.patientId,
        source: 'device',
        recordedAt: log.recordedAt,
        activityType: 'daily_summary',
      },
    });

    if (existing) {
      await prisma.patientExerciseLog.update({
        where: { id: existing.id },
        data: {
          calories: log.calories,
          steps: log.steps,
          distance: log.distance,
          heartRateAvg: log.heartRateAvg,
        },
      });
    } else {
      await prisma.patientExerciseLog.create({
        data: {
          patientId: patient.patientId,
          clinicId: patient.clinicId,
          ...log,
        },
      });
      created++;
    }
  }

  await updateLastSync(terraUserId);
  return created;
}

// ---- Main POST handler ----

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Verify HMAC signature
  const signature = req.headers.get('terra-signature');
  if (signature) {
    if (!verifyTerraSignature(rawBody, signature)) {
      logger.error('Terra webhook signature verification failed', { requestId });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  } else if (process.env.TERRA_WEBHOOK_SECRET) {
    logger.error('Terra webhook missing signature header', { requestId });
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
  }

  let payload: TerraWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { type } = payload;

  logger.info('Terra webhook received', {
    requestId,
    type,
    terraUserId: payload.user?.user_id,
    provider: payload.user?.provider,
  });

  try {
    switch (type) {
      case 'auth':
        await handleAuth(payload);
        break;

      case 'deauth':
      case 'access_revoked':
        await handleDeauth(payload);
        break;

      case 'user_reauth':
        await handleUserReauth(payload);
        break;

      case 'body': {
        const data = (payload.data || []) as TerraBodyData[];
        const count = await handleBodyData(
          payload.user?.user_id || '',
          data,
          payload.user?.provider || 'UNKNOWN'
        );
        logger.info('Terra body data processed', { requestId, count });
        break;
      }

      case 'activity': {
        const data = (payload.data || []) as TerraActivityData[];
        const count = await handleActivityData(
          payload.user?.user_id || '',
          data,
          payload.user?.provider || 'UNKNOWN'
        );
        logger.info('Terra activity data processed', { requestId, count });
        break;
      }

      case 'sleep': {
        const data = (payload.data || []) as TerraSleepData[];
        const count = await handleSleepData(
          payload.user?.user_id || '',
          data,
          payload.user?.provider || 'UNKNOWN'
        );
        logger.info('Terra sleep data processed', { requestId, count });
        break;
      }

      case 'nutrition': {
        const data = (payload.data || []) as TerraNutritionData[];
        const count = await handleNutritionData(
          payload.user?.user_id || '',
          data,
          payload.user?.provider || 'UNKNOWN'
        );
        logger.info('Terra nutrition data processed', { requestId, count });
        break;
      }

      case 'daily': {
        const data = (payload.data || []) as TerraDailyData[];
        const count = await handleDailyData(
          payload.user?.user_id || '',
          data,
          payload.user?.provider || 'UNKNOWN'
        );
        logger.info('Terra daily data processed', { requestId, count });
        break;
      }

      case 'healthcheck':
        logger.info('Terra healthcheck received', { requestId });
        break;

      case 'connection_error':
        logger.warn('Terra connection error for user', {
          requestId,
          terraUserId: payload.user?.user_id,
        });
        break;

      default:
        logger.info('Terra webhook unhandled type', { requestId, type });
    }

    logger.info('Terra webhook processed', {
      requestId,
      type,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json({ received: true, status: 'processed' });
  } catch (error) {
    logger.error('Terra webhook processing failed', {
      requestId,
      type,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json(
      { error: 'Processing failed' },
      { status: 500 }
    );
  }
}
