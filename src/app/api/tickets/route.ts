/**
 * Tickets API Route
 * =================
 *
 * GET  /api/tickets - List tickets with filters
 * POST /api/tickets - Create a new ticket
 *
 * @module app/api/tickets
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/tickets
 * List tickets - simplified version for debugging
 */
export async function GET(request: Request) {
  try {
    console.log('[API] Tickets GET - starting');

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const skip = (page - 1) * limit;

    console.log('[API] Tickets GET - querying database');

    // Simple query
    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          status: true,
          priority: true,
          category: true,
          createdAt: true,
        },
      }),
      prisma.ticket.count(),
    ]);

    const totalPages = Math.ceil(total / limit);

    console.log('[API] Tickets GET - success', { count: tickets.length, total });

    return NextResponse.json({
      tickets,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[API] Tickets GET - error', errorMessage);
    return NextResponse.json(
      { error: 'Failed to fetch tickets', details: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tickets
 * Create a new ticket - temporarily disabled
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Ticket creation temporarily disabled during debugging' },
    { status: 503 }
  );
}
