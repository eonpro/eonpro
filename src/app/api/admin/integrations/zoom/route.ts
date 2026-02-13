/**
 * Clinic Zoom Integration Admin API
 *
 * Allows clinic admins to connect, configure, and disconnect their Zoom account.
 * Each clinic can use their own Zoom account for telehealth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import {
  getClinicZoomStatus,
  saveClinicZoomCredentials,
  saveClinicZoomTokens,
  updateClinicZoomSettings,
  disconnectClinicZoom,
  exchangeZoomCode,
  getClinicZoomUser,
} from '@/lib/clinic-zoom';

const connectSchema = z.object({
  accountId: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  sdkKey: z.string().optional(),
  sdkSecret: z.string().optional(),
  webhookSecret: z.string().optional(),
});

const oauthSchema = z.object({
  code: z.string(),
  state: z.string(),
});

const settingsSchema = z.object({
  waitingRoomEnabled: z.boolean().optional(),
  recordingEnabled: z.boolean().optional(),
  hipaaCompliant: z.boolean().optional(),
});

/**
 * GET /api/admin/integrations/zoom
 * Get Zoom integration status for the clinic
 */
export const GET = withAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.clinicId) {
      return NextResponse.json({ error: 'No clinic context' }, { status: 400 });
    }

    const status = await getClinicZoomStatus(user.clinicId);

    return NextResponse.json({
      status,
      setupInstructions: !status.isOwnAccount
        ? {
            title: 'Connect Your Zoom Account',
            steps: [
              '1. Go to Zoom App Marketplace (marketplace.zoom.us)',
              '2. Click "Develop" → "Build App" → "Server-to-Server OAuth"',
              '3. Create a new app and copy the Account ID, Client ID, and Client Secret',
              '4. (Optional) Create a separate OAuth App for Web SDK and copy SDK Key/Secret',
              '5. Enter the credentials below to connect',
            ],
            note: 'Using your own Zoom account ensures meetings are created under your organization and comply with your HIPAA BAA.',
          }
        : undefined,
    });
  } catch (error) {
    logger.error('Failed to get Zoom status', {
      clinicId: user.clinicId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to get Zoom status' }, { status: 500 });
  }
});

/**
 * POST /api/admin/integrations/zoom
 * Connect Zoom account to clinic (Server-to-Server OAuth credentials)
 */
export const POST = withAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.clinicId) {
      return NextResponse.json({ error: 'No clinic context' }, { status: 400 });
    }

    const body = await req.json();

    // Handle OAuth callback flow
    if (body.code && body.state) {
      const parsed = oauthSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid OAuth data', details: parsed.error.issues },
          { status: 400 }
        );
      }

      // Decode state to get clinic ID
      try {
        const stateData = JSON.parse(Buffer.from(parsed.data.state, 'base64').toString());
        if (stateData.clinicId !== user.clinicId) {
          return NextResponse.json({ error: 'State mismatch' }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
      }

      // This path is for OAuth flow if using user-level OAuth
      // For Server-to-Server, we use direct credential input instead
      return NextResponse.json(
        { error: 'Use credential-based connection for Server-to-Server OAuth' },
        { status: 400 }
      );
    }

    // Handle direct credential input (Server-to-Server OAuth)
    const parsed = connectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid credentials', details: parsed.error.issues },
        { status: 400 }
      );
    }

    // Verify credentials by trying to get user info
    // For Server-to-Server, we need to get an access token first
    const tokenResponse = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${parsed.data.clientId}:${parsed.data.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'account_credentials',
        account_id: parsed.data.accountId,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      logger.error('Zoom credential verification failed', { error });
      return NextResponse.json(
        {
          error:
            'Invalid Zoom credentials. Please check your Account ID, Client ID, and Client Secret.',
        },
        { status: 400 }
      );
    }

    const tokenData = await tokenResponse.json();

    // Verify we can access the API
    const userResponse = await fetch('https://api.zoom.us/v2/users/me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userResponse.ok) {
      return NextResponse.json({ error: 'Failed to verify Zoom account access' }, { status: 400 });
    }

    const userData = await userResponse.json();

    // Save credentials
    await saveClinicZoomCredentials(user.clinicId, {
      accountId: parsed.data.accountId,
      accountEmail: userData.email,
      clientId: parsed.data.clientId,
      clientSecret: parsed.data.clientSecret,
      sdkKey: parsed.data.sdkKey,
      sdkSecret: parsed.data.sdkSecret,
      webhookSecret: parsed.data.webhookSecret,
    });

    // Save initial token
    await saveClinicZoomTokens(user.clinicId, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || '',
      expiresIn: tokenData.expires_in,
      tokenType: tokenData.token_type,
      scope: tokenData.scope || '',
    });

    logger.info('Zoom connected for clinic', {
      clinicId: user.clinicId,
      accountEmail: userData.email,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      account: {
        email: userData.email,
        firstName: userData.first_name,
        lastName: userData.last_name,
        accountId: parsed.data.accountId,
      },
      message: 'Zoom account connected successfully',
    });
  } catch (error) {
    logger.error('Failed to connect Zoom', {
      clinicId: user.clinicId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to connect Zoom account' }, { status: 500 });
  }
});

/**
 * PATCH /api/admin/integrations/zoom
 * Update Zoom settings for clinic
 */
export const PATCH = withAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.clinicId) {
      return NextResponse.json({ error: 'No clinic context' }, { status: 400 });
    }

    const body = await req.json();
    const parsed = settingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid settings', details: parsed.error.issues },
        { status: 400 }
      );
    }

    await updateClinicZoomSettings(user.clinicId, parsed.data);

    return NextResponse.json({
      success: true,
      message: 'Zoom settings updated',
    });
  } catch (error) {
    logger.error('Failed to update Zoom settings', {
      clinicId: user.clinicId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
});

/**
 * DELETE /api/admin/integrations/zoom
 * Disconnect Zoom from clinic
 */
export const DELETE = withAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.clinicId) {
      return NextResponse.json({ error: 'No clinic context' }, { status: 400 });
    }

    await disconnectClinicZoom(user.clinicId);

    logger.info('Zoom disconnected for clinic', {
      clinicId: user.clinicId,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      message: 'Zoom disconnected. You will now use the platform default Zoom account.',
    });
  } catch (error) {
    logger.error('Failed to disconnect Zoom', {
      clinicId: user.clinicId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to disconnect Zoom' }, { status: 500 });
  }
});
