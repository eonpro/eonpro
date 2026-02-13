import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyAuth } from '@/lib/auth/middleware';

/**
 * AI Health Check Endpoint
 * GET /api/ai/health - Check OpenAI connectivity and configuration
 *
 * This endpoint tests:
 * 1. OpenAI API key configuration
 * 2. Model availability
 * 3. Simple completion test
 * 4. Rate limit status
 */

interface AIHealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    apiKeyConfigured: boolean;
    modelConfigured: string;
    apiConnectivity: 'connected' | 'failed' | 'not_tested';
    completionTest: 'passed' | 'failed' | 'not_tested';
    errorDetails?: string;
  };
  responseTime?: number;
  recommendations?: string[];
}

export async function GET(req: NextRequest) {
  const startTime = Date.now();

  // Require authentication for this endpoint
  const authResult = await verifyAuth(req);
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (!authResult.success && !isDevelopment) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const report: AIHealthReport = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      apiKeyConfigured: false,
      modelConfigured: 'not_set',
      apiConnectivity: 'not_tested',
      completionTest: 'not_tested',
    },
    recommendations: [],
  };

  try {
    // Check 1: API Key Configuration
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      report.status = 'unhealthy';
      report.checks.apiKeyConfigured = false;
      report.checks.errorDetails = 'OPENAI_API_KEY environment variable is not set';
      report.recommendations?.push('Set the OPENAI_API_KEY environment variable');

      return NextResponse.json(report, { status: 503 });
    }

    report.checks.apiKeyConfigured = true;

    // Check if API key format looks valid (starts with sk-)
    if (!apiKey.startsWith('sk-')) {
      report.status = 'degraded';
      report.recommendations?.push(
        'API key should start with "sk-". Verify it is correctly formatted.'
      );
    }

    // Check 2: Model Configuration
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    report.checks.modelConfigured = model;

    // Check 3: API Connectivity - List models
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({
      apiKey,
      organization: process.env.OPENAI_ORG_ID,
      timeout: 10000, // 10 second timeout for health check
    });

    try {
      await openai.models.list();
      report.checks.apiConnectivity = 'connected';
    } catch (connectError: any) {
      report.status = 'unhealthy';
      report.checks.apiConnectivity = 'failed';
      report.checks.errorDetails = `API connectivity failed: ${connectError.message}`;

      if (connectError.status === 401) {
        report.recommendations?.push(
          'API key is invalid or expired. Generate a new key at https://platform.openai.com/api-keys'
        );
      } else if (connectError.status === 429) {
        report.recommendations?.push(
          'Rate limit exceeded. Check your OpenAI usage at https://platform.openai.com/usage'
        );
      } else if (connectError.code === 'ECONNREFUSED' || connectError.code === 'ENOTFOUND') {
        report.recommendations?.push(
          'Network connectivity issue. Check if the server can reach api.openai.com'
        );
      }

      report.responseTime = Date.now() - startTime;
      return NextResponse.json(report, { status: 503 });
    }

    // Check 4: Simple Completion Test
    const { searchParams } = new URL(req.url);
    const runCompletionTest = searchParams.get('test') === 'true';

    if (runCompletionTest) {
      try {
        const testResponse = await openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: 'You are a health check assistant. Reply with exactly: OK' },
            { role: 'user', content: 'Health check' },
          ],
          max_completion_tokens: 10,
          temperature: 0,
        });

        const reply = testResponse.choices[0]?.message?.content?.trim();
        if (reply?.includes('OK')) {
          report.checks.completionTest = 'passed';
        } else {
          report.checks.completionTest = 'failed';
          report.status = 'degraded';
          report.recommendations?.push(`Unexpected response from model: "${reply}"`);
        }
      } catch (completionError: any) {
        report.checks.completionTest = 'failed';
        report.status = 'degraded';

        if (completionError.code === 'insufficient_quota') {
          report.checks.errorDetails = 'OpenAI quota exceeded';
          report.recommendations?.push(
            'Your OpenAI account has exceeded its quota. Add payment method or upgrade plan.'
          );
        } else if (completionError.status === 429) {
          report.checks.errorDetails = 'Rate limited during completion test';
          report.recommendations?.push('Too many requests. Wait a moment and try again.');
        } else {
          report.checks.errorDetails = `Completion test failed: ${completionError.message}`;
        }
      }
    }

    // Final status assessment
    if (report.checks.apiConnectivity === 'connected' && report.status !== 'degraded') {
      report.status = 'healthy';
    }

    // Remove empty recommendations
    if (report.recommendations?.length === 0) {
      delete report.recommendations;
    }

    report.responseTime = Date.now() - startTime;

    logger.info('[AI Health] Health check completed', {
      status: report.status,
      responseTime: report.responseTime,
    });

    return NextResponse.json(report, {
      status: report.status === 'unhealthy' ? 503 : 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error: any) {
    logger.error('[AI Health] Health check failed', { error: error.message });

    report.status = 'unhealthy';
    report.checks.errorDetails = error.message;
    report.responseTime = Date.now() - startTime;

    return NextResponse.json(report, { status: 503 });
  }
}
