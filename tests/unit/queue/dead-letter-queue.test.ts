import { beforeEach, describe, expect, it, vi } from 'vitest';

const hscanMock = vi.hoisted(() => vi.fn());
const hgetallMock = vi.hoisted(() => vi.fn());
const hsetMock = vi.hoisted(() => vi.fn());
const hincrbyMock = vi.hoisted(() => vi.fn());
const hgetMock = vi.hoisted(() => vi.fn());
const hdelMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/cache/redis', () => ({
  default: {
    isReady: () => true,
    withClient: async <T>(
      _label: string,
      fallback: T,
      operation: (redis: {
        hscan: typeof hscanMock;
        hgetall: typeof hgetallMock;
        hset: typeof hsetMock;
        hincrby: typeof hincrbyMock;
        hget: typeof hgetMock;
        hdel: typeof hdelMock;
      }) => Promise<T>
    ) => {
      try {
        return await operation({
          hscan: hscanMock,
          hgetall: hgetallMock,
          hset: hsetMock,
          hincrby: hincrbyMock,
          hget: hgetMock,
          hdel: hdelMock,
        });
      } catch {
        return fallback;
      }
    },
  },
}));

describe('DeadLetterQueue scan-based reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads all submissions using paged HSCAN', async () => {
    const now = Date.now();
    hscanMock
      .mockResolvedValueOnce([
        '1',
        [
          'a',
          JSON.stringify({
            id: 'a',
            payload: {},
            source: 'direct',
            attemptCount: 0,
            lastAttemptAt: new Date(now).toISOString(),
            lastError: 'none',
            nextRetryAt: new Date(now - 1000).toISOString(),
            createdAt: new Date(now - 10_000).toISOString(),
          }),
        ],
      ])
      .mockResolvedValueOnce([
        '0',
        [
          'b',
          JSON.stringify({
            id: 'b',
            payload: {},
            source: 'direct',
            attemptCount: 1,
            lastAttemptAt: new Date(now).toISOString(),
            lastError: 'retry',
            nextRetryAt: new Date(now + 1000).toISOString(),
            createdAt: new Date(now - 20_000).toISOString(),
          }),
        ],
      ]);

    const { getAllSubmissions } = await import('@/lib/queue/deadLetterQueue');
    const rows = await getAllSubmissions();

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(hscanMock).toHaveBeenCalledTimes(2);
  });

  it('filters only retry-ready rows in getReadySubmissions', async () => {
    const now = Date.now();
    hscanMock.mockResolvedValueOnce([
      '0',
      [
        'ready',
        JSON.stringify({
          id: 'ready',
          payload: {},
          source: 'direct',
          attemptCount: 2,
          lastAttemptAt: new Date(now).toISOString(),
          lastError: 'x',
          nextRetryAt: new Date(now - 1000).toISOString(),
          createdAt: new Date(now - 10_000).toISOString(),
        }),
        'not-ready',
        JSON.stringify({
          id: 'not-ready',
          payload: {},
          source: 'direct',
          attemptCount: 2,
          lastAttemptAt: new Date(now).toISOString(),
          lastError: 'x',
          nextRetryAt: new Date(now + 60_000).toISOString(),
          createdAt: new Date(now - 10_000).toISOString(),
        }),
      ],
    ]);

    const { getReadySubmissions } = await import('@/lib/queue/deadLetterQueue');
    const rows = await getReadySubmissions();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('ready');
  });
});
