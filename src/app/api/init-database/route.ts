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
          name: 'Admin User',
          passwordHash: '$2a$10$K7L1OJ0TfPAf8jkXqLPZXeQm6wD6mFXSZv/xHPQKJrYIOVqTf2Cve', // password: admin123
          role: 'ADMIN',
          isActive: true,
          emailVerified: new Date(),
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
          address: '123 Health Street',
          city: 'Washington',
          state: 'DC',
          zipCode: '20001',
          phone: '555-0100',
          email: 'clinic@eonpro.com',
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
          '1. Ensure AWS Security Group includes Vercel Static IPs',
          '2. Static IP 1: 98.89.149.96/32',
          '3. Static IP 2: 52.0.7.126/32',
          '4. Redeploy after updating security group',
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
