/**
 * SEND OTP API
 * ============
 * Sends a 6-digit OTP code via SMS for phone number authentication
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(): Promise<Response> {
  return NextResponse.json({ 
    ok: true, 
    route: 'send-otp', 
    time: new Date().toISOString(),
    message: 'Route is working!'
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json();
    
    // Just return success for now to test if route works
    return NextResponse.json({
      success: true,
      message: 'Route reached successfully',
      received: body
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'An error occurred' },
      { status: 500 }
    );
  }
}
