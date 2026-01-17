import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '@/lib/logger';

const execAsync = promisify(exec);

/**
 * Database Setup Endpoint
 * ⚠️ SECURITY: This endpoint is DISABLED in production
 * Only available in development/staging with proper key
 */
export async function GET(request: Request) {
  // CRITICAL: Block in production
  if (process.env.NODE_ENV === 'production') {
    logger.warn('[SETUP-DB] Blocked attempt in production');
    return NextResponse.json({ error: 'Not available' }, { status: 403 });
  }

  // Security: Require environment variable key (no hardcoded fallback)
  const expectedKey = process.env.DB_SETUP_KEY;
  if (!expectedKey) {
    logger.error('[SETUP-DB] DB_SETUP_KEY not configured');
    return NextResponse.json({ error: 'Endpoint not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const setupKey = searchParams.get('key');
  
  if (setupKey !== expectedKey) {
    logger.warn('[SETUP-DB] Invalid setup key provided');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    logger.info('[SETUP-DB] Running database setup...');
    
    // Run Prisma db push
    const { stdout, stderr } = await execAsync('npx prisma db push --accept-data-loss');
    
    // Generate Prisma Client
    await execAsync('npx prisma generate');
    
    logger.info('[SETUP-DB] Database setup complete');
    
    return NextResponse.json({
      success: true,
      message: 'Database setup complete!',
      output: stdout,
      warnings: stderr || 'None'
    });
    
  } catch (error: unknown) {
    const errorObj = error as { message?: string; stderr?: string; stdout?: string };
    logger.error('[SETUP-DB] Database setup failed:', { error: errorObj.message });
    return NextResponse.json({
      success: false,
      error: errorObj.message || 'Setup failed',
      details: process.env.NODE_ENV === 'development' 
        ? (errorObj.stderr || errorObj.stdout) 
        : 'Check server logs'
    }, { status: 500 });
  }
}
