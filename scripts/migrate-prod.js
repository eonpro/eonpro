// Production Migration Script
// This can be run from Vercel's Functions or locally

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function runMigrations() {
  console.log('🚀 Running production migrations...');
  
  try {
    // Run Prisma migrations
    const { stdout, stderr } = await execAsync('npx prisma migrate deploy');
    
    if (stderr && !stderr.includes('Already in sync')) {
      console.error('⚠️ Migration warnings:', stderr);
    }
    
    console.log('✅ Migrations complete:', stdout);
    
    // Generate Prisma Client
    console.log('📦 Generating Prisma Client...');
    await execAsync('npx prisma generate');
    
    console.log('✅ All database setup complete!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  console.log('Set it with: export DATABASE_URL="your-connection-string"');
  process.exit(1);
}

console.log('🔗 Database URL configured');
console.log('🏃 Starting migrations...\n');

runMigrations();
