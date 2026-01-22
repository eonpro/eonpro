import { NextRequest, NextResponse } from 'next/server';
import { validateDEA, formatDEA } from '@/lib/dea-validation';
import { logger } from '@/lib/logger';

/**
 * DEA Number Validation API
 * 
 * Validates DEA number format and checksum.
 * Note: This does NOT verify if the DEA is actually registered with the DEA
 * (that requires paid database access). It only validates the format.
 * 
 * Query Parameters:
 * - dea: The DEA number to validate (required)
 * - lastName: Provider's last name (optional, for additional validation)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dea = searchParams.get('dea');
    const lastName = searchParams.get('lastName') || undefined;

    if (!dea) {
      return NextResponse.json({ error: 'DEA number is required' }, { status: 400 });
    }

    // Sanitize input - only allow alphanumeric and dashes
    const sanitizedDea = dea.replace(/[^A-Za-z0-9-]/g, '').substring(0, 20);
    
    const result = validateDEA(sanitizedDea, lastName);

    return NextResponse.json({
      ...result,
      deaNumber: sanitizedDea.replace(/[\s-]/g, '').toUpperCase(),
      formattedDEA: result.isValid ? formatDEA(sanitizedDea) : undefined,
      note: result.isValid 
        ? 'Format validation passed. This does not verify DEA registration status.'
        : undefined,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('DEA validation error', { error: errorMessage });
    return NextResponse.json(
      { error: 'Failed to validate DEA number' },
      { status: 500 }
    );
  }
}
