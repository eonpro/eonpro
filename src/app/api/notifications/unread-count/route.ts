import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';

async function handler(req: NextRequest) {
  // Return a default count for now
  // In production, this would query the database for unread notifications
  return NextResponse.json({
    count: 0,
    success: true
  });
}

export const GET = withAuth(handler);

