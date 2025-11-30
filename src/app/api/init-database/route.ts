import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export async function GET(request: Request) {
  // Security check
  const { searchParams } = new URL(request.url);
  const initKey = searchParams.get('key');
  
  if (initKey !== 'init-eonpro-2024') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const prisma = new PrismaClient();
  
  try {
    console.log('🔄 Initializing database...');
    
    // Test connection
    await prisma.$connect();
    console.log('✅ Connected to database');
    
    // Check existing tables
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    ` as any[];
    
    console.log(`📊 Found ${tables.length} tables`);
    
    // Create admin user if no users exist
    const userCount = await prisma.user.count();
    console.log(`👥 Existing users: ${userCount}`);
    
    if (userCount === 0) {
      const admin = await prisma.user.create({
        data: {
          email: 'admin@eonpro.com',
          firstName: 'Admin',
          lastName: 'User',
          passwordHash: '$2b$10$r5fNQ9W.9tKuYSYwO5zTb.9htYrx2OLWM8oaR3Qz4klTN7AsWp7O.', // password: admin123
          role: 'ADMIN',
        }
      });
      console.log('✅ Created admin user:', admin.email);
    }
    
    // Create test clinic if none exists
    const clinicCount = await prisma.clinic.count();
    if (clinicCount === 0) {
      const clinic = await prisma.clinic.create({
        data: {
          name: 'EONPRO Main Clinic',
          subdomain: 'main',
          adminEmail: 'admin@eonpro.com',
          settings: {},
          features: {},
          integrations: {},
        }
      });
      console.log('✅ Created test clinic:', clinic.name);
    }
    
    return NextResponse.json({
      success: true,
      message: 'Database initialized successfully!',
      stats: {
        tables: tables.length,
        users: userCount > 0 ? userCount : 1,
        clinics: clinicCount > 0 ? clinicCount : 1,
      },
      loginInfo: {
        url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://eonpro-kappa.vercel.app'}/login`,
        email: 'admin@eonpro.com',
        password: 'admin123',
        demoUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://eonpro-kappa.vercel.app'}/demo/login`
      }
    });
    
  } catch (error: any) {
    console.error('Database initialization failed:', error);
    
    // Check if it's a connection issue
    if (error.message?.includes("Can't reach database")) {
      return NextResponse.json({
        success: false,
        error: 'Database connection failed',
      troubleshooting: [
        '1. Check DATABASE_URL is correct in Vercel environment variables',
        '2. Verify AWS RDS Security Group allows Vercel Static IPs',
        '3. Ensure RDS instance has "Public access" enabled',
        '4. Redeploy after updating DATABASE_URL',
      ],
        details: error.message
      }, { status: 500 });
    }
    
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error',
      type: error.constructor.name
    }, { status: 500 });
    
  } finally {
    await prisma.$disconnect();
  }
}
