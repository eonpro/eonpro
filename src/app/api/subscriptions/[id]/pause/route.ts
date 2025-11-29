import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { SubscriptionStatus } from '@prisma/client';
import { logger } from '@/lib/logger';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const subscriptionId = parseInt(resolvedParams.id);
    
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId }
    });
    
    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }
    
    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      return NextResponse.json(
        { error: 'Only active subscriptions can be paused' },
        { status: 400 }
      );
    }
    
    const updatedSubscription = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: SubscriptionStatus.PAUSED,
        pausedAt: new Date(),
      }
    });
    
    // Update patient tags
    const patient = await prisma.patient.findUnique({
      where: { id: subscription.patientId }
    });
    
    if (patient) {
      const currentTags = (patient.tags as string[]) || [];
      const updatedTags = currentTags
        .filter((tag: any) => tag !== 'active-subscription')
        .concat('paused-subscription');
      
      await prisma.patient.update({
        where: { id: subscription.patientId },
        data: { tags: updatedTags }
      });
    }
    
    return NextResponse.json(updatedSubscription);
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Error pausing subscription:', error);
    return NextResponse.json(
      { error: 'Failed to pause subscription' },
      { status: 500 }
    );
  }
}