import { NextResponse } from 'next/server';
import { PatientDocumentCategory } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const intakes = await prisma.patientDocument.findMany({
      where: { category: PatientDocumentCategory.MEDICAL_INTAKE_FORM },
      include: {
        patient: {
          select: {
            id: true,
            patientId: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            tags: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return NextResponse.json({ intakes });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Error fetching intakes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch intakes' },
      { status: 500 }
    );
  }
}