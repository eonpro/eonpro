/**
 * Provider Set Password Route
 * ===========================
 *
 * Set or update provider password.
 *
 * @module api/providers/[id]/set-password
 */

import { NextRequest, NextResponse } from 'next/server';
import { providerService, providerRepository } from '@/domains/provider';
import { handleApiError, ValidationError } from '@/domains/shared/errors';

/**
 * POST /api/providers/[id]/set-password
 * Set or update provider password
 *
 * Request body: { password: string, confirmPassword: string }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const providerId = parseInt(resolvedParams.id, 10);

    if (isNaN(providerId) || providerId <= 0) {
      throw new ValidationError('Invalid provider ID');
    }

    const body = await request.json();

    // Get actor email from headers
    const actorEmail =
      request.headers.get('x-actor-email') ?? request.headers.get('x-user-email') ?? 'system';

    const result = await providerService.setPassword(providerId, body, actorEmail);

    // Get provider details for response
    const provider = await providerRepository.findById(providerId);

    return NextResponse.json({
      ok: true,
      message: 'Password set successfully',
      provider: provider
        ? {
            id: provider.id,
            firstName: provider.firstName,
            lastName: provider.lastName,
            email: provider.email,
          }
        : { id: providerId },
    });
  } catch (error) {
    return handleApiError(error, {
      context: { route: 'POST /api/providers/[id]/set-password' },
    });
  }
}
