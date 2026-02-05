import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { UserRole, UserStatus } from '@prisma/client';

/**
 * GET /api/internal/users - Fetch team members for internal chat
 *
 * MULTI-CLINIC SUPPORT:
 * - Super admins see all users across all clinics
 * - Users see all team members from clinics they belong to (via UserClinic table)
 * - Falls back to primary clinicId if user has no UserClinic entries
 *
 * VISIBILITY RULES:
 * - Excludes patients (they use patient chat)
 * - Only shows ACTIVE users
 * - Can exclude self with ?excludeSelf=true
 * - ALWAYS shows super_admin users (Platform Administrators) for support access
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

    // Determine which clinics the user has access to
    let accessibleClinicIds: number[] = [];

    if (user.role === 'super_admin') {
      // Super admins see everyone - no clinic filter
      accessibleClinicIds = [];
    } else {
      // Get all clinics user belongs to via UserClinic junction table
      const userClinics = await prisma.userClinic.findMany({
        where: {
          userId: user.id,
          isActive: true
        },
        select: {
          clinicId: true
        }
      });

      accessibleClinicIds = userClinics.map((uc: { clinicId: number }) => uc.clinicId);

      // Fall back to primary clinic if no UserClinic entries
      if (accessibleClinicIds.length === 0 && user.clinicId) {
        accessibleClinicIds = [user.clinicId];
      }
    }

    // Build the where clause
    const whereClause: Record<string, unknown> = {
      // Exclude patients - they use patient chat
      NOT: {
        role: UserRole.PATIENT
      },
      // Only active users
      status: UserStatus.ACTIVE
    };

    // Apply clinic filter for non-super-admin users
    // BUT always include SUPER_ADMIN users (Platform Administrators) for support access
    if (accessibleClinicIds.length > 0) {
      // Users can be in a clinic via:
      // 1. Their primary clinicId field
      // 2. Their UserClinic entries
      // 3. OR they are a SUPER_ADMIN (always visible for platform support)
      whereClause.OR = [
        { clinicId: { in: accessibleClinicIds } },
        { userClinics: { some: { clinicId: { in: accessibleClinicIds }, isActive: true } } },
        { role: UserRole.SUPER_ADMIN } // Always show Platform Administrators
      ];
    }

    // Exclude self if requested
    if (excludeSelf) {
      whereClause.id = { not: user.id };
    }

    // Search filter - combine with existing OR if present
    if (search) {
      const searchConditions = [
        { firstName: { contains: search, mode: 'insensitive' as const } },
        { lastName: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } }
      ];

      // If we already have OR conditions for clinic filtering, we need to AND them
      if (whereClause.OR) {
        whereClause.AND = [
          { OR: whereClause.OR as unknown[] },
          { OR: searchConditions }
        ];
        delete whereClause.OR;
      } else {
        whereClause.OR = searchConditions;
      }
    }

    const users = await prisma.user.findMany({
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
        },
        // Include clinic info for display
        clinic: {
          select: {
            id: true,
            name: true
          }
        },
        // Include all user's clinics for multi-clinic users
        userClinics: {
          where: { isActive: true },
          select: {
            clinicId: true,
            clinic: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: [
        { role: 'asc' },
        { firstName: 'asc' },
        { lastName: 'asc' }
      ],
      take: 100 // Limit for performance
    });

    // Transform to add display info
    const transformedUsers = users.map((u: typeof users[number]) => {
      // Get all clinic names for display
      const clinicNames: string[] = [];
      if (u.clinic?.name) {
        clinicNames.push(u.clinic.name);
      }
      u.userClinics?.forEach((uc: { clinic?: { name?: string } }) => {
        if (uc.clinic?.name && !clinicNames.includes(uc.clinic.name)) {
          clinicNames.push(uc.clinic.name);
        }
      });

      // Special display name for SUPER_ADMIN
      const displayRole = u.role === UserRole.SUPER_ADMIN ? 'Platform Admin' : u.role;
      const isSuperAdmin = u.role === UserRole.SUPER_ADMIN;

      return {
        id: u.id,
        firstName: u.firstName || '',
        lastName: u.lastName || '',
        email: u.email,
        role: displayRole,
        originalRole: u.role,
        clinicId: u.clinicId,
        clinicName: isSuperAdmin ? 'All Clinics' : (clinicNames[0] || null),
        clinics: isSuperAdmin ? ['All Clinics'] : clinicNames,
        specialty: u.provider?.titleLine || null,
        isOnline: false, // Placeholder for future real-time presence
        isPlatformAdmin: isSuperAdmin // Flag for UI to highlight
      };
    });

    // Sort to put Platform Admins at the top for easy access
    type TransformedUser = typeof transformedUsers[number];
    transformedUsers.sort((a: TransformedUser, b: TransformedUser) => {
      if (a.isPlatformAdmin && !b.isPlatformAdmin) return -1;
      if (!a.isPlatformAdmin && b.isPlatformAdmin) return 1;
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    });

    return NextResponse.json({
      ok: true,
      data: transformedUsers,
      meta: {
        total: transformedUsers.length,
        userClinicId: user.clinicId,
        accessibleClinics: accessibleClinicIds.length || 'all'
      }
    });
  } catch (error) {
    // Log detailed error for debugging
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = (error as any)?.code || 'unknown';
    
    logger.error('Error fetching internal users:', {
      message: errorMessage,
      code: errorCode,
      userId: user.id,
      clinicId: user.clinicId,
      role: user.role,
    });
    
    // Return empty array instead of 500 - allows app to function
    return NextResponse.json({
      ok: true,
      data: [],
      meta: {
        total: 0,
        userClinicId: user.clinicId,
        accessibleClinics: 0,
        error: 'Failed to fetch users - feature temporarily unavailable'
      }
    });
  }
}

// Export handler with authentication
// Include all staff roles that should have access to internal chat
export const GET = withAuth(getHandler, {
  roles: ['super_admin', 'admin', 'provider', 'staff', 'support']
});
