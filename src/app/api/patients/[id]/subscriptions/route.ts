import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const patientId = parseInt(resolvedParams.id);
    
    if (isNaN(patientId)) {
      return NextResponse.json(
        { error: 'Invalid patient ID' },
        { status: 400 }
      );
    }
    
    const subscriptions = await prisma.subscription.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' }
    });
    
    // Transform the data to match the component's expected format
    const formattedSubscriptions = subscriptions.map((sub: any) => ({
      id: sub.id,
      planName: sub.planName || 'Unknown Plan',
      planDescription: sub.planDescription || '',
      status: sub.status,
      amount: sub.amount,
      interval: sub.interval || 'month',
      intervalCount: sub.intervalCount || 1,
      startDate: sub.startDate.toISOString(),
      currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
      nextBillingDate: sub.nextBillingDate?.toISOString() || null,
      canceledAt: sub.canceledAt?.toISOString() || null,
      pausedAt: sub.pausedAt?.toISOString() || null,
      resumeAt: sub.resumeAt?.toISOString() || null,
    }));
    
    return NextResponse.json(formattedSubscriptions);
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Detailed error fetching subscriptions:', error);
    logger.error('Error stack:', { value: error.stack });
    return NextResponse.json(
      { error: `Failed to fetch subscriptions: ${errorMessage}` },
      { status: 500 }
    );
  }
}
