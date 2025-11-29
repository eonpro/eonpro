const { PrismaClient } = require('@prisma/client');

async function setupDatabase() {
  console.log('🔄 Testing database connection...');
  
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:3lvzN)sk8EBgPR4z]TyR2AUn~_4m@eonpro-production.cluster-cx8o24ooodj4.us-east-2.rds.amazonaws.com:5432/eonpro?schema=public&sslmode=require';
  
  // Set the DATABASE_URL for Prisma
  process.env.DATABASE_URL = databaseUrl;
  
  console.log('📍 Connecting to:', databaseUrl.replace(/:[^:@]*@/, ':****@'));
  
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl
      }
    }
  });

  try {
    // Test connection
    console.log('🔍 Testing connection...');
    await prisma.$connect();
    console.log('✅ Database connected successfully!');
    
    // Check if tables exist
    console.log('📊 Checking existing tables...');
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `;
    
    console.log(`📋 Found ${tables.length} tables:`, tables.map(t => t.table_name).join(', ') || 'None');
    
    if (tables.length === 0) {
      console.log('⚠️  No tables found. Please run: npx prisma db push');
    } else {
      // Try to count records
      try {
        const userCount = await prisma.user.count();
        console.log(`👥 Users in database: ${userCount}`);
        
        if (userCount === 0) {
          console.log('📝 Creating admin user...');
          const admin = await prisma.user.create({
            data: {
              email: 'admin@eonpro.com',
              name: 'Admin User',
              passwordHash: '$2a$10$K7L1OJ0TfPAf8jkXqLPZXeQm6wD6mFXSZv/xHPQKJrYIOVqTf2Cve', // password: admin123
              role: 'admin',
              isActive: true,
              emailVerified: new Date()
            }
          });
          console.log('✅ Admin user created:', admin.email);
        }
      } catch (e) {
        console.log('⚠️  Could not check users:', e.message);
      }
    }
    
    console.log('\n🎉 Database setup complete!');
    console.log('🌐 Your app should now work at: https://eonpro-kappa.vercel.app');
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.log('\n🔍 Troubleshooting:');
    console.log('1. Check AWS RDS is "Available" status');
    console.log('2. Verify security group allows your IP (97.221.72.113)');
    console.log('3. Confirm endpoint is exactly: eonpro-production.cluster-cx8o24ooodj4.us-east-2.rds.amazonaws.com');
    console.log('4. Try enabling "Public accessibility" in RDS settings');
  } finally {
    await prisma.$disconnect();
  }
}

setupDatabase().catch(console.error);
