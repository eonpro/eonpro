import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisState = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  sets: new Map<string, Set<string>>(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));

vi.mock('jose', () => ({
  jwtVerify: vi.fn(),
}));

vi.mock('@/lib/auth/config', () => ({
  JWT_SECRET: new TextEncoder().encode('test-secret'),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({
  basePrisma: {},
}));

vi.mock('@/lib/auth/middleware-cache', () => ({
  resolveSubdomainClinicId: vi.fn(async () => null),
  hasClinicAccess: vi.fn(async () => true),
}));

vi.mock('@/lib/cache/redis', () => {
  const fullKey = (key: string, namespace?: string) => `${namespace ?? 'lifefile'}:${key}`;
  const redis = {
    get: async (key: string) => redisState.kv.get(key) ?? null,
    set: async (key: string, value: unknown) => {
      redisState.kv.set(key, value);
      return 'OK';
    },
    del: async (...keys: string[]) => {
      let deleted = 0;
      for (const key of keys) {
        if (redisState.kv.delete(key)) deleted += 1;
        if (redisState.sets.delete(key)) deleted += 1;
      }
      return deleted;
    },
    sadd: async (key: string, member: string, ...members: string[]) => {
      const set = redisState.sets.get(key) ?? new Set<string>();
      set.add(member);
      for (const m of members) set.add(m);
      redisState.sets.set(key, set);
      return set.size;
    },
    srem: async (key: string, member: string, ...members: string[]) => {
      const set = redisState.sets.get(key) ?? new Set<string>();
      let removed = 0;
      if (set.delete(member)) removed += 1;
      for (const m of members) {
        if (set.delete(m)) removed += 1;
      }
      redisState.sets.set(key, set);
      return removed;
    },
    scard: async (key: string) => (redisState.sets.get(key) ?? new Set()).size,
    smembers: async (key: string) => Array.from(redisState.sets.get(key) ?? []),
    expire: async () => 1,
  };

  return {
    default: {
      isReady: () => true,
      set: async (key: string, value: unknown, options?: { namespace?: string }) => {
        redisState.kv.set(fullKey(key, options?.namespace), value);
        return true;
      },
      get: async <T>(key: string, options?: { namespace?: string }) =>
        (redisState.kv.get(fullKey(key, options?.namespace)) as T | undefined) ?? null,
      delete: async (key: string, options?: { namespace?: string }) =>
        redisState.kv.delete(fullKey(key, options?.namespace)),
      withClient: async <T>(_: string, fallback: T, operation: (client: typeof redis) => Promise<T>) => {
        try {
          return await operation(redis);
        } catch {
          return fallback;
        }
      },
    },
  };
});

describe('SessionStore Redis index hardening', () => {
  beforeEach(() => {
    redisState.kv.clear();
    redisState.sets.clear();
  });

  it('keeps concurrent session adds in set-backed index', async () => {
    const { sessionStore } = await import('@/lib/auth/session');

    const now = Date.now();
    const mkSession = (sessionId: string) => ({
      id: 101,
      email: 'provider@example.com',
      name: 'Provider User',
      role: 'provider' as const,
      sessionId,
      expiresAt: new Date(now + 86_400_000),
    });

    await Promise.all([sessionStore.add(mkSession('s1')), sessionStore.add(mkSession('s2'))]);
    const sessions = await sessionStore.getUserSessions(101);
    const ids = new Set(sessions.map((s) => s.sessionId));

    expect(ids.has('s1')).toBe(true);
    expect(ids.has('s2')).toBe(true);
    expect(redisState.sets.get('sessions:user_sessions_set:101')?.size).toBe(2);
  });

  it('reads legacy list + set index for backward compatibility', async () => {
    const { sessionStore } = await import('@/lib/auth/session');

    redisState.kv.set('sessions:user_sessions:202', ['legacy-1']);
    redisState.sets.set('sessions:user_sessions_set:202', new Set(['set-1']));
    redisState.kv.set('sessions:session:legacy-1', {
      id: 202,
      email: 'legacy@example.com',
      name: 'Legacy Session',
      role: 'staff',
      sessionId: 'legacy-1',
      expiresAt: new Date(Date.now() + 60_000),
    });
    redisState.kv.set('sessions:session:set-1', {
      id: 202,
      email: 'set@example.com',
      name: 'Set Session',
      role: 'staff',
      sessionId: 'set-1',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const sessions = await sessionStore.getUserSessions(202);
    const ids = new Set(sessions.map((s) => s.sessionId));

    expect(ids.has('legacy-1')).toBe(true);
    expect(ids.has('set-1')).toBe(true);
  });
});
