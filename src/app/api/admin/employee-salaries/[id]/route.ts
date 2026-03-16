/**
 * Individual Employee Salary Management
 *
 * PATCH  — Update weekly salary amount or notes
 * DELETE — Deactivate (soft-delete) an employee salary
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, withoutClinicFilter, runWithClinicContext } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { z } from 'zod';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const patchSchema = z.object({
  weeklyBasePayCents: z.number().int().min(0).optional(),
  hourlyRateCents: z.number().int().min(0).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

async function findSalary(id: number, user: AuthUser) {
  const { basePrisma } = await import('@/lib/db');
  const salary = await basePrisma.employeeSalary.findUnique({
    where: { id },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
  });
  if (!salary) return null;
  if (user.role !== 'super_admin' && salary.clinicId !== user.clinicId) return null;
  return salary;
}

export const PATCH = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id } = await context!.params;
      const salaryId = parseInt(id, 10);
      if (isNaN(salaryId)) {
        return NextResponse.json({ error: 'Invalid salary ID' }, { status: 400 });
      }

      const existing = await findSalary(salaryId, user);
      if (!existing) {
        return NextResponse.json({ error: 'Salary record not found' }, { status: 404 });
      }

      const body = await req.json();
      const parsed = patchSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
      }

      const data: Record<string, any> = {};
      if (parsed.data.weeklyBasePayCents !== undefined) data.weeklyBasePayCents = parsed.data.weeklyBasePayCents;
      if (parsed.data.hourlyRateCents !== undefined) data.hourlyRateCents = parsed.data.hourlyRateCents;
      if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;

      if (Object.keys(data).length === 0) {
        return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
      }

      const updater = async () =>
        prisma.employeeSalary.update({
          where: { id: salaryId },
          data,
        });

      const updated = user.role === 'super_admin'
        ? await withoutClinicFilter(updater)
        : await runWithClinicContext(existing.clinicId, updater);

      logger.info('[EmployeeSalaries] Updated', {
        salaryId,
        userId: existing.userId,
        clinicId: existing.clinicId,
        updatedBy: user.id,
        changes: data,
      });

      return NextResponse.json({
        success: true,
        salary: {
          id: updated.id,
          clinicId: updated.clinicId,
          userId: updated.userId,
          userName: `${existing.user?.firstName || ''} ${existing.user?.lastName || ''}`.trim() || existing.user?.email,
          userEmail: existing.user?.email,
          userRole: existing.user?.role,
          weeklyBasePayCents: updated.weeklyBasePayCents,
          hourlyRateCents: updated.hourlyRateCents,
          effectiveFrom: updated.effectiveFrom,
          isActive: updated.isActive,
          notes: updated.notes,
        },
      });
    } catch (error) {
      logger.error('[EmployeeSalaries PATCH]', { error: error instanceof Error ? error.message : 'Unknown' });
      return NextResponse.json({ error: 'Failed to update salary' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);

export const DELETE = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id } = await context!.params;
      const salaryId = parseInt(id, 10);
      if (isNaN(salaryId)) {
        return NextResponse.json({ error: 'Invalid salary ID' }, { status: 400 });
      }

      const existing = await findSalary(salaryId, user);
      if (!existing) {
        return NextResponse.json({ error: 'Salary record not found' }, { status: 404 });
      }

      const deactivator = async () =>
        prisma.employeeSalary.update({
          where: { id: salaryId },
          data: { isActive: false, effectiveTo: new Date() },
        });

      user.role === 'super_admin'
        ? await withoutClinicFilter(deactivator)
        : await runWithClinicContext(existing.clinicId, deactivator);

      logger.info('[EmployeeSalaries] Deactivated', {
        salaryId,
        userId: existing.userId,
        clinicId: existing.clinicId,
        deactivatedBy: user.id,
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      logger.error('[EmployeeSalaries DELETE]', { error: error instanceof Error ? error.message : 'Unknown' });
      return NextResponse.json({ error: 'Failed to remove salary' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);
