#!/usr/bin/env node
/**
 * Load Testing Script
 * Tests API endpoints under various load conditions
 * 
 * Usage: npx ts-node scripts/load-test.ts
 */

import fetch from 'node-fetch';

import { logger } from '../src/lib/logger';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3001';
const CONCURRENT_USERS = parseInt(process.env.CONCURRENT_USERS || '10', 10);
const REQUESTS_PER_USER = parseInt(process.env.REQUESTS_PER_USER || '10', 10);
const RAMP_UP_TIME = parseInt(process.env.RAMP_UP_TIME || '5', 10); // seconds

interface TestResult {
  endpoint: string;
  method: string;
  status: number;
  responseTime: number;
  success: boolean;
  error?: string;
}

interface TestSummary {
  endpoint: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  percentile95: number;
  percentile99: number;
  requestsPerSecond: number;
}

class LoadTester {
  private results: TestResult[] = [];
  private startTime: number = 0;
  private endTime: number = 0;

  /**
   * Test a single endpoint
   */
  async testEndpoint(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      const responseTime = Date.now() - startTime;
      
      return {
        endpoint,
        method: options.method || 'GET',
        status: response.status,
        responseTime,
        success: response.status >= 200 && response.status < 300,
      };
    } catch (error: any) {
      return {
        endpoint,
        method: options.method || 'GET',
        status: 0,
        responseTime: Date.now() - startTime,
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Run concurrent requests for a single user
   */
  async runUserSession(userId: number): Promise<void> {
    logger.info(`🚀 User ${userId} starting session...`);
    
    const endpoints = [
      { path: '/api/health', method: 'GET' },
      { path: '/api/ready', method: 'GET' },
      { path: '/api/patients', method: 'GET' },
      // Add more endpoints as needed
    ];

    for (let i = 0; i < REQUESTS_PER_USER; i++) {
      // Randomly select an endpoint
      const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
      
      const result = await this.testEndpoint(endpoint.path, {
        method: endpoint.method,
      });
      
      this.results.push(result);
      
      // Small delay between requests (100-500ms)
      await this.delay(100 + Math.random() * 400);
    }
    
    logger.info(`✅ User ${userId} completed session`);
  }

  /**
   * Run load test with ramping
   */
  async runLoadTest(): Promise<void> {
    logger.info('🏁 Starting load test...');
    logger.info(`📊 Configuration:`);
    logger.info(`   - Base URL: ${BASE_URL}`);
    logger.info(`   - Concurrent Users: ${CONCURRENT_USERS}`);
    logger.info(`   - Requests per User: ${REQUESTS_PER_USER}`);
    logger.info(`   - Ramp-up Time: ${RAMP_UP_TIME} seconds`);
    logger.info('');

    this.startTime = Date.now();

    const userPromises: Promise<void>[] = [];
    const delayBetweenUsers = (RAMP_UP_TIME * 1000) / CONCURRENT_USERS;

    // Start users with ramping
    for (let i = 1; i <= CONCURRENT_USERS; i++) {
      const userPromise = this.runUserSession(i);
      userPromises.push(userPromise);
      
      if (i < CONCURRENT_USERS) {
        await this.delay(delayBetweenUsers);
      }
    }

    // Wait for all users to complete
    await Promise.all(userPromises);
    
    this.endTime = Date.now();
    
    logger.info('\n✅ Load test completed!');
  }

  /**
   * Generate test summary
   */
  generateSummary(): Map<string, TestSummary> {
    const summaryMap = new Map<string, TestSummary>();
    const testDuration = (this.endTime - this.startTime) / 1000; // seconds

    // Group results by endpoint
    const groupedResults = new Map<string, TestResult[]>();
    
    for (const result of this.results) {
      const key = `${result.method} ${result.endpoint}`;
      if (!groupedResults.has(key)) {
        groupedResults.set(key, []);
      }
      groupedResults.get(key)!.push(result);
    }

    // Calculate statistics for each endpoint
    for (const [key, results] of groupedResults) {
      const responseTimes = results.map((r) => r.responseTime).sort((a, b) => a - b);
      const successCount = results.filter((r) => r.success).length;
      
      const summary: TestSummary = {
        endpoint: key,
        totalRequests: results.length,
        successfulRequests: successCount,
        failedRequests: results.length - successCount,
        averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
        minResponseTime: responseTimes[0],
        maxResponseTime: responseTimes[responseTimes.length - 1],
        percentile95: responseTimes[Math.floor(responseTimes.length * 0.95)],
        percentile99: responseTimes[Math.floor(responseTimes.length * 0.99)],
        requestsPerSecond: results.length / testDuration,
      };
      
      summaryMap.set(key, summary);
    }

    return summaryMap;
  }

  /**
   * Print test results
   */
  printResults(): void {
    const summary = this.generateSummary();
    const testDuration = (this.endTime - this.startTime) / 1000;
    
    logger.info('\n' + '='.repeat(80));
    logger.info('📊 LOAD TEST RESULTS');
    logger.info('='.repeat(80));
    
    logger.info(`\n📈 Overall Statistics:`);
    logger.info(`   - Total Requests: ${this.results.length}`);
    logger.info(`   - Test Duration: ${testDuration.toFixed(2)} seconds`);
    logger.info(`   - Total Throughput: ${(this.results.length / testDuration).toFixed(2)} req/s`);
    
    const successRate = (this.results.filter((r) => r.success).length / this.results.length) * 100;
    logger.info(`   - Success Rate: ${successRate.toFixed(2)}%`);
    
    logger.info(`\n📊 Per-Endpoint Statistics:`);
    logger.info('-'.repeat(80));
    
    for (const [endpoint, stats] of summary) {
      logger.info(`\n📍 ${endpoint}`);
      logger.info(`   Requests: ${stats.totalRequests} (✅ ${stats.successfulRequests}, ❌ ${stats.failedRequests})`);
      logger.info(`   Response Times:`);
      logger.info(`     - Average: ${stats.averageResponseTime.toFixed(2)}ms`);
      logger.info(`     - Min: ${stats.minResponseTime}ms`);
      logger.info(`     - Max: ${stats.maxResponseTime}ms`);
      logger.info(`     - P95: ${stats.percentile95}ms`);
      logger.info(`     - P99: ${stats.percentile99}ms`);
      logger.info(`   Throughput: ${stats.requestsPerSecond.toFixed(2)} req/s`);
    }
    
    // Check for performance issues
    logger.info('\n' + '='.repeat(80));
    logger.info('🎯 Performance Analysis:');
    logger.info('-'.repeat(80));
    
    let hasIssues = false;
    
    for (const [endpoint, stats] of summary) {
      const issues: string[] = [];
      
      if (stats.failedRequests > 0) {
        issues.push(`❌ ${stats.failedRequests} failed requests`);
        hasIssues = true;
      }
      
      if (stats.averageResponseTime > 1000) {
        issues.push(`⚠️  Average response time > 1s (${stats.averageResponseTime.toFixed(0)}ms)`);
        hasIssues = true;
      }
      
      if (stats.percentile95 > 2000) {
        issues.push(`⚠️  P95 response time > 2s (${stats.percentile95}ms)`);
        hasIssues = true;
      }
      
      if (issues.length > 0) {
        logger.info(`\n${endpoint}:`);
        issues.forEach((issue) => logger.info(`  ${issue}`));
      }
    }
    
    if (!hasIssues) {
      logger.info('\n✅ All endpoints performing within acceptable parameters!');
    }
    
    logger.info('\n' + '='.repeat(80));
  }

  /**
   * Helper to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  const tester = new LoadTester();
  
  try {
    await tester.runLoadTest();
    tester.printResults();
  } catch (error) {
    logger.error('❌ Load test failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { LoadTester };
