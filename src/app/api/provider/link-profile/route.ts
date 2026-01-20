/**
 * Link Provider Profile to User Account
 * This endpoint ensures a provider user is properly linked to their Provider record
 */

import { NextRequest, NextResponse } from 'next/server';
import { basePrisma } from '@/lib/db';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

async function handlePost(req: NextRequest, user: AuthUser) {
  try {
    // Get current user with provider
    const userData = await basePrisma.user.findUnique({
      where: { id: user.id },
      include: { provider: true },
    });

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If already linked, return success
    if (userData.providerId && userData.provider) {
      return NextResponse.json({
        success: true,
        message: 'Provider profile already linked',
        provider: {
          id: userData.provider.id,
          name: `${userData.provider.firstName} ${userData.provider.lastName}`,
          npi: userData.provider.npi,
        }
      });
    }

    // Try to find provider by email
    const provider = await basePrisma.provider.findFirst({
      where: { email: user.email },
    });

    if (!provider) {
      return NextResponse.json({
        success: false,
        error: 'No provider profile found for this email. Please register your NPI in Settings > Credentials.',
        needsRegistration: true,
      }, { status: 404 });
    }

    // Link the provider to the user
    await basePrisma.user.update({
      where: { id: user.id },
      data: { providerId: provider.id },
    });

    logger.info(`[LINK-PROFILE] Linked provider ${provider.id} to user ${user.id}`);

    return NextResponse.json({
      success: true,
      message: 'Provider profile linked successfully',
      provider: {
        id: provider.id,
        name: `${provider.firstName} ${provider.lastName}`,
        npi: provider.npi,
      }
    });
  } catch (error: any) {
    logger.error('Error linking provider profile', { error: error.message, userId: user.id });
    return NextResponse.json(
      { error: `Failed to link profile: ${error.message}` },
      { status: 500 }
    );
  }
}

export const POST = withProviderAuth(handlePost);
