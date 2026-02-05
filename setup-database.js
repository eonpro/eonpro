const { PrismaClient } = require('@prisma/client');

async function setupDatabase() {
  console.log('🔄 Testing database connection...');
  
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is required');
    console.log('💡 Set DATABASE_URL in your .env file or environment');
    process.exit(1);
  }
  
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
          console.log('⚠️  No users found in database.');
          console.log('💡 To create an admin user, run: npx ts-node scripts/create-admin.ts');
          console.log('   DO NOT use default/hardcoded passwords in production!');
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
