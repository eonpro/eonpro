#!/usr/bin/env tsx
/**
 * Enhanced API Endpoints Audit Script
 * 
 * Finds all fetch() calls to /api/ endpoints and cross-references
 * them with actual route.ts files to identify:
 * 1. Missing routes
 * 2. Path mismatches (e.g., /api/foo vs /api/admin/foo)
 * 3. Dynamic parameter mismatches (e.g., [id] vs [userId] vs [documentId])
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { glob } from 'glob';

interface EndpointCall {
  file: string;
  line: number;
  endpoint: string;
  originalEndpoint: string; // Keep original for reporting
  method?: string;
}

interface RouteFile {
  path: string;
  endpoint: string;
  dynamicParams: string[]; // e.g., ['id', 'documentId']
  methods: string[];
}

// Extract endpoint from fetch call - improved to handle template literals
function extractEndpointFromLine(line: string, filePath: string): { normalized: string; original: string } | null {
  // Match fetch('/api/...') or fetch("/api/...") or fetch(`/api/...`)
  // Also handle template literals: fetch(`/api/tickets/${id}`)
  const patterns = [
    /fetch\(['"`]([^'"`]+)['"`]/,
    /fetch\(`([^`]+)`/,
    /fetch\(['"]([^'"]+)['"]/,
  ];
  
  let url: string | null = null;
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      url = match[1];
      break;
    }
  }
  
  if (!url || !url.startsWith('/api/')) return null;
  
  // Remove query parameters
  const endpoint = url.split('?')[0];
  const original = endpoint;
  
  // Handle template literals with variables (e.g., `/api/tickets/${id}`)
  // Replace ${...} with [id] pattern, but preserve variable names when possible
  let normalized = endpoint.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    // Try to infer parameter name from variable name
    if (varName.includes('Id') || varName.includes('id')) {
      return '[id]';
    }
    if (varName.includes('userId')) return '[userId]';
    if (varName.includes('documentId')) return '[documentId]';
    if (varName.includes('ticketId')) return '[ticketId]';
    if (varName.includes('invoiceId')) return '[invoiceId]';
    if (varName.includes('linkId')) return '[linkId]';
    if (varName.includes('codeId')) return '[codeId]';
    if (varName.includes('notificationId')) return '[notificationId]';
    if (varName.includes('planId')) return '[planId]';
    if (varName.includes('affiliateId')) return '[affiliateId]';
    if (varName.includes('clinicId')) return '[clinicId]';
    return '[id]';
  });
  
  return { normalized, original };
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
          const result = extractEndpointFromLine(line, filePath);
          if (result) {
            const context = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 10));
            const method = extractMethod(line, context);
            calls.push({
              file: filePath,
              line: i + 1,
              endpoint: result.normalized,
              originalEndpoint: result.original,
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

// Extract dynamic parameters from route path
function extractDynamicParams(routePath: string): string[] {
  const params: string[] = [];
  const parts = routePath.split('/');
  for (const part of parts) {
    if (part.startsWith('[') && part.endsWith(']')) {
      params.push(part.slice(1, -1));
    }
  }
  return params;
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
        
        const dynamicParams = extractDynamicParams(basePath);
        
        routes.push({
          path: fullPath,
          endpoint,
          dynamicParams,
          methods,
        });
      }
    }
  }
  
  walkDir(apiDir);
  return routes;
}

// Normalize endpoint for comparison (ignoring dynamic parameter names)
function normalizeEndpointForComparison(endpoint: string): string {
  // Remove trailing slashes
  let normalized = endpoint.replace(/\/$/, '');
  
  // Replace all dynamic segments with [*] for comparison
  normalized = normalized.replace(/\[[^\]]+\]/g, '[*]');
  
  // Normalize numeric IDs and UUIDs
  normalized = normalized.replace(/\/\d+/g, '/[*]');
  normalized = normalized.replace(/\/[a-f0-9-]{36}/gi, '/[*]');
  
  return normalized;
}

// Check if endpoints match structurally (ignoring dynamic param names)
function endpointsMatchStructurally(endpoint1: string, endpoint2: string): boolean {
  return normalizeEndpointForComparison(endpoint1) === normalizeEndpointForComparison(endpoint2);
}

// Check if endpoint exists, including parameter mismatch detection
function endpointExists(
  call: EndpointCall, 
  routes: RouteFile[]
): { 
  exists: boolean; 
  route?: RouteFile; 
  methodMatch?: boolean;
  paramMismatch?: boolean;
  similarRoutes?: RouteFile[];
} {
  const normalizedCall = normalizeEndpointForComparison(call.endpoint);
  
  // First, try exact match
  for (const route of routes) {
    const normalizedRoute = normalizeEndpointForComparison(route.endpoint);
    
    if (normalizedCall === normalizedRoute) {
      // Check if dynamic parameter names match
      const callParams = extractDynamicParams(call.endpoint);
      const routeParams = route.dynamicParams;
      
      const paramMismatch = callParams.length === routeParams.length && 
                           callParams.some((p, i) => p !== routeParams[i]);
      
      const methodMatch = !call.method || route.methods.includes(call.method);
      
      return { 
        exists: true, 
        route, 
        methodMatch,
        paramMismatch: paramMismatch || false
      };
    }
  }
  
  // If no exact match, find similar routes (structural match but different params)
  const similarRoutes: RouteFile[] = [];
  for (const route of routes) {
    if (endpointsMatchStructurally(call.endpoint, route.endpoint)) {
      similarRoutes.push(route);
    }
  }
  
  return { 
    exists: false,
    similarRoutes: similarRoutes.length > 0 ? similarRoutes : undefined
  };
}

// Main audit function
function auditEndpoints(rootDir: string) {
  console.log('🔍 Scanning for fetch() calls to /api/ endpoints...\n');
  const calls = findFetchCalls(rootDir);
  console.log(`Found ${calls.length} fetch() calls\n`);
  
  console.log('🔍 Scanning for route.ts files...\n');
  const routes = findRouteFiles(rootDir);
  console.log(`Found ${routes.length} route files\n`);
  
  // Group calls by normalized endpoint
  const callsByEndpoint = new Map<string, EndpointCall[]>();
  for (const call of calls) {
    const normalized = normalizeEndpointForComparison(call.endpoint);
    if (!callsByEndpoint.has(normalized)) {
      callsByEndpoint.set(normalized, []);
    }
    callsByEndpoint.get(normalized)!.push(call);
  }
  
  // Check each endpoint
  const missing: Array<{ endpoint: string; calls: EndpointCall[]; similarRoutes?: RouteFile[] }> = [];
  const paramMismatches: Array<{ endpoint: string; call: EndpointCall; route: RouteFile; callParams: string[]; routeParams: string[] }> = [];
  const methodMismatches: Array<{ endpoint: string; call: EndpointCall; route: RouteFile }> = [];
  const found: Array<{ endpoint: string; route: RouteFile }> = [];
  
  for (const [normalizedEndpoint, endpointCalls] of callsByEndpoint.entries()) {
    const firstCall = endpointCalls[0];
    const check = endpointExists(firstCall, routes);
    
    if (!check.exists) {
      missing.push({ 
        endpoint: firstCall.endpoint, 
        calls: endpointCalls,
        similarRoutes: check.similarRoutes
      });
    } else if (check.route) {
      if (check.paramMismatch) {
        const callParams = extractDynamicParams(firstCall.endpoint);
        paramMismatches.push({
          endpoint: firstCall.endpoint,
          call: firstCall,
          route: check.route,
          callParams,
          routeParams: check.route.dynamicParams
        });
      } else if (!check.methodMatch && firstCall.method) {
        methodMismatches.push({ endpoint: firstCall.endpoint, call: firstCall, route: check.route });
      } else {
        found.push({ endpoint: firstCall.endpoint, route: check.route });
      }
    }
  }
  
  // Print report
  console.log('='.repeat(80));
  console.log('ENHANCED API ENDPOINTS AUDIT REPORT');
  console.log('='.repeat(80));
  console.log();
  
  if (paramMismatches.length > 0) {
    console.log(`⚠️  DYNAMIC PARAMETER MISMATCHES (${paramMismatches.length}):`);
    console.log('-'.repeat(80));
    for (const { endpoint, call, route, callParams, routeParams } of paramMismatches) {
      const relPath = relative(rootDir, call.file);
      console.log(`\n  ${endpoint}`);
      console.log(`  Called with params: [${callParams.join(', ')}]`);
      console.log(`  Route has params:   [${routeParams.join(', ')}]`);
      console.log(`  Route file: ${relative(rootDir, route.path)}`);
      console.log(`  From: ${relPath}:${call.line}`);
    }
    console.log();
  }
  
  if (missing.length > 0) {
    console.log(`❌ MISSING ROUTES (${missing.length}):`);
    console.log('-'.repeat(80));
    for (const { endpoint, calls, similarRoutes } of missing) {
      console.log(`\n  ${endpoint}`);
      console.log(`  Called from:`);
      for (const call of calls) {
        const relPath = relative(rootDir, call.file);
        console.log(`    - ${relPath}:${call.line}${call.method ? ` (${call.method})` : ''}`);
      }
      if (similarRoutes && similarRoutes.length > 0) {
        console.log(`  ⚠️  Similar routes found (may be parameter mismatch):`);
        for (const similar of similarRoutes) {
          console.log(`    - ${similar.endpoint} (params: [${similar.dynamicParams.join(', ')}])`);
        }
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
  
  if (missing.length === 0 && methodMismatches.length === 0 && paramMismatches.length === 0) {
    console.log('✅ All endpoints have corresponding route files!');
    console.log();
  }
  
  console.log(`📊 Summary:`);
  console.log(`   Total fetch() calls: ${calls.length}`);
  console.log(`   Unique endpoints called: ${callsByEndpoint.size}`);
  console.log(`   Route files found: ${routes.length}`);
  console.log(`   Missing routes: ${missing.length}`);
  console.log(`   Parameter mismatches: ${paramMismatches.length}`);
  console.log(`   Method mismatches: ${methodMismatches.length}`);
  console.log(`   Found routes: ${found.length}`);
  console.log();
  
  return { missing, methodMismatches, paramMismatches, found };
}

// Run audit
const rootDir = process.cwd();
auditEndpoints(rootDir);
