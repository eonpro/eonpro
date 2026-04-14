import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, type AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { generateVialLabelSheetPdf, VIAL_LABEL_SHEET_MAX } from '@/lib/labels/vialLabelPdf';

const bodySchema = z.object({
  productId: z.number().int().positive(),
  batchNumber: z
    .string()
    .trim()
    .min(4)
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, 'Batch number must be alphanumeric (dashes allowed).'),
  budIsoDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date format.'),
  quantity: z.number().int().min(1).max(VIAL_LABEL_SHEET_MAX),
  proofMode: z.boolean().optional().default(false),
  yearColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .default('#137bc1'),
});

async function postHandler(req: NextRequest, _user: AuthUser): Promise<Response> {
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid label request payload.',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const pdf = await generateVialLabelSheetPdf(parsed.data);
    const batch = parsed.data.batchNumber.toUpperCase();
    const suffix = parsed.data.proofMode ? '-proof' : '';

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="logosrx-vial-labels-${batch}${suffix}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    return handleApiError(error, { context: { route: 'POST /api/admin/vial-labels/pdf' } });
  }
}

export const POST = withAuth(postHandler, {
  roles: ['super_admin', 'admin', 'staff', 'pharmacy_rep', 'provider', 'support'],
});
