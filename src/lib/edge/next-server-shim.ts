/**
 * Edge-safe NextRequest/NextResponse shim.
 *
 * This is the ONLY file in src/ permitted to import from next/dist/*.
 * The next/server barrel loads user-agent/ua-parser-js (uses __dirname),
 * which fails in Edge runtime. We import from internal paths to avoid that.
 *
 * ESLint: no-restricted-imports allows next/dist/* only in this file.
 */
export { NextRequest } from 'next/dist/server/web/spec-extension/request';
export { NextResponse } from 'next/dist/server/web/spec-extension/response';
