#!/usr/bin/env tsx
/**
 * API Endpoints Audit Script
 * 
 * Finds all fetch() calls to /api/ endpoints and cross-references
 * them with actual route.ts files to identify missing routes.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { glob } from 'glob';

interface EndpointCall {
  file: string;
  line: number;
  endpoint: string;
  method?: string;
}

interface RouteFile {
  path: string;
  endpoint: string;
  methods: string[];
}

// Extract endpoint from fetch call
function extractEndpointFromLine(line: string, filePath: string): string | null {
  // Match fetch('/api/...') or fetch("/api/...") or fetch(`/api/...`)
  const fetchMatch = line.match(/fetch\(['"`]([^'"`]+)['"`]/);
  if (!fetchMatch) return null;
  
  const url = fetchMatch[1];
  if (!url.startsWith('/api/')) return null;
  
  // Remove query parameters
  const endpoint = url.split('?')[0];
  
  // Handle template literals with variables (e.g., `/api/tickets/${id}`)
  // Replace ${...} with [id] pattern
  const normalized = endpoint.replace(/\$\{[^}]+\}/g, '[id]');
  
  return normalized;
}

// Extract HTTP method from fetch call
function extractMethod(line: string, context: string[]): string | undefined {
  const methodMatch = line.match(/method:\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]/i);
  if (methodMatch) return methodMatch[1].toUpperCase();
  
  // Check surrounding lines for method
  const contextStr = context.join('\n');
  const methodInContext = contextStr.match(/method:\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]/i);
  if (methodInContext) return methodInContext[1].toUpperCase();
  
  return undefined;
}

// Find all fetch calls
function findFetchCalls(rootDir: string): EndpointCall[] {
  const calls: EndpointCall[] = [];
  const srcDir = join(rootDir, 'src');
  
  // Search for TypeScript/TSX files
  const files = glob.sync('**/*.{ts,tsx}', {
    cwd: srcDir,
    ignore: ['**/node_modules/**', '**/*.test.ts', '**/*.spec.ts', '**/api/**'],
  });
  
  for (const file of files) {
    const filePath = join(srcDir, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('fetch(') && line.includes('/api/')) {
          const endpoint = extractEndpointFromLine(line, filePath);
          if (endpoint) {
            const context = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 10));
            const method = extractMethod(line, context);
            calls.push({
              file: filePath,
              line: i + 1,
              endpoint,
              method,
            });
          }
        }
      }
    } catch (err) {
      // Skip files that can't be read
    }
  }
  
  return calls;
}

// Find all route files
function findRouteFiles(rootDir: string): RouteFile[] {
  const routes: RouteFile[] = [];
  const apiDir = join(rootDir, 'src', 'app', 'api');
  
  if (!existsSync(apiDir)) return routes;
  
  function walkDir(dir: string, basePath: string = ''): void {
    const entries = readdirSync(dir);
    
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        const newBase = basePath ? `${basePath}/${entry}` : entry;
        walkDir(fullPath, newBase);
      } else if (entry === 'route.ts') {
        const endpoint = `/api/${basePath}`;
        const content = readFileSync(fullPath, 'utf-8');
        const methods: string[] = [];
        
        // Extract exported HTTP methods
        if (content.includes('export const GET')) methods.push('GET');
        if (content.includes('export const POST')) methods.push('POST');
        if (content.includes('export const PUT')) methods.push('PUT');
        if (content.includes('export const PATCH')) methods.push('PATCH');
        if (content.includes('export const DELETE')) methods.push('DELETE');
        
        routes.push({
          path: fullPath,
          endpoint,
          methods,
        });
      }
    }
  }
  
  walkDir(apiDir);
  return routes;
}

// Normalize endpoint for comparison
function normalizeEndpoint(endpoint: string): string {
  // Remove trailing slashes
  let normalized = endpoint.replace(/\/$/, '');
  
  // Normalize dynamic segments
  normalized = normalized.replace(/\/\d+/g, '/[id]');
  normalized = normalized.replace(/\/[a-f0-9-]{36}/gi, '/[id]'); // UUIDs
  
  return normalized;
}

// Check if endpoint exists
function endpointExists(call: EndpointCall, routes: RouteFile[]): { exists: boolean; route?: RouteFile; methodMatch?: boolean } {
  const normalizedCall = normalizeEndpoint(call.endpoint);
  
  for (const route of routes) {
    const normalizedRoute = normalizeEndpoint(route.endpoint);
    
    if (normalizedCall === normalizedRoute) {
      const methodMatch = !call.method || route.methods.includes(call.method);
      return { exists: true, route, methodMatch };
    }
  }
  
  return { exists: false };
}

// Main audit function
function auditEndpoints(rootDir: string) {
  console.log('🔍 Scanning for fetch() calls to /api/ endpoints...\n');
  const calls = findFetchCalls(rootDir);
  console.log(`Found ${calls.length} fetch() calls\n`);
  
  console.log('🔍 Scanning for route.ts files...\n');
  const routes = findRouteFiles(rootDir);
  console.log(`Found ${routes.length} route files\n`);
  
  // Group calls by endpoint
  const callsByEndpoint = new Map<string, EndpointCall[]>();
  for (const call of calls) {
    const normalized = normalizeEndpoint(call.endpoint);
    if (!callsByEndpoint.has(normalized)) {
      callsByEndpoint.set(normalized, []);
    }
    callsByEndpoint.get(normalized)!.push(call);
  }
  
  // Check each endpoint
  const missing: Array<{ endpoint: string; calls: EndpointCall[] }> = [];
  const methodMismatches: Array<{ endpoint: string; call: EndpointCall; route: RouteFile }> = [];
  const found: Array<{ endpoint: string; route: RouteFile }> = [];
  
  for (const [endpoint, endpointCalls] of callsByEndpoint.entries()) {
    const firstCall = endpointCalls[0];
    const check = endpointExists(firstCall, routes);
    
    if (!check.exists) {
      missing.push({ endpoint, calls: endpointCalls });
    } else if (check.route && !check.methodMatch && firstCall.method) {
      methodMismatches.push({ endpoint, call: firstCall, route: check.route });
    } else {
      found.push({ endpoint, route: check.route! });
    }
  }
  
  // Print report
  console.log('='.repeat(80));
  console.log('API ENDPOINTS AUDIT REPORT');
  console.log('='.repeat(80));
  console.log();
  
  if (missing.length > 0) {
    console.log(`❌ MISSING ROUTES (${missing.length}):`);
    console.log('-'.repeat(80));
    for (const { endpoint, calls } of missing) {
      console.log(`\n  ${endpoint}`);
      console.log(`  Called from:`);
      for (const call of calls) {
        const relPath = relative(rootDir, call.file);
        console.log(`    - ${relPath}:${call.line}${call.method ? ` (${call.method})` : ''}`);
      }
    }
    console.log();
  }
  
  if (methodMismatches.length > 0) {
    console.log(`⚠️  METHOD MISMATCHES (${methodMismatches.length}):`);
    console.log('-'.repeat(80));
    for (const { endpoint, call, route } of methodMismatches) {
      const relPath = relative(rootDir, call.file);
      console.log(`\n  ${endpoint}`);
      console.log(`  Called as: ${call.method}`);
      console.log(`  Available methods: ${route.methods.join(', ') || 'none'}`);
      console.log(`  From: ${relPath}:${call.line}`);
    }
    console.log();
  }
  
  if (missing.length === 0 && methodMismatches.length === 0) {
    console.log('✅ All endpoints have corresponding route files!');
    console.log();
  }
  
  console.log(`📊 Summary:`);
  console.log(`   Total fetch() calls: ${calls.length}`);
  console.log(`   Unique endpoints called: ${callsByEndpoint.size}`);
  console.log(`   Route files found: ${routes.length}`);
  console.log(`   Missing routes: ${missing.length}`);
  console.log(`   Method mismatches: ${methodMismatches.length}`);
  console.log(`   Found routes: ${found.length}`);
  console.log();
  
  return { missing, methodMismatches, found };
}

// Run audit
const rootDir = process.cwd();
auditEndpoints(rootDir);
