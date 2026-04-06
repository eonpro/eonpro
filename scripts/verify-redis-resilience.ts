/**
 * Redis resilience verification runner.
 *
 * Probes /api/monitoring/ready over a configurable window and enforces SLO gates:
 * - Redis status must not be degraded/down
 * - Redis SLO gate breach count must be zero
 * - Endpoint error rate under threshold
 */

type ReadyCheck = {
  status?: string;
  timestamp?: string;
  checks?: Record<string, { status?: string; error?: string }>;
};

interface ProbeResult {
  ok: boolean;
  httpStatus: number;
  redisStatus: string;
  redisError: string;
  latencyMs: number;
}

const BASE_URL = process.env.API_URL || process.env.NEXT_PUBLIC_APP_URL || '';
const WINDOW_SECONDS = parseInt(process.env.REDIS_VERIFY_WINDOW_SECONDS ?? '120', 10);
const INTERVAL_MS = parseInt(process.env.REDIS_VERIFY_INTERVAL_MS ?? '5000', 10);
const MAX_ENDPOINT_ERROR_RATE = parseFloat(process.env.REDIS_VERIFY_MAX_ENDPOINT_ERROR_RATE ?? '0.02');
const ALLOW_DEGRADED = process.env.REDIS_VERIFY_ALLOW_DEGRADED === 'true';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeOnce(baseUrl: string): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const response = await fetch(`${baseUrl}/api/monitoring/ready`, { redirect: 'manual' });
    const body = (await response.json().catch(() => ({}))) as ReadyCheck;
    const redisStatus = body.checks?.redis?.status ?? 'unknown';
    const redisError = body.checks?.redis?.error ?? '';
    const latencyMs = Date.now() - start;
    return {
      ok: response.ok,
      httpStatus: response.status,
      redisStatus,
      redisError,
      latencyMs,
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: 0,
      redisStatus: 'error',
      redisError: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - start,
    };
  }
}

async function main(): Promise<void> {
  if (!BASE_URL) {
    throw new Error('API_URL or NEXT_PUBLIC_APP_URL is required');
  }

  const endAt = Date.now() + WINDOW_SECONDS * 1000;
  const probes: ProbeResult[] = [];
  // eslint-disable-next-line no-console
  console.log(`[redis-verify] base=${BASE_URL} window=${WINDOW_SECONDS}s interval=${INTERVAL_MS}ms`);

  while (Date.now() < endAt) {
    const result = await probeOnce(BASE_URL);
    probes.push(result);
    // eslint-disable-next-line no-console
    console.log(
      `[redis-verify] status=${result.httpStatus} redis=${result.redisStatus} latency=${result.latencyMs}ms` +
        (result.redisError ? ` error="${result.redisError}"` : ''),
    );
    await sleep(INTERVAL_MS);
  }

  const total = probes.length;
  const endpointErrors = probes.filter((p) => !p.ok).length;
  const degraded = probes.filter((p) => p.redisStatus === 'degraded' || p.redisStatus === 'down').length;
  const endpointErrorRate = total > 0 ? endpointErrors / total : 1;
  const avgLatency =
    total > 0 ? Math.round(probes.reduce((sum, p) => sum + p.latencyMs, 0) / total) : 0;

  // eslint-disable-next-line no-console
  console.log('\n[redis-verify] summary');
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        totalProbes: total,
        endpointErrors,
        endpointErrorRate,
        redisDegradedOrDown: degraded,
        avgLatencyMs: avgLatency,
      },
      null,
      2,
    ),
  );

  const failures: string[] = [];
  if (endpointErrorRate > MAX_ENDPOINT_ERROR_RATE) {
    failures.push(
      `endpoint error rate ${(endpointErrorRate * 100).toFixed(2)}% > ${(MAX_ENDPOINT_ERROR_RATE * 100).toFixed(2)}%`,
    );
  }
  if (!ALLOW_DEGRADED && degraded > 0) {
    failures.push(`redis degraded/down probes ${degraded} > 0`);
  }

  if (failures.length > 0) {
    // eslint-disable-next-line no-console
    console.error('[redis-verify] FAILED');
    failures.forEach((f) => {
      // eslint-disable-next-line no-console
      console.error(` - ${f}`);
    });
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log('[redis-verify] PASSED');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[redis-verify] fatal', err);
  process.exit(1);
});
