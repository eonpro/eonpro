import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  // Return a default count for now
  // In production, this would query the database for unread notifications
  // Auth is optional - returns 0 if not authenticated
  return NextResponse.json({
    count: 0,
    success: true,
  });
}
