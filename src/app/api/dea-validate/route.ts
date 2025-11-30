import { NextRequest, NextResponse } from 'next/server';
import { validateDEA, formatDEA } from '@/lib/dea-validation';

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
  const { searchParams } = new URL(req.url);
  const dea = searchParams.get('dea');
  const lastName = searchParams.get('lastName') || undefined;

  if (!dea) {
    return NextResponse.json({ error: 'DEA number is required' }, { status: 400 });
  }

  const result = validateDEA(dea, lastName);

  return NextResponse.json({
    ...result,
    deaNumber: dea.replace(/[\s-]/g, '').toUpperCase(),
    formattedDEA: result.isValid ? formatDEA(dea) : undefined,
    note: result.isValid 
      ? 'Format validation passed. This does not verify DEA registration status.'
      : undefined,
  });
}

