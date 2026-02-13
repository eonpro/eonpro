# Middleware Edge Runtime

**Current (Feb 2026):** Middleware uses **zero Next.js imports**. Uses only Web APIs (`Request`, `Response`, `URL`) and `jose` to avoid the `next/server` → `user-agent` → `ua-parser-js` (`__dirname`) chain.

Previous approach: Middleware imports only from `src/lib/edge/*`:
- `@/lib/edge/next-server-shim` – NextRequest, NextResponse (avoids next/server barrel loading ua-parser-js)
- `@/lib/edge/clinic` – clinicMiddleware, host resolution, JWT verification

Do not import from `next/server` or `next/dist/*` in middleware. Use the edge shim instead.
