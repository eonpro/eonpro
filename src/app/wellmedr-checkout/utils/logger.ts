function sanitize(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.message;
  return '[object]';
}

export const logger = {
  log: (...args: unknown[]) => console.log(...args.map(sanitize)),
  error: (...args: unknown[]) => console.error(...args.map(sanitize)),
  warn: (...args: unknown[]) => console.warn(...args.map(sanitize)),
  info: (...args: unknown[]) => console.info(...args.map(sanitize)),
};
