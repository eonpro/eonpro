#!/usr/bin/env npx tsx
/**
 * Production Monitoring Script
 * ============================
 * 
 * Checks health and status of production services.
 * Run with: npx tsx scripts/monitor-production.ts
 * 
 * Required environment variables:
 * - NEXT_PUBLIC_APP_URL: Production URL
 * - DATABASE_URL: Production database
 */

import { PrismaClient } from '@prisma/client';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.eonpro.io';
const prisma = new PrismaClient();

interface HealthCheck {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  latency?: number;
}

async function checkEndpoint(url: string, name: string): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const response = await fetch(url, { 
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
    const latency = Date.now() - start;
    
    if (response.ok) {
      return { name, status: 'ok', message: `HTTP ${response.status}`, latency };
    } else {
      return { name, status: 'warning', message: `HTTP ${response.status}`, latency };
    }
  } catch (error) {
    const latency = Date.now() - start;
    return { 
      name, 
      status: 'error', 
      message: error instanceof Error ? error.message : 'Unknown error',
      latency 
    };
  }
}

async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    return { name: 'Database', status: 'ok', message: 'Connected', latency };
  } catch (error) {
    const latency = Date.now() - start;
    return { 
      name: 'Database', 
      status: 'error', 
      message: error instanceof Error ? error.message : 'Connection failed',
      latency 
    };
  }
}

async function getRecentErrors(): Promise<void> {
  console.log('\n📋 Recent Errors (last 24 hours):');
  console.log('─'.repeat(60));
  
  try {
    // Check webhook failures
    const failedWebhooks = await prisma.webhookLog.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        status: { in: ['FAILED', 'ERROR'] },
      },
    });
    console.log(`  Webhook failures: ${failedWebhooks}`);
    
    // Check failed payments (if table exists)
    try {
      const failedPayments = await prisma.payment.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          status: 'FAILED',
        },
      });
      console.log(`  Failed payments: ${failedPayments}`);
    } catch {
      console.log(`  Failed payments: N/A`);
    }
    
    // Check recent audit logs for errors
    try {
      const errorLogs = await prisma.hIPAAAuditEntry.count({
        where: {
          timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          outcome: 'FAILURE',
        },
      });
      console.log(`  HIPAA audit failures: ${errorLogs}`);
    } catch {
      console.log(`  HIPAA audit failures: N/A`);
    }
    
  } catch (error) {
    console.log(`  Error fetching stats: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}

async function getSystemStats(): Promise<void> {
  console.log('\n📊 System Statistics:');
  console.log('─'.repeat(60));
  
  try {
    const [userCount, patientCount, orderCount, clinicCount] = await Promise.all([
      prisma.user.count(),
      prisma.patient.count(),
      prisma.order.count(),
      prisma.clinic.count(),
    ]);
    
    console.log(`  Total users: ${userCount}`);
    console.log(`  Total patients: ${patientCount}`);
    console.log(`  Total orders: ${orderCount}`);
    console.log(`  Total clinics: ${clinicCount}`);
    
    // Today's activity
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [newPatientsToday, newOrdersToday] = await Promise.all([
      prisma.patient.count({ where: { createdAt: { gte: today } } }),
      prisma.order.count({ where: { createdAt: { gte: today } } }),
    ]);
    
    console.log(`\n  Today's activity:`);
    console.log(`    New patients: ${newPatientsToday}`);
    console.log(`    New orders: ${newOrdersToday}`);
    
  } catch (error) {
    console.log(`  Error fetching stats: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}

async function main() {
  console.log('🔍 Production Monitoring Check');
  console.log('═'.repeat(60));
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`App URL: ${APP_URL}`);
  
  // Health checks
  console.log('\n🏥 Health Checks:');
  console.log('─'.repeat(60));
  
  const checks: HealthCheck[] = await Promise.all([
    checkEndpoint(`${APP_URL}/api/health`, 'API Health'),
    checkEndpoint(`${APP_URL}/api/monitoring/ready`, 'Readiness'),
    checkDatabase(),
  ]);
  
  for (const check of checks) {
    const icon = check.status === 'ok' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
    const latencyStr = check.latency ? ` (${check.latency}ms)` : '';
    console.log(`  ${icon} ${check.name}: ${check.message}${latencyStr}`);
  }
  
  // System stats
  await getSystemStats();
  
  // Recent errors
  await getRecentErrors();
  
  // Summary
  const hasErrors = checks.some(c => c.status === 'error');
  const hasWarnings = checks.some(c => c.status === 'warning');
  
  console.log('\n' + '═'.repeat(60));
  if (hasErrors) {
    console.log('❌ STATUS: CRITICAL - Some services are down');
    process.exit(1);
  } else if (hasWarnings) {
    console.log('⚠️ STATUS: WARNING - Some services have issues');
    process.exit(0);
  } else {
    console.log('✅ STATUS: HEALTHY - All services operational');
    process.exit(0);
  }
}

main()
  .catch((error) => {
    console.error('Monitor script failed:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
