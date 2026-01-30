/**
 * Finance Activity API
 * 
 * GET /api/finance/activity
 * Returns recent financial activity feed
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, getClinicContext, withClinicContext } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { formatDistanceToNow } from 'date-fns';

interface Activity {
  id: number;
  type: 'payment' | 'invoice' | 'subscription' | 'refund' | 'payout';
  description: string;
  amount: number;
  status: string;
  timestamp: string;
  createdAt: Date;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clinicId = getClinicContext();
    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

    return withClinicContext(clinicId, async () => {
      // Fetch recent activities from multiple sources
      const [payments, invoices, subscriptionActions] = await Promise.all([
        // Recent payments
        prisma.payment.findMany({
          where: { clinicId },
          orderBy: { createdAt: 'desc' },
          take: limit,
          include: {
            patient: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        }),

        // Recent invoices
        prisma.invoice.findMany({
          where: { clinicId },
          orderBy: { createdAt: 'desc' },
          take: limit,
          include: {
            patient: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        }),

        // Recent subscription actions
        prisma.subscriptionAction.findMany({
          where: {
            subscription: {
              clinicId,
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          include: {
            subscription: {
              include: {
                patient: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        }),
      ]);

      // Transform and combine activities
      const activities: Activity[] = [];

      // Add payments
      payments.forEach((payment: typeof payments[number]) => {
        const patientName = payment.patient 
          ? `${payment.patient.firstName} ${payment.patient.lastName}`
          : 'Unknown';

        const isRefund = payment.status === 'REFUNDED';
        
        activities.push({
          id: payment.id,
          type: isRefund ? 'refund' : 'payment',
          description: isRefund 
            ? `Refund processed for ${patientName}`
            : `Payment received from ${patientName}`,
          amount: payment.amount,
          status: payment.status.toLowerCase(),
          timestamp: formatDistanceToNow(new Date(payment.createdAt), { addSuffix: true }),
          createdAt: payment.createdAt,
        });
      });

      // Add invoices
      invoices.forEach((invoice: typeof invoices[number]) => {
        const patientName = invoice.patient 
          ? `${invoice.patient.firstName} ${invoice.patient.lastName}`
          : 'Unknown';

        let description = '';
        switch (invoice.status) {
          case 'PAID':
            description = `Invoice paid by ${patientName}`;
            break;
          case 'SENT':
          case 'OPEN':
            description = `Invoice sent to ${patientName}`;
            break;
          case 'VOID':
            description = `Invoice voided for ${patientName}`;
            break;
          default:
            description = `Invoice created for ${patientName}`;
        }

        activities.push({
          id: invoice.id + 100000, // Offset to avoid ID collision
          type: 'invoice',
          description,
          amount: invoice.total,
          status: invoice.status.toLowerCase(),
          timestamp: formatDistanceToNow(new Date(invoice.createdAt), { addSuffix: true }),
          createdAt: invoice.createdAt,
        });
      });

      // Add subscription actions
      subscriptionActions.forEach((action: typeof subscriptionActions[number]) => {
        const patientName = action.subscription?.patient 
          ? `${action.subscription.patient.firstName} ${action.subscription.patient.lastName}`
          : 'Unknown';

        let description = '';
        let amount = action.subscription?.amount || 0;

        switch (action.actionType) {
          case 'CREATED':
            description = `New subscription for ${patientName}`;
            break;
          case 'CANCELED':
            description = `Subscription canceled by ${patientName}`;
            break;
          case 'PAUSED':
            description = `Subscription paused for ${patientName}`;
            break;
          case 'RESUMED':
            description = `Subscription resumed for ${patientName}`;
            break;
          case 'UPGRADED':
            description = `Subscription upgraded for ${patientName}`;
            break;
          case 'DOWNGRADED':
            description = `Subscription downgraded for ${patientName}`;
            break;
          default:
            description = `Subscription updated for ${patientName}`;
        }

        activities.push({
          id: action.id + 200000, // Offset to avoid ID collision
          type: 'subscription',
          description,
          amount,
          status: action.actionType.toLowerCase(),
          timestamp: formatDistanceToNow(new Date(action.createdAt), { addSuffix: true }),
          createdAt: action.createdAt,
        });
      });

      // Sort by date and limit
      const sortedActivities = activities
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit)
        .map(({ createdAt, ...rest }) => rest); // Remove createdAt from response

      return NextResponse.json({
        activities: sortedActivities,
      });
    });
  } catch (error) {
    logger.error('Failed to fetch finance activity', { error });
    return NextResponse.json(
      { error: 'Failed to fetch finance activity' },
      { status: 500 }
    );
  }
}
