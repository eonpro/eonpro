import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateFulfillmentReport } from '@/lib/prescription-tracking/analytics';
import { withProviderAuth } from '@/lib/auth/middleware';

export const GET = withProviderAuth(async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const pharmacy = searchParams.get('pharmacy');

    // Default to last 7 days
    const endDate = endDateParam ? new Date(endDateParam) : new Date();
    const startDate = startDateParam ? 
      new Date(startDateParam) : 
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const report = await generateFulfillmentReport(
      startDate,
      endDate,
      pharmacy === 'all' ? undefined : pharmacy || undefined
    );

    // Get order counts
    const where: any = {
      createdAt: { gte: startDate, lte: endDate }
    };
    if (pharmacy && pharmacy !== 'all') {
      where.pharmacyName = pharmacy;
    }

    const counts = await (prisma as any).prescriptionTracking.groupBy({
      by: ['currentStatus'],
      where,
      _count: true,
    });

    const totalOrders = counts.reduce((sum: number, c: { _count: number }) => sum + c._count, 0);
    const completedOrders = counts.find((c: { currentStatus: string }) => c.currentStatus === "DELIVERED")?._count || 0;
    const pendingOrders = counts
      .filter((c: { currentStatus: string }) => ['PENDING', 'PROCESSING', 'SHIPPED'].includes(c.currentStatus))
      .reduce((sum: number, c: { _count: number }) => sum + c._count, 0);
    const cancelledOrders = counts.find((c: { currentStatus: string }) => c.currentStatus === "CANCELLED")?._count || 0;

    return NextResponse.json({
      ...report,
      totalOrders,
      completedOrders,
      pendingOrders,
      cancelledOrders,
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch analytics', details: error.message },
      { status: 500 }
    );
  }
});
