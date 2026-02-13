import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  // Disable debug endpoint in production for security
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Debug endpoint disabled in production' }, { status: 404 });
  }

  logger.debug('\n========== HEYFLOW DEBUG WEBHOOK ==========');
  logger.debug('Timestamp:', { value: new Date().toISOString() });

  // Log all headers
  logger.debug('\nHEADERS:');
  request.headers.forEach((value, key) => {
    logger.debug(`  ${key}: ${value}`);
  });

  // Get the raw body
  const body = await request.text();
  logger.debug('\nRAW BODY:');
  logger.debug('Body content:', { body });

  // Try to parse as JSON
  try {
    const json = JSON.parse(body);
    logger.debug('\nPARSED JSON:');
    logger.debug('JSON content:', { json: JSON.stringify(json, null, 2) });

    // Check for different MedLink formats
    if (json.responseId) {
      logger.debug('\nFound responseId (v2 format)');
    }
    if (json.response?.responseId) {
      logger.debug('\nFound response.responseId (v1 format)');
    }
    if (json.submissionId) {
      logger.debug('\nFound submissionId (alternative format)');
    }
  } catch (e: any) {
    // @ts-ignore

    logger.debug('\n✗ Body is not valid JSON');
  }

  logger.debug('\n========================================\n');

  return NextResponse.json({
    ok: true,
    message: 'Debug webhook received',
    timestamp: new Date().toISOString(),
  });
}

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({
    status: 'Debug webhook is active',
    url: request.url,
    timestamp: new Date().toISOString(),
  });
}
