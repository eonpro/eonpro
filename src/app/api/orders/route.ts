import { NextRequest, NextResponse } from 'next/server';
import lifefile from "@/lib/lifefile";
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth/middleware';

/**
 * GET /api/orders - List orders
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const recent = searchParams.get('recent'); // e.g., "24h"

    let dateFilter = {};
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

    const orders = await prisma.order.findMany({
      where: dateFilter,
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
    console.error('[Orders API] Error:', error);
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
