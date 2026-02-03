/**
 * Kill idle database connections to free up connection slots
 * Usage: DATABASE_URL="..." node scripts/kill-idle-connections.js
 */

const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Connecting to database...\n');

    // Check current connection stats
    const stats = await prisma.$queryRaw`
      SELECT 
        count(*)::int as total_connections,
        count(*) FILTER (WHERE state = 'idle')::int as idle_connections,
        count(*) FILTER (WHERE state = 'active')::int as active_connections,
        count(*) FILTER (WHERE state = 'idle in transaction')::int as idle_in_transaction
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `;
    
    console.log('Current Connection Stats:');
    console.log('========================');
    console.log(`Total connections: ${stats[0].total_connections}`);
    console.log(`Active: ${stats[0].active_connections}`);
    console.log(`Idle: ${stats[0].idle_connections}`);
    console.log(`Idle in transaction: ${stats[0].idle_in_transaction}`);
    console.log('');

    // Show max connections
    const maxConn = await prisma.$queryRaw`SHOW max_connections`;
    console.log(`Max connections allowed: ${maxConn[0].max_connections}`);
    console.log('');

    // Get idle connections older than 2 minutes
    const idleConnections = await prisma.$queryRaw`
      SELECT pid, usename, application_name, state, 
             EXTRACT(EPOCH FROM (now() - state_change))::int as idle_seconds
      FROM pg_stat_activity 
      WHERE datname = current_database()
        AND state = 'idle'
        AND pid != pg_backend_pid()
        AND state_change < now() - interval '2 minutes'
      ORDER BY idle_seconds DESC
    `;

    console.log(`Found ${idleConnections.length} idle connections older than 2 minutes\n`);

    if (idleConnections.length === 0) {
      console.log('No old idle connections to terminate.');
      return;
    }

    // List connections to be terminated
    console.log('Terminating connections:');
    
    let terminated = 0;
    for (const conn of idleConnections) {
      try {
        // Cast pid to integer explicitly
        const pid = Number(conn.pid);
        await prisma.$executeRawUnsafe(`SELECT pg_terminate_backend(${pid}::int)`);
        console.log(`  Terminated PID ${pid}: ${conn.usename} - idle ${conn.idle_seconds}s`);
        terminated++;
      } catch (err) {
        console.log(`  Could not terminate PID ${conn.pid}: ${err.message}`);
      }
    }

    console.log(`\nTerminated ${terminated} idle connections`);

    // Show new stats
    const newStats = await prisma.$queryRaw`
      SELECT count(*)::int as total_connections
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `;
    console.log(`New connection count: ${newStats[0].total_connections}`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
