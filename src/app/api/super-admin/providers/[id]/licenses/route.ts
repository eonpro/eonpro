import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

function withSuperAdminAuth(
  handler: (
    req: NextRequest,
    user: AuthUser,
    context: { params: Promise<{ id: string }> }
  ) => Promise<Response>
) {
  return withAuth(
    (req: NextRequest, user: AuthUser, context?: { params: Promise<{ id: string }> }) =>
      handler(req, user, context!),
    { roles: ['super_admin'] }
  );
}

/**
 * GET /api/super-admin/providers/[id]/licenses
 * List all licenses for a provider
 */
export const GET = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, context: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await context.params;
      const providerId = parseInt(id);
      if (isNaN(providerId)) {
        return NextResponse.json({ error: 'Invalid provider ID' }, { status: 400 });
      }

      const licenses = await prisma.providerLicense.findMany({
        where: { providerId },
        orderBy: { state: 'asc' },
      });

      return NextResponse.json({ licenses });
    } catch (error: unknown) {
      logger.error('[SUPER-ADMIN/PROVIDERS/LICENSES] Error fetching licenses', { error });
      return NextResponse.json(
        { error: 'Failed to fetch licenses' },
        { status: 500 }
      );
    }
  }
);

/**
 * PUT /api/super-admin/providers/[id]/licenses
 * Replace all licenses for the provider. Body: { licenses: Array<{ state, licenseNumber, expiresAt, issuedAt? }> }
 */
export const PUT = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, context: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await context.params;
      const providerId = parseInt(id);
      if (isNaN(providerId)) {
        return NextResponse.json({ error: 'Invalid provider ID' }, { status: 400 });
      }

      const body = await req.json();
      const raw = Array.isArray(body.licenses) ? body.licenses : [];

      const licenses = raw.map((l: unknown) => {
        if (l && typeof l === 'object' && 'state' in l && 'licenseNumber' in l && 'expiresAt' in l) {
          const state = String((l as { state: unknown }).state).trim().toUpperCase().slice(0, 2);
          const licenseNumber = String((l as { licenseNumber: unknown }).licenseNumber).trim();
          const expiresAt = (l as { expiresAt: unknown }).expiresAt;
          const issuedAt = (l as { issuedAt?: unknown }).issuedAt;
          if (!state || !licenseNumber) return null;
          const expiresDate =
            typeof expiresAt === 'string'
              ? new Date(expiresAt)
              : typeof expiresAt === 'number'
                ? new Date(expiresAt)
                : null;
          const issuedDate =
            issuedAt == null
              ? undefined
              : typeof issuedAt === 'string'
                ? new Date(issuedAt)
                : typeof issuedAt === 'number'
                  ? new Date(issuedAt)
                  : undefined;
          if (!expiresDate || isNaN(expiresDate.getTime())) return null;
          return { state, licenseNumber, expiresAt: expiresDate, issuedAt: issuedDate };
        }
        return null;
      }).filter(Boolean) as Array<{ state: string; licenseNumber: string; expiresAt: Date; issuedAt?: Date }>;

      const existing = await prisma.provider.findUnique({
        where: { id: providerId },
        select: { id: true },
      });
      if (!existing) {
        return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
      }

      await prisma.$transaction(async (tx) => {
        await tx.providerLicense.deleteMany({ where: { providerId } });
        if (licenses.length > 0) {
          await tx.providerLicense.createMany({
            data: licenses.map((l) => ({
              providerId,
              state: l.state,
              licenseNumber: l.licenseNumber,
              expiresAt: l.expiresAt,
              issuedAt: l.issuedAt ?? null,
            })),
          });
        }
      });

      const updated = await prisma.providerLicense.findMany({
        where: { providerId },
        orderBy: { state: 'asc' },
      });

      logger.info('[SUPER-ADMIN/PROVIDERS/LICENSES] Licenses updated', {
        providerId,
        count: updated.length,
        userEmail: user.email,
      });

      return NextResponse.json({ licenses: updated });
    } catch (error: unknown) {
      logger.error('[SUPER-ADMIN/PROVIDERS/LICENSES] Error updating licenses', { error });
      return NextResponse.json(
        { error: 'Failed to update licenses' },
        { status: 500 }
      );
    }
  }
);
