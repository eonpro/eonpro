import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IntegrationAdapter } from '@/lib/integrations/adapter';
import {
  registerAdapter,
  getAdapter,
  checkAllHealth,
  WEBHOOK_SOURCES,
} from '@/lib/integrations/adapter';

function createMockAdapter(overrides: Partial<IntegrationAdapter> = {}): IntegrationAdapter {
  return {
    name: 'mock-adapter',
    version: '1.0.0',
    isConfigured: vi.fn().mockReturnValue(true),
    healthCheck: vi.fn().mockResolvedValue({
      healthy: true,
      latencyMs: 10,
      lastChecked: new Date(),
    }),
    ...overrides,
  };
}

describe('adapter registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registerAdapter + getAdapter stores and retrieves adapters', () => {
    const adapter = createMockAdapter({ name: 'test-storage' });
    registerAdapter('test-storage', adapter);
    const retrieved = getAdapter<IntegrationAdapter>('test-storage');
    expect(retrieved).toBe(adapter);
    expect(retrieved?.name).toBe('test-storage');
  });

  it('getAdapter returns undefined for unregistered names', () => {
    const result = getAdapter('nonexistent-adapter-xyz-123');
    expect(result).toBeUndefined();
  });

  it('checkAllHealth aggregates results from all adapters', async () => {
    const adapterA = createMockAdapter({
      name: 'agg-adapter-a',
      healthCheck: vi.fn().mockResolvedValue({
        healthy: true,
        latencyMs: 5,
        lastChecked: new Date(),
      }),
    });
    const adapterB = createMockAdapter({
      name: 'agg-adapter-b',
      healthCheck: vi.fn().mockResolvedValue({
        healthy: true,
        latencyMs: 20,
        message: 'ok',
        lastChecked: new Date(),
      }),
    });
    registerAdapter('agg-adapter-a', adapterA);
    registerAdapter('agg-adapter-b', adapterB);

    const results = await checkAllHealth();

    expect(results['agg-adapter-a']).toBeDefined();
    expect(results['agg-adapter-a'].healthy).toBe(true);
    expect(results['agg-adapter-a'].latencyMs).toBe(5);
    expect(results['agg-adapter-b']).toBeDefined();
    expect(results['agg-adapter-b'].healthy).toBe(true);
    expect(results['agg-adapter-b'].latencyMs).toBe(20);
    expect(results['agg-adapter-b'].message).toBe('ok');
  });

  it('checkAllHealth handles adapter health check failures gracefully', async () => {
    const failingAdapter = createMockAdapter({
      name: 'failing-adapter',
      healthCheck: vi.fn().mockRejectedValue(new Error('Connection refused')),
    });
    registerAdapter('failing-adapter', failingAdapter);

    const results = await checkAllHealth();

    expect(results['failing-adapter']).toBeDefined();
    expect(results['failing-adapter'].healthy).toBe(false);
    expect(results['failing-adapter'].message).toBe('Health check threw an exception');
    expect(results['failing-adapter'].lastChecked).toBeInstanceOf(Date);
  });

  it('WEBHOOK_SOURCES has stripe, lifefile, terra configs', () => {
    expect(WEBHOOK_SOURCES.stripe).toBeDefined();
    expect(WEBHOOK_SOURCES.lifefile).toBeDefined();
    expect(WEBHOOK_SOURCES.terra).toBeDefined();
  });

  it('each WEBHOOK_SOURCES entry has required source field', () => {
    for (const [key, config] of Object.entries(WEBHOOK_SOURCES)) {
      expect(config.source).toBeDefined();
      expect(typeof config.source).toBe('string');
      expect(config.source).not.toBe('');
    }
  });
});
