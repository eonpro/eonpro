/**
 * DEBUG: Simple Patient Test Endpoint
 * GET /api/debug/patient/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { jwtVerify } from 'jose';
import { JWT_SECRET } from '@/lib/auth/config';

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(
  req: NextRequest,
  { params }: Params
): Promise<Response> {
  try {
    // 1. Get params
    const resolvedParams = await params;
    const id = Number(resolvedParams.id);
    
    if (Number.isNaN(id)) {
      return NextResponse.json({ step: 1, error: 'Invalid ID', rawId: resolvedParams.id });
    }

    // 2. Get token
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    
    if (!token) {
      return NextResponse.json({ step: 2, error: 'No token' });
    }

    // 3. Verify token
    let user;
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      user = payload;
    } catch {
      return NextResponse.json({ step: 3, error: 'Invalid token' });
    }

    // 4. Get patient
    const patient = await prisma.patient.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        clinicId: true,
      },
    });

    if (!patient) {
      return NextResponse.json({ step: 4, error: 'Patient not found', searchedId: id });
    }

    return NextResponse.json({
      success: true,
      patient,
      user: { id: user.id, role: user.role, clinicId: user.clinicId },
    });

  } catch (error: any) {
    return NextResponse.json({
      error: 'Unexpected error',
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5),
    }, { status: 500 });
  }
}
