import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/auth/middleware';
import { decryptPatientPHI, DEFAULT_PHI_FIELDS } from '@/lib/security/phi-encryption';
import { logger } from '@/lib/logger';

/**
 * GET /api/internal/patients
 * Internal endpoint for fetching patients for ticket creation
 * REQUIRES AUTHENTICATION - Only admin and provider roles
 */
export const GET = withAuth(async (req, user) => {
  try {
    // Log access for audit trail
    logger.api('GET', '/api/internal/patients', {
      userId: user.id,
      userRole: user.role,
      clinicId: user.clinicId
    });
    
    // Build query with clinic filtering
    const whereClause: any = {};
    if (user.clinicId) {
      whereClause.clinicId = user.clinicId;
    }
    
    const patients = await prisma.patient.findMany({
      where: whereClause,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        patientId: true,
      },
      orderBy: {
        id: 'desc', // Most recent first
      },
      take: 500, // Limit to 500 most recent for performance
    });
    
    // Decrypt PHI fields for authorized users (all PHI fields per SOC 2 compliance)
    const decryptedPatients = patients.map((patient: Record<string, unknown>) => 
      decryptPatientPHI(patient, [...DEFAULT_PHI_FIELDS])
    );

    return NextResponse.json(decryptedPatients);
  } catch (error) {
    logger.error('Error fetching patients for internal use:', error);
    
    // Never return mock data with real names/emails in production
    if (process.env.NODE_ENV === 'development') {
      const mockPatients = [
        { id: 1, firstName: 'Test', lastName: 'Patient1', email: 'test1@example.com', phone: '555-0001' },
        { id: 2, firstName: 'Test', lastName: 'Patient2', email: 'test2@example.com', phone: '555-0002' },
      ];
      return NextResponse.json(mockPatients);
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch patients' },
      { status: 500 }
    );
  }
}, { 
  roles: ['admin', 'provider'] // Only admin and provider can access
});
