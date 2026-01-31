import { NextResponse, NextRequest } from 'next/server';
import { prisma, runWithClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

/**
 * GET /api/internal/users - Fetch team members for internal chat
 * Returns users within the same clinic (or all users for super_admin)
 */
async function getHandler(request: NextRequest, user: AuthUser) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const excludeSelf = searchParams.get('excludeSelf') !== 'false';
    
    logger.api('GET', '/api/internal/users', {
      userId: user.id,
      userRole: user.role,
      clinicId: user.clinicId,
      search
    });

    // Run with clinic context for proper isolation
    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    const users = await runWithClinicContext(clinicId, async () => {
      const whereClause: any = {
        // Only include active users (not archived)
        NOT: {
          role: 'patient' // Exclude patients from internal chat
        }
      };

      // Exclude self if requested
      if (excludeSelf) {
        whereClause.id = { not: user.id };
      }

      // Search filter
      if (search) {
        whereClause.OR = [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ];
      }

      return await prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          clinicId: true,
          provider: {
            select: {
              id: true,
              titleLine: true
            }
          }
        },
        orderBy: [
          { role: 'asc' },
          { firstName: 'asc' },
          { lastName: 'asc' }
        ],
        take: 100 // Limit to 100 users for performance
      });
    });

    // Transform to add display info
    const transformedUsers = users.map((u: any) => ({
      id: u.id,
      firstName: u.firstName || '',
      lastName: u.lastName || '',
      email: u.email,
      role: u.role,
      specialty: u.provider?.titleLine || null,
      isOnline: false // Placeholder for future real-time presence
    }));

    return NextResponse.json({
      ok: true,
      data: transformedUsers,
      meta: {
        total: transformedUsers.length,
        clinicId: user.clinicId
      }
    });
  } catch (error) {
    logger.error('Error fetching internal users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

// Export handler with authentication
export const GET = withAuth(getHandler, { 
  roles: ['super_admin', 'admin', 'provider', 'staff'] 
});
