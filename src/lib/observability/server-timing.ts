/**
 * Server-Timing header utility for production performance profiling.
 *
 * Usage:
 *   const timing = createServerTiming();
 *   await timing.measure('db', () => prisma.patient.findFirst(...));
 *   await timing.measure('auth', () => verifyToken(token));
 *   return NextResponse.json(data, { headers: timing.headers() });
 *
 * Results appear in the browser Network tab under "Server-Timing" and in
 * Vercel's function logs via the response header.
 */

export interface ServerTiming {
  measure: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
  mark: (name: string, durationMs: number) => void;
  headers: () => Record<string, string>;
}

export function createServerTiming(): ServerTiming {
  const entries: { name: string; dur: number }[] = [];

  return {
    async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
      const start = performance.now();
      try {
        return await fn();
      } finally {
        entries.push({ name, dur: Math.round(performance.now() - start) });
      }
    },

    mark(name: string, durationMs: number) {
      entries.push({ name, dur: Math.round(durationMs) });
    },

    headers(): Record<string, string> {
      if (entries.length === 0) return {};
      const value = entries.map((e) => `${e.name};dur=${e.dur}`).join(', ');
      return { 'Server-Timing': value };
    },
  };
}
