/**
 * Bulk Sync Stripe Profiles API
 * ==============================
 *
 * POST /api/admin/sync-stripe-profiles
 *
 * Syncs all "Unknown Customer" patient profiles with Stripe to get
 * complete customer data (name, email, phone).
 *
 * This is a one-time cleanup operation for existing incomplete profiles.
 *
 * Data sources used:
 * 1. Stripe Customer object (name, email, phone, description)
 * 2. Invoice descriptions (often contain name in parentheses)
 * 3. Customer metadata
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { fetchStripeCustomerData } from '@/services/stripe/paymentMatchingService';

interface SyncResult {
  patientId: number;
  stripeCustomerId: string;
  updated: boolean;
  changes: string[];
  error?: string;
}

/**
 * Extract customer name from invoice description
 */
function extractNameFromDescription(description: string | null): string | null {
  if (!description) return null;

  // Pattern: "Invoice XXXX (Name)"
  const parenMatch = description.match(/\(([^)]+)\)\s*$/);
  if (parenMatch && parenMatch[1]) {
    const name = parenMatch[1].trim();
    if (/[a-zA-Z]/.test(name) && name.length > 2) {
      return name;
    }
  }

  return null;
}

/**
 * Split name into first and last
 */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  const lastName = parts.pop() || '';
  const firstName = parts.join(' ');
  return { firstName, lastName };
}

async function handlePost(req: NextRequest, user: AuthUser): Promise<NextResponse> {
  // Only super_admin can run bulk sync
  if (user.role !== 'super_admin' && user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only admins can run bulk sync' },
      { status: 403 }
    );
  }

  try {
    // Parse optional body - use defaults if empty/invalid
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // Empty or invalid JSON is OK - use defaults
    }
    const dryRun = body.dryRun === true;
    const limit = Math.min(body.limit || 50, 100); // Max 100 at a time

    // Find patients with incomplete profiles created from Stripe
    const incompletePatients = await prisma.patient.findMany({
      where: {
        OR: [
          { firstName: 'Unknown' },
          { lastName: 'Customer' },
          { email: { contains: '@placeholder.local' } },
        ],
        stripeCustomerId: { not: null },
      },
      include: {
        invoices: {
          select: {
            id: true,
            description: true,
          },
          take: 5,
        },
      },
      take: limit,
    });

    logger.info('[Sync Stripe Profiles] Starting bulk sync', {
      totalFound: incompletePatients.length,
      dryRun,
      userId: user.id,
    });

    const results: SyncResult[] = [];

    for (const patient of incompletePatients) {
      const result: SyncResult = {
        patientId: patient.id,
        stripeCustomerId: patient.stripeCustomerId!,
        updated: false,
        changes: [],
      };

      try {
        // Fetch customer data from Stripe
        const customerData = await fetchStripeCustomerData(patient.stripeCustomerId!);

        const updates: Record<string, string> = {};

        // Check for better name
        let newName = customerData.name;

        // If Stripe doesn't have name, try invoice descriptions
        if (!newName) {
          for (const invoice of patient.invoices) {
            const extractedName = extractNameFromDescription(invoice.description);
            if (extractedName) {
              newName = extractedName;
              result.changes.push(`Name extracted from invoice: "${extractedName}"`);
              break;
            }
          }
        } else {
          result.changes.push(`Name from Stripe: "${newName}"`);
        }

        // Update name if we found one and current is placeholder
        if (newName && (patient.firstName === 'Unknown' || patient.lastName === 'Customer')) {
          const { firstName, lastName } = splitName(newName);
          if (firstName) updates.firstName = firstName;
          if (lastName) updates.lastName = lastName;
        }

        // Update email if we found one and current is placeholder
        if (customerData.email && patient.email.includes('@placeholder.local')) {
          updates.email = customerData.email;
          result.changes.push(`Email from Stripe: "${customerData.email}"`);
        }

        // Update phone if we found one
        if (customerData.phone && !patient.phone) {
          updates.phone = customerData.phone;
          result.changes.push(`Phone from Stripe: "${customerData.phone}"`);
        }

        // Update address if we found one and current is empty
        if (customerData.address && !patient.address1) {
          if (customerData.address.line1) updates.address1 = customerData.address.line1;
          if (customerData.address.city) updates.city = customerData.address.city;
          if (customerData.address.state) updates.state = customerData.address.state;
          if (customerData.address.postal_code) updates.zip = customerData.address.postal_code;
          result.changes.push('Address from Stripe');
        }

        // Apply updates if not dry run
        if (Object.keys(updates).length > 0) {
          result.updated = true;

          if (!dryRun) {
            // Determine new profile status
            const hasRealEmail = updates.email || !patient.email.includes('@placeholder.local');
            const hasRealName = (updates.firstName && updates.firstName !== 'Unknown') ||
                               (patient.firstName !== 'Unknown' && updates.lastName && updates.lastName !== 'Customer');
            const newProfileStatus = hasRealEmail && hasRealName ? 'ACTIVE' : 'PENDING_COMPLETION';

            await prisma.patient.update({
              where: { id: patient.id },
              data: {
                ...updates,
                profileStatus: newProfileStatus,
                notes: patient.notes?.replace('⚠️ PENDING COMPLETION:', '✅ SYNCED FROM STRIPE:') ||
                       `✅ SYNCED FROM STRIPE on ${new Date().toISOString()}`,
              },
            });
          }
        } else {
          result.changes.push('No new data found in Stripe');
        }
      } catch (error) {
        result.error = error instanceof Error ? error.message : 'Unknown error';
        logger.warn('[Sync Stripe Profiles] Failed to sync patient', {
          patientId: patient.id,
          error: result.error,
        });
      }

      results.push(result);
    }

    // Summary
    const updated = results.filter(r => r.updated).length;
    const failed = results.filter(r => r.error).length;
    const noChanges = results.filter(r => !r.updated && !r.error).length;

    logger.info('[Sync Stripe Profiles] Bulk sync completed', {
      total: results.length,
      updated,
      failed,
      noChanges,
      dryRun,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      dryRun,
      summary: {
        total: results.length,
        updated,
        failed,
        noChanges,
        remaining: await prisma.patient.count({
          where: {
            OR: [
              { firstName: 'Unknown' },
              { lastName: 'Customer' },
              { email: { contains: '@placeholder.local' } },
            ],
            stripeCustomerId: { not: null },
          },
        }),
      },
      results,
    });
  } catch (error) {
    logger.error('[Sync Stripe Profiles] Error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to sync profiles' },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handlePost, { roles: ['super_admin', 'admin'] });
