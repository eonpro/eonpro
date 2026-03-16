/**
 * Employee Salary Management
 *
 * GET  — List all employee salaries for the clinic (or all clinics for super_admin)
 * POST — Create/set a weekly salary for an employee (STAFF or SALES_REP)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, withoutClinicFilter, runWithClinicContext } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const createSchema = z.object({
  userId: z.number().positive(),
  clinicId: z.number().positive().optional(),
  weeklyBasePayCents: z.number().int().min(0),
  hourlyRateCents: z.number().int().min(0).nullable().optional(),
  effectiveFrom: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});

export const GET = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      const p = req.nextUrl.searchParams;
      const clinicIdParam = p.get('clinicId');

      const effectiveClinicId =
        user.role === 'super_admin'
          ? clinicIdParam ? parseInt(clinicIdParam, 10) : null
          : user.clinicId;

      const where: Record<string, any> = { isActive: true };
      if (effectiveClinicId) where.clinicId = effectiveClinicId;

      const fetcher = async () =>
        prisma.employeeSalary.findMany({
          where,
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, role: true },
            },
            clinic: { select: { id: true, name: true } },
          },
          orderBy: [{ clinicId: 'asc' }, { createdAt: 'desc' }],
        });

      const salaries = user.role === 'super_admin'
        ? await withoutClinicFilter(fetcher)
        : effectiveClinicId
          ? await runWithClinicContext(effectiveClinicId, fetcher)
          : [];

      return NextResponse.json({
        salaries: salaries.map((s) => ({
          id: s.id,
          clinicId: s.clinicId,
          clinicName: s.clinic?.name || '',
          userId: s.userId,
          userName: `${s.user?.firstName || ''} ${s.user?.lastName || ''}`.trim() || s.user?.email || '',
          userEmail: s.user?.email || '',
          userRole: s.user?.role || '',
          weeklyBasePayCents: s.weeklyBasePayCents,
          hourlyRateCents: s.hourlyRateCents,
          effectiveFrom: s.effectiveFrom,
          effectiveTo: s.effectiveTo,
          isActive: s.isActive,
          notes: s.notes,
        })),
      });
    } catch (error) {
      logger.error('[EmployeeSalaries GET]', { error: error instanceof Error ? error.message : 'Unknown' });
      return NextResponse.json({ error: 'Failed to list salaries' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);

export const POST = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      const body = await req.json();
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
      }

      const { userId, weeklyBasePayCents, hourlyRateCents, effectiveFrom, notes } = parsed.data;

      const effectiveClinicId =
        user.role === 'super_admin' && parsed.data.clinicId
          ? parsed.data.clinicId
          : user.clinicId;

      if (!effectiveClinicId) {
        return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });
      }

      const verifyAndCreate = async () => {
        // Sales reps may not have User.clinicId set — they can be associated
        // with clinics only through SalesRepPlanAssignment. For super_admin,
        // verify user exists with the right role; for admin, also check clinicId.
        const targetUser = await prisma.user.findFirst({
          where: {
            id: userId,
            role: { in: ['STAFF', 'SALES_REP'] },
            ...(user.role === 'super_admin' ? {} : { clinicId: effectiveClinicId }),
          },
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        });

        if (!targetUser) {
          return NextResponse.json(
            { error: 'User not found or not a STAFF/SALES_REP' },
            { status: 404 }
          );
        }

        await prisma.employeeSalary.updateMany({
          where: { clinicId: effectiveClinicId, userId, isActive: true },
          data: { isActive: false, effectiveTo: new Date() },
        });

        const salary = await prisma.employeeSalary.create({
          data: {
            clinicId: effectiveClinicId,
            userId,
            weeklyBasePayCents,
            hourlyRateCents: hourlyRateCents ?? null,
            effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
            notes: notes || null,
          },
        });

        logger.info('[EmployeeSalaries] Created', {
          salaryId: salary.id,
          userId,
          clinicId: effectiveClinicId,
          weeklyBasePayCents,
          createdBy: user.id,
        });

        return NextResponse.json({
          success: true,
          salary: {
            id: salary.id,
            clinicId: salary.clinicId,
            userId: salary.userId,
            userName: `${targetUser.firstName || ''} ${targetUser.lastName || ''}`.trim() || targetUser.email,
            userEmail: targetUser.email,
            userRole: targetUser.role,
            weeklyBasePayCents: salary.weeklyBasePayCents,
            hourlyRateCents: salary.hourlyRateCents,
            effectiveFrom: salary.effectiveFrom,
            isActive: salary.isActive,
            notes: salary.notes,
          },
        });
      };

      return user.role === 'super_admin'
        ? await withoutClinicFilter(verifyAndCreate)
        : await runWithClinicContext(effectiveClinicId, verifyAndCreate);
    } catch (error) {
      logger.error('[EmployeeSalaries POST]', { error: error instanceof Error ? error.message : 'Unknown' });
      return NextResponse.json({ error: 'Failed to create salary' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);
