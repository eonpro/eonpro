/**
 * NPI Verification Route
 * ======================
 *
 * Verify NPI with national registry.
 *
 * @module api/providers/verify
 */

import { providerService } from '@/domains/provider';
import { handleApiError } from '@/domains/shared/errors';

/**
 * POST /api/providers/verify
 * Verify NPI with national registry
 *
 * Request body: { npi: string }
 * Response: { result: NpiVerificationResult }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await providerService.verifyNpi(body.npi);

    return Response.json({ result });
  } catch (error) {
    return handleApiError(error, {
      context: { route: 'POST /api/providers/verify' },
    });
  }
}
