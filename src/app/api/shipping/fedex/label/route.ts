import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logPHIAccess } from '@/lib/audit/hipaa-audit';
import { handleApiError } from '@/domains/shared/errors';
import { resolveCredentials, createShipment, cancelShipment } from '@/lib/fedex';
import { FEDEX_SERVICE_TYPES } from '@/lib/fedex-services';
import { encryptPHI, isEncrypted } from '@/lib/security/phi-encryption';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const addressSchema = z.object({
  personName: z.string().min(1),
  companyName: z.string().optional(),
  phoneNumber: z.string().min(1),
  address1: z.string().min(1),
  address2: z.string().nullable().optional(),
  city: z.string().min(1),
  state: z.string().min(1).max(2),
  zip: z.string().min(1),
  countryCode: z.string().optional(),
  residential: z.boolean().optional(),
});

const createLabelSchema = z.object({
  patientId: z.number().int().positive(),
  origin: addressSchema,
  destination: addressSchema,
  serviceType: z.string().min(1),
  packagingType: z.string().default('YOUR_PACKAGING'),
  weightLbs: z.number().positive().default(1),
  length: z.number().positive().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

function encryptAddressJson(addr: Record<string, unknown>): Record<string, unknown> {
  const encrypted = { ...addr };
  for (const key of ['personName', 'phoneNumber', 'address1', 'address2', 'city', 'state', 'zip']) {
    const val = encrypted[key];
    if (typeof val === 'string' && val.length > 0 && !isEncrypted(val)) {
      encrypted[key] = encryptPHI(val);
    }
  }
  return encrypted;
}

// ---------------------------------------------------------------------------
// POST — Generate a FedEx shipping label
// ---------------------------------------------------------------------------

async function handleCreateLabel(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const parsed = createLabelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { patientId, origin, destination, serviceType, packagingType, weightLbs, length, width, height } = parsed.data;

    const validService = FEDEX_SERVICE_TYPES.find((s) => s.code === serviceType);
    if (!validService) {
      return NextResponse.json({ error: `Invalid service type: ${serviceType}` }, { status: 400 });
    }

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, clinicId: true },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && patient.clinicId !== user.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const clinicId = patient.clinicId;

    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        fedexClientId: true,
        fedexClientSecret: true,
        fedexAccountNumber: true,
        fedexEnabled: true,
      },
    });

    let credentials;
    try {
      credentials = resolveCredentials(clinic ?? undefined);
    } catch {
      return NextResponse.json(
        { error: 'FedEx credentials not configured. Contact your administrator.' },
        { status: 422 },
      );
    }

    const result = await createShipment(credentials, {
      serviceType,
      packagingType,
      shipper: origin,
      recipient: destination,
      packages: [{ weightLbs, length, width, height }],
    });

    const label = await prisma.shipmentLabel.create({
      data: {
        clinicId,
        patientId,
        userId: user.id,
        trackingNumber: result.trackingNumber,
        shipmentId: result.shipmentId,
        serviceType: result.serviceType,
        originAddress: encryptAddressJson(origin as Record<string, unknown>) as any,
        destinationAddress: encryptAddressJson(destination as Record<string, unknown>) as any,
        weightLbs,
        length: length ?? null,
        width: width ?? null,
        height: height ?? null,
      },
    });

    await logPHIAccess(req, user, 'ShipmentLabel', label.id, patientId, {
      action: 'fedex_label_created',
      trackingNumber: result.trackingNumber,
      serviceType,
    }).catch((err: unknown) => {
      logger.error('HIPAA audit log failed', {
        error: err instanceof Error ? err.message : 'Unknown',
        labelId: label.id,
      });
    });

    logger.info('FedEx label created', {
      labelId: label.id,
      patientId,
      clinicId,
      trackingNumber: result.trackingNumber,
      serviceType,
    });

    return NextResponse.json({
      id: label.id,
      trackingNumber: result.trackingNumber,
      serviceType: result.serviceType,
      labelPdf: result.labelPdfBase64,
    });
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/shipping/fedex/label' });
  }
}

export const POST = withAuth(handleCreateLabel, {
  roles: ['super_admin', 'admin'],
});

// ---------------------------------------------------------------------------
// DELETE — Void a FedEx shipping label
// ---------------------------------------------------------------------------

async function handleVoidLabel(req: NextRequest, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const labelId = searchParams.get('id');

    if (!labelId) {
      return NextResponse.json({ error: 'Missing label id' }, { status: 400 });
    }

    const id = parseInt(labelId, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid label id' }, { status: 400 });
    }

    const label = await prisma.shipmentLabel.findUnique({
      where: { id },
    });

    if (!label) {
      return NextResponse.json({ error: 'Label not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && label.clinicId !== user.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (label.status === 'VOIDED') {
      return NextResponse.json({ error: 'Label already voided' }, { status: 400 });
    }

    const clinic = await prisma.clinic.findUnique({
      where: { id: label.clinicId },
      select: {
        fedexClientId: true,
        fedexClientSecret: true,
        fedexAccountNumber: true,
        fedexEnabled: true,
      },
    });

    let credentials;
    try {
      credentials = resolveCredentials(clinic ?? undefined);
    } catch {
      return NextResponse.json(
        { error: 'FedEx credentials not configured' },
        { status: 422 },
      );
    }

    await cancelShipment(credentials, label.trackingNumber);

    await prisma.shipmentLabel.update({
      where: { id: label.id },
      data: {
        status: 'VOIDED',
        voidedAt: new Date(),
        voidedBy: user.id,
      },
    });

    logger.info('FedEx label voided', {
      labelId: label.id,
      clinicId: label.clinicId,
      trackingNumber: label.trackingNumber,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { route: 'DELETE /api/shipping/fedex/label' });
  }
}

export const DELETE = withAuth(handleVoidLabel, {
  roles: ['super_admin', 'admin'],
});
