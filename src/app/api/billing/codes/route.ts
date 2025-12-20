/**
 * Billing Codes API
 * 
 * Search and manage CPT and ICD-10 codes
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withAdminAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { searchBillingCodes, COMMON_CPT_CODES, COMMON_ICD10_CODES } from '@/lib/billing/superbill.service';
import { prisma } from '@/lib/db';

const createCodeSchema = z.object({
  clinicId: z.number().optional(),
  codeType: z.enum(['CPT', 'ICD10']),
  code: z.string().min(3).max(10),
  description: z.string().min(3).max(500),
  defaultPrice: z.number().optional(),
  category: z.string().optional(),
});

/**
 * GET /api/billing/codes
 * Search billing codes
 */
export const GET = withAuth(
  async (req: NextRequest, user) => {
    try {
      const searchParams = req.nextUrl.searchParams;
      const query = searchParams.get('query') || '';
      const codeType = searchParams.get('codeType') as 'CPT' | 'ICD10' | null;
      const clinicId = searchParams.get('clinicId');
      const common = searchParams.get('common');

      // If requesting common codes only
      if (common === 'true') {
        const codes = codeType === 'CPT' ? COMMON_CPT_CODES : 
                      codeType === 'ICD10' ? COMMON_ICD10_CODES :
                      [...COMMON_CPT_CODES, ...COMMON_ICD10_CODES];
        return NextResponse.json({ codes });
      }

      if (!codeType) {
        return NextResponse.json(
          { error: 'codeType is required (CPT or ICD10)' },
          { status: 400 }
        );
      }

      if (query.length < 2) {
        return NextResponse.json(
          { error: 'query must be at least 2 characters' },
          { status: 400 }
        );
      }

      const codes = await searchBillingCodes(
        query,
        codeType,
        clinicId ? parseInt(clinicId) : undefined
      );

      return NextResponse.json({ codes });
    } catch (error) {
      logger.error('Failed to search billing codes', { error });
      return NextResponse.json(
        { error: 'Failed to search billing codes' },
        { status: 500 }
      );
    }
  }
);

/**
 * POST /api/billing/codes
 * Add a custom billing code for a clinic
 */
export const POST = withAdminAuth(
  async (req: NextRequest, user) => {
    try {
      const body = await req.json();
      const parsed = createCodeSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request data', details: parsed.error.issues },
          { status: 400 }
        );
      }

      const billingCode = await prisma.billingCode.create({
        data: {
          clinicId: parsed.data.clinicId,
          codeType: parsed.data.codeType,
          code: parsed.data.code,
          description: parsed.data.description,
          defaultPrice: parsed.data.defaultPrice,
          category: parsed.data.category,
          isActive: true,
        },
      });

      return NextResponse.json({ billingCode }, { status: 201 });
    } catch (error: any) {
      if (error.code === 'P2002') {
        return NextResponse.json(
          { error: 'This code already exists' },
          { status: 409 }
        );
      }
      logger.error('Failed to create billing code', { error });
      return NextResponse.json(
        { error: 'Failed to create billing code' },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/billing/codes
 * Deactivate a custom billing code
 */
export const DELETE = withAdminAuth(
  async (req: NextRequest, user) => {
    try {
      const searchParams = req.nextUrl.searchParams;
      const codeId = searchParams.get('codeId');

      if (!codeId) {
        return NextResponse.json(
          { error: 'codeId is required' },
          { status: 400 }
        );
      }

      await prisma.billingCode.update({
        where: { id: parseInt(codeId) },
        data: { isActive: false },
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      logger.error('Failed to delete billing code', { error });
      return NextResponse.json(
        { error: 'Failed to delete billing code' },
        { status: 500 }
      );
    }
  }
);
