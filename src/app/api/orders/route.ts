import { NextRequest, NextResponse } from 'next/server';
import lifefile from "@/lib/lifefile";
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

/**
 * GET /api/orders - List orders
 * CRITICAL: Must filter by clinicId for multi-tenant isolation
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = authResult.user!;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const recent = searchParams.get('recent'); // e.g., "24h"

    let dateFilter: any = {};
    if (recent) {
      const hours = parseInt(recent.replace('h', ''));
      if (!isNaN(hours)) {
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - hours);
        dateFilter = {
          createdAt: {
            gte: cutoff,
          },
        };
      }
    }

    // CRITICAL: Add clinic filter for multi-tenant isolation
    let clinicFilter: any = {};
    if (user.role !== 'super_admin') {
      if (!user.clinicId) {
        return NextResponse.json(
          { error: 'No clinic associated with your account.' },
          { status: 403 }
        );
      }
      clinicFilter = { clinicId: user.clinicId };
    }

    logger.info(`[ORDERS/GET] User ${user.id} (${user.role}) fetching orders for clinicId: ${user.clinicId || 'all'}`);

    const orders = await prisma.order.findMany({
      where: {
        ...dateFilter,
        ...clinicFilter,
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        rxs: true,
      },
    });

    return NextResponse.json({
      orders,
      count: orders.length,
    });
  } catch (error: any) {
    logger.error('[Orders API] Error:', error);
    return NextResponse.json({ 
      orders: [],
      error: error.message 
    });
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const order = await lifefile.createOrder(body);
  return Response.json(order.data);
}
