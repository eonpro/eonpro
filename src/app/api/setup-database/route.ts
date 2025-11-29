import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET(request: Request) {
  // Security: Only allow in production with secret key
  const { searchParams } = new URL(request.url);
  const setupKey = searchParams.get('key');
  
  if (setupKey !== 'eonpro-setup-2024') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    console.log('Starting database setup...');
    
    // Run Prisma db push
    const { stdout, stderr } = await execAsync('npx prisma db push --accept-data-loss');
    
    console.log('Database setup output:', stdout);
    if (stderr) console.error('Database setup warnings:', stderr);
    
    // Generate Prisma Client
    await execAsync('npx prisma generate');
    
    return NextResponse.json({
      success: true,
      message: 'Database setup complete!',
      output: stdout,
      warnings: stderr || 'None'
    });
    
  } catch (error: any) {
    console.error('Database setup failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      details: error.stderr || error.stdout
    }, { status: 500 });
  }
}
