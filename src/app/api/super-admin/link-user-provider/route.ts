/**
 * Admin Endpoint to Link User to Provider
 *
 * POST /api/super-admin/link-user-provider
 *
 * Links a User account to a Provider record so they can approve SOAP notes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export const POST = withAuth(
  async (request: NextRequest, user: AuthUser) => {
    try {
      const body = await request.json();
      const { userEmail, providerId, autoMatch } = body;

      if (!userEmail) {
        return NextResponse.json({ error: 'userEmail is required' }, { status: 400 });
      }

      // Find the user
      const targetUser = await prisma.user.findUnique({
        where: { email: userEmail.toLowerCase() },
        include: { provider: true },
      });

      if (!targetUser) {
        return NextResponse.json({ error: `User not found: ${userEmail}` }, { status: 404 });
      }

      if (targetUser.provider) {
        return NextResponse.json({
          ok: true,
          message: 'User is already linked to a provider',
          user: {
            id: targetUser.id,
            email: targetUser.email,
            providerId: targetUser.providerId,
          },
          provider: {
            id: targetUser.provider.id,
            name: `${targetUser.provider.firstName} ${targetUser.provider.lastName}`,
          },
        });
      }

      let matchedProvider = null;

      // If providerId is specified, use that
      if (providerId) {
        matchedProvider = await prisma.provider.findUnique({
          where: { id: parseInt(providerId, 10) },
        });

        if (!matchedProvider) {
          return NextResponse.json(
            { error: `Provider not found with ID: ${providerId}` },
            { status: 404 }
          );
        }
      }
      // Auto-match by email or name
      else if (autoMatch !== false) {
        // Try email match
        matchedProvider = await prisma.provider.findFirst({
          where: { email: targetUser.email.toLowerCase() },
        });

        // Try name match
        if (!matchedProvider && targetUser.firstName && targetUser.lastName) {
          matchedProvider = await prisma.provider.findFirst({
            where: {
              firstName: { equals: targetUser.firstName, mode: 'insensitive' },
              lastName: { equals: targetUser.lastName, mode: 'insensitive' },
            },
          });
        }

        if (!matchedProvider) {
          // Return potential matches
          const potentialMatches = await prisma.provider.findMany({
            where: {
              OR: [
                { email: { contains: userEmail.split('@')[0], mode: 'insensitive' } },
                ...(targetUser.firstName
                  ? [
                      {
                        firstName: { contains: targetUser.firstName, mode: 'insensitive' as const },
                      },
                    ]
                  : []),
                ...(targetUser.lastName
                  ? [{ lastName: { contains: targetUser.lastName, mode: 'insensitive' as const } }]
                  : []),
              ],
            },
            take: 10,
          });

          return NextResponse.json(
            {
              ok: false,
              error: 'No automatic match found',
              user: {
                id: targetUser.id,
                email: targetUser.email,
                firstName: targetUser.firstName,
                lastName: targetUser.lastName,
              },
              potentialMatches: potentialMatches.map(
                (p: { id: number; firstName: string; lastName: string; email: string }) => ({
                  id: p.id,
                  name: `${p.firstName} ${p.lastName}`,
                  email: p.email,
                })
              ),
              hint: 'Specify providerId to link manually',
            },
            { status: 400 }
          );
        }
      }

      if (!matchedProvider) {
        return NextResponse.json(
          { error: 'Could not determine provider to link' },
          { status: 400 }
        );
      }

      // Link the user to the provider
      await prisma.user.update({
        where: { id: targetUser.id },
        data: { providerId: matchedProvider.id },
      });

      logger.info('[Admin] User linked to provider', {
        userId: targetUser.id,
        userEmail: targetUser.email,
        providerId: matchedProvider.id,
        providerName: `${matchedProvider.firstName} ${matchedProvider.lastName}`,
        linkedBy: user.email,
      });

      return NextResponse.json({
        ok: true,
        message: 'User successfully linked to provider',
        user: {
          id: targetUser.id,
          email: targetUser.email,
        },
        provider: {
          id: matchedProvider.id,
          name: `${matchedProvider.firstName} ${matchedProvider.lastName}`,
          email: matchedProvider.email,
        },
      });
    } catch (error: any) {
      logger.error('[Admin] Error linking user to provider:', { error: error.message });
      return NextResponse.json({ error: 'Failed to link user to provider' }, { status: 500 });
    }
  },
  { roles: ['super_admin'] }
);

/**
 * GET /api/super-admin/link-user-provider?email=xxx
 *
 * Check user-provider link status
 */
export const GET = withAuth(
  async (request: NextRequest) => {
    try {
      const { searchParams } = new URL(request.url);
      const email = searchParams.get('email');

      if (!email) {
        return NextResponse.json({ error: 'email query parameter is required' }, { status: 400 });
      }

      const targetUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        include: { provider: true },
      });

      if (!targetUser) {
        return NextResponse.json({ error: `User not found: ${email}` }, { status: 404 });
      }

      return NextResponse.json({
        ok: true,
        user: {
          id: targetUser.id,
          email: targetUser.email,
          firstName: targetUser.firstName,
          lastName: targetUser.lastName,
          role: targetUser.role,
          providerId: targetUser.providerId,
        },
        provider: targetUser.provider
          ? {
              id: targetUser.provider.id,
              name: `${targetUser.provider.firstName} ${targetUser.provider.lastName}`,
              email: targetUser.provider.email,
            }
          : null,
        isLinked: !!targetUser.provider,
      });
    } catch (error: any) {
      logger.error('[Admin] Error checking user-provider link:', { error: error.message });
      return NextResponse.json({ error: 'Failed to check user-provider link' }, { status: 500 });
    }
  },
  { roles: ['super_admin'] }
);
