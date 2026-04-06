#!/usr/bin/env tsx
/**
 * Performance Baseline Probe
 *
 * Day 1 baseline helper:
 * - probes configured endpoints repeatedly
 * - computes latency stats (p50/p95/p99), success/error rate
 * - adds a lightweight DB contribution proxy from route source (DB call-site count)
 * - emits JSON report and top-slowest ranking
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

type HttpMethod = 'GET' | 'POST';

interface EndpointConfig {
  name?: string;
  path: string;
  method: HttpMethod;
  routeFile?: string;
  requiresSetupSecret?: boolean;
  headers?: Record<string, string>;
}

interface ProbeResult {
  endpoint: string;
  status: number;
  durationMs: number;
  ok: boolean;
  error?: string;
}

interface EndpointReport {
  endpoint: string;
  name?: string;
  totalRequests: number;
  successRate: number;
  errorRate: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  avgMs: number;
  maxMs: number;
  minMs: number;
  dbCallSites: number;
  statusCodeCounts: Record<string, number>;
  authFailureRate: number;
}

const BASE_URL = (process.env.API_URL || 'http://localhost:3001').replace(/\/$/, '');
const SAMPLES_PER_ENDPOINT = parseInt(process.env.BASELINE_SAMPLES || '20', 10);
const CONCURRENCY = parseInt(process.env.BASELINE_CONCURRENCY || '5', 10);
const REQUEST_TIMEOUT_MS = parseInt(process.env.BASELINE_TIMEOUT_MS || '12000', 10);
const OUTPUT_PATH = process.env.BASELINE_OUTPUT_PATH || 'docs/PERFORMANCE_BASELINE_REPORT.json';
const setupSecret = process.env.ADMIN_SETUP_SECRET || process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET || '';
const authBearer = process.env.BASELINE_AUTH_BEARER_TOKEN || '';
const endpointConfigJson = process.env.BASELINE_ENDPOINTS_JSON || '';
const extraHeadersJson = process.env.BASELINE_EXTRA_HEADERS_JSON || '';

const DEFAULT_ENDPOINTS: EndpointConfig[] = [
  {
    name: 'health',
    path: '/api/health',
    method: 'GET',
    routeFile: 'src/app/api/health/route.ts',
  },
  {
    name: 'ready',
    path: '/api/monitoring/ready',
    method: 'GET',
    routeFile: 'src/app/api/monitoring/ready/route.ts',
  },
  {
    name: 'stripePublishableKey',
    path: '/api/stripe/publishable-key',
    method: 'GET',
    routeFile: 'src/app/api/stripe/publishable-key/route.ts',
  },
  {
    name: 'patientPortalBranding',
    path: '/api/patient-portal/branding',
    method: 'GET',
    routeFile: 'src/app/api/patient-portal/branding/route.ts',
  },
  {
    name: 'webhookStatus',
    path: '/api/admin/webhook-status',
    method: 'GET',
    routeFile: 'src/app/api/admin/webhook-status/route.ts',
    requiresSetupSecret: true,
  },
];

function parseJsonObject(value: string): Record<string, string> {
  if (!value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === 'string' && typeof entry[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

function loadEndpoints(): EndpointConfig[] {
  if (!endpointConfigJson.trim()) return DEFAULT_ENDPOINTS;
  try {
    const parsed = JSON.parse(endpointConfigJson);
    if (!Array.isArray(parsed)) return DEFAULT_ENDPOINTS;
    const endpoints = parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        name: typeof item.name === 'string' ? item.name : undefined,
        path: typeof item.path === 'string' ? item.path : '',
        method: item.method === 'POST' ? 'POST' : 'GET',
        routeFile: typeof item.routeFile === 'string' ? item.routeFile : undefined,
        requiresSetupSecret: Boolean(item.requiresSetupSecret),
        headers: item.headers && typeof item.headers === 'object' ? item.headers : undefined,
      }))
      .filter((item) => item.path.startsWith('/api/'));
    return endpoints.length > 0 ? endpoints : DEFAULT_ENDPOINTS;
  } catch {
    return DEFAULT_ENDPOINTS;
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function countDbCallSites(routeFile?: string): number {
  if (!routeFile) return 0;
  try {
    const fullPath = resolve(process.cwd(), routeFile);
    const src = readFileSync(fullPath, 'utf8');
    const matches = src.match(
      /(prisma\.[a-zA-Z_]+\.)|(executeDbRead\()|(executeDbAuth\()|(executeDbCritical\()|(withReadFallback\()/g,
    );
    return matches?.length ?? 0;
  } catch {
    return 0;
  }
}

async function probeEndpoint(config: EndpointConfig): Promise<ProbeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${BASE_URL}${config.path}`;
  const start = Date.now();

  try {
    const headers: Record<string, string> = {
      ...parseJsonObject(extraHeadersJson),
      ...(config.headers ?? {}),
    };
    if (authBearer) {
      headers.Authorization = `Bearer ${authBearer}`;
    }
    if (config.requiresSetupSecret && setupSecret) {
      headers['x-setup-secret'] = setupSecret;
    }

    const response = await fetch(url, {
      method: config.method,
      headers,
      signal: controller.signal,
    });

    return {
      endpoint: config.path,
      status: response.status,
      durationMs: Date.now() - start,
      ok: response.ok,
    };
  } catch (error) {
    return {
      endpoint: config.path,
      status: 0,
      durationMs: Date.now() - start,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runEndpoint(config: EndpointConfig): Promise<EndpointReport> {
  const jobs = Array.from({ length: SAMPLES_PER_ENDPOINT }, () => config);
  const allResults: ProbeResult[] = [];

  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map((item) => probeEndpoint(item)));
    allResults.push(...batchResults);
  }

  const latencies = allResults.map((r) => r.durationMs).sort((a, b) => a - b);
  const successCount = allResults.filter((r) => r.ok).length;
  const authFailures = allResults.filter((r) => r.status === 401 || r.status === 403).length;
  const statusCodeCounts: Record<string, number> = {};
  allResults.forEach((r) => {
    const key = String(r.status);
    statusCodeCounts[key] = (statusCodeCounts[key] ?? 0) + 1;
  });

  return {
    endpoint: config.path,
    name: config.name,
    totalRequests: allResults.length,
    successRate: Number(((successCount / allResults.length) * 100).toFixed(2)),
    errorRate: Number((((allResults.length - successCount) / allResults.length) * 100).toFixed(2)),
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    p99Ms: percentile(latencies, 99),
    avgMs: Number(mean(latencies).toFixed(2)),
    maxMs: latencies[latencies.length - 1] ?? 0,
    minMs: latencies[0] ?? 0,
    dbCallSites: countDbCallSites(config.routeFile),
    statusCodeCounts,
    authFailureRate: Number(((authFailures / allResults.length) * 100).toFixed(2)),
  };
}

async function main(): Promise<void> {
  console.log('[baseline] starting performance baseline');
  console.log(`[baseline] base URL: ${BASE_URL}`);
  console.log(`[baseline] samples/endpoint: ${SAMPLES_PER_ENDPOINT}`);
  console.log(`[baseline] concurrency: ${CONCURRENCY}`);
  console.log(`[baseline] auth bearer: ${authBearer ? 'yes' : 'no'}`);
  console.log(`[baseline] admin secret: ${setupSecret ? 'yes' : 'no'}`);

  const endpoints = loadEndpoints();
  console.log(`[baseline] endpoint count: ${endpoints.length}`);
  const reports = await Promise.all(endpoints.map((ep) => runEndpoint(ep)));
  const slowest = [...reports].sort((a, b) => b.p95Ms - a.p95Ms).slice(0, 10);

  const payload = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    samplesPerEndpoint: SAMPLES_PER_ENDPOINT,
    concurrency: CONCURRENCY,
    endpoints: reports,
    topSlowEndpointsByP95: slowest,
  };

  const outputFile = resolve(process.cwd(), OUTPUT_PATH);
  writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf8');

  console.log('[baseline] top endpoints by p95');
  slowest.forEach((row, idx) => {
    console.log(
      `${idx + 1}. ${row.endpoint} | p95=${row.p95Ms}ms | err=${row.errorRate}% | authFail=${row.authFailureRate}% | dbCallSites=${row.dbCallSites}`,
    );
  });
  console.log(`[baseline] report written: ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error('[baseline] failed', error);
  process.exit(1);
});
