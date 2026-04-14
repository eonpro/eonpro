import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { basePrisma as prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

type PharmacyStaffRow = {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role?: string;
  status: string;
  clinicId: number | null;
  createdAt: Date;
  lastLogin: Date | null;
  clinic: {
    id: number;
    name: string;
    subdomain: string | null;
  } | null;
  userClinics: Array<{
    clinicId: number;
    isPrimary: boolean;
    isActive: boolean;
    clinic: {
      id: number;
      name: string;
      subdomain: string | null;
    };
  }>;
};

function withSuperAdminAuth(handler: (req: NextRequest, user: AuthUser) => Promise<Response>) {
  return withAuth(handler, { roles: ['super_admin'] });
}

export const GET = withSuperAdminAuth(async (_req: NextRequest) => {
  try {
    const [staff, clinics] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          clinicId: true,
          createdAt: true,
          lastLogin: true,
          clinic: {
            select: {
              id: true,
              name: true,
              subdomain: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
      }),
      prisma.clinic.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          subdomain: true,
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    const pharmacyStaff = (staff as PharmacyStaffRow[]).filter(
      (row) => String(row.role || '').toUpperCase() === 'PHARMACY_REP'
    );
    const staffIds = pharmacyStaff.map((row) => row.id);
    let assignmentsByUser = new Map<number, PharmacyStaffRow['userClinics']>();
    if (staffIds.length > 0) {
      try {
        const assignments = await prisma.userClinic.findMany({
          where: {
            userId: { in: staffIds },
          },
          select: {
            userId: true,
            clinicId: true,
            role: true,
            isPrimary: true,
            isActive: true,
            clinic: {
              select: {
                id: true,
                name: true,
                subdomain: true,
              },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        });

        assignmentsByUser = assignments.reduce((acc, item) => {
          if (String(item.role || '').toUpperCase() !== 'PHARMACY_REP') return acc;
          if (item.isActive === false) return acc;
          const existing = acc.get(item.userId) || [];
          existing.push({
            clinicId: item.clinicId,
            isPrimary: item.isPrimary,
            isActive: item.isActive,
            clinic: item.clinic,
          });
          acc.set(item.userId, existing);
          return acc;
        }, new Map<number, PharmacyStaffRow['userClinics']>());
      } catch (error) {
        logger.warn(
          '[SUPER-ADMIN-PHARMACY-STAFF][GET] Modern UserClinic lookup failed, falling back to legacy query',
          {
            error: error instanceof Error ? error.message : String(error),
          }
        );

        try {
          const legacyAssignments = await prisma.userClinic.findMany({
            where: {
              userId: { in: staffIds },
            },
            select: {
              userId: true,
              clinicId: true,
              isPrimary: true,
              clinic: {
                select: {
                  id: true,
                  name: true,
                  subdomain: true,
                },
              },
            },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          });

          assignmentsByUser = legacyAssignments.reduce((acc, item) => {
            const existing = acc.get(item.userId) || [];
            existing.push({
              clinicId: item.clinicId,
              isPrimary: item.isPrimary,
              isActive: true,
              clinic: item.clinic,
            });
            acc.set(item.userId, existing);
            return acc;
          }, new Map<number, PharmacyStaffRow['userClinics']>());
        } catch (legacyError) {
          logger.warn(
            '[SUPER-ADMIN-PHARMACY-STAFF][GET] Legacy UserClinic lookup also failed, returning without clinic assignments',
            {
              error: legacyError instanceof Error ? legacyError.message : String(legacyError),
            }
          );
        }
      }
    }

    const formatted = pharmacyStaff.map((row) => {
      const clinicsForUser = assignmentsByUser.get(row.id) || [];
      return {
        id: row.id,
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        status: row.status,
        clinicId: row.clinicId,
        createdAt: row.createdAt,
        lastLogin: row.lastLogin,
        primaryClinic: clinicsForUser.find((uc) => uc.isPrimary)?.clinic ?? row.clinic,
        clinics: clinicsForUser.map((uc) => ({
          clinicId: uc.clinicId,
          isPrimary: uc.isPrimary,
          isActive: uc.isActive,
          clinic: uc.clinic,
        })),
      };
    });

    return NextResponse.json({ staff: formatted, clinics });
  } catch (error) {
    logger.error('[SUPER-ADMIN-PHARMACY-STAFF][GET] Failed to fetch pharmacy staff', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to fetch pharmacy staff' }, { status: 500 });
  }
});

export const POST = withSuperAdminAuth(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const email = String(body?.email || '')
      .trim()
      .toLowerCase();
    const firstName = String(body?.firstName || '').trim();
    const lastName = String(body?.lastName || '').trim();
    const password = String(body?.password || '');
    const clinicIdsRaw = Array.isArray(body?.clinicIds) ? body.clinicIds : [];
    const clinicIds: number[] = Array.from(
      new Set(
        clinicIdsRaw
          .map((value: unknown) => Number(value))
          .filter((value: number): value is number => Number.isFinite(value) && value > 0)
      )
    );

    if (!email || !firstName || !lastName || !password) {
      return NextResponse.json(
        { error: 'Email, first name, last name, and password are required' },
        { status: 400 }
      );
    }

    if (clinicIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one clinic must be assigned for pharmacy staff' },
        { status: 400 }
      );
    }

    const clinics = await prisma.clinic.findMany({
      where: {
        id: { in: clinicIds },
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (clinics.length !== clinicIds.length) {
      return NextResponse.json(
        { error: 'One or more selected clinics are invalid' },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const primaryClinicId = clinicIds[0] as number;

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true },
    });

    if (existingUser) {
      if (existingUser.role !== 'PHARMACY_REP') {
        return NextResponse.json(
          { error: 'A user with this email already exists with a different role' },
          { status: 409 }
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: existingUser.id },
          data: {
            clinicId: primaryClinicId,
            firstName,
            lastName,
          },
        });

        try {
          for (const clinicId of clinicIds) {
            await tx.userClinic.upsert({
              where: {
                userId_clinicId: {
                  userId: existingUser.id,
                  clinicId,
                },
              },
              update: {
                role: 'PHARMACY_REP',
                isActive: true,
                isPrimary: clinicId === primaryClinicId,
              },
              create: {
                userId: existingUser.id,
                clinicId,
                role: 'PHARMACY_REP',
                isActive: true,
                isPrimary: clinicId === primaryClinicId,
              },
            });
          }

          await tx.userClinic.updateMany({
            where: {
              userId: existingUser.id,
              clinicId: { notIn: clinicIds },
              role: 'PHARMACY_REP',
            },
            data: { isActive: false, isPrimary: false },
          });
        } catch (error) {
          logger.warn(
            '[SUPER-ADMIN-PHARMACY-STAFF][POST] UserClinic update failed for existing user, kept primary clinicId only',
            {
              userId: existingUser.id,
              error: error instanceof Error ? error.message : String(error),
            }
          );
        }
      });

      return NextResponse.json({
        message: 'Existing pharmacy staff updated successfully',
        userId: existingUser.id,
      });
    }

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          firstName,
          lastName,
          role: 'PHARMACY_REP',
          passwordHash,
          clinicId: primaryClinicId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      try {
        await tx.userClinic.createMany({
          data: clinicIds.map((clinicId: number) => ({
            userId: user.id,
            clinicId,
            role: 'PHARMACY_REP' as const,
            isActive: true,
            isPrimary: clinicId === primaryClinicId,
          })),
        });
      } catch (error) {
        logger.warn(
          '[SUPER-ADMIN-PHARMACY-STAFF][POST] UserClinic create failed for new user, kept primary clinicId only',
          {
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }

      return user;
    });

    return NextResponse.json({
      message: 'Pharmacy staff created successfully',
      userId: created.id,
    });
  } catch (error) {
    logger.error('[SUPER-ADMIN-PHARMACY-STAFF][POST] Failed to create pharmacy staff', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to create pharmacy staff' }, { status: 500 });
  }
});
