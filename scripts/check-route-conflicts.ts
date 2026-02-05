#!/usr/bin/env tsx
/**
 * Script to check for duplicate API routes and potential routing conflicts
 */

import { glob } from 'glob';
import * as path from 'path';
import * as fs from 'fs';

interface RouteInfo {
  filePath: string;
  routePath: string;
  segments: string[];
  hasDynamicSegment: boolean;
  dynamicSegmentIndex: number;
}

function extractRoutePath(filePath: string): string {
  // Remove the workspace path prefix and /route.ts suffix
  const relativePath = filePath.replace(/^.*\/src\/app/, '');
  const routePath = relativePath.replace(/\/route\.ts$/, '');
  return routePath || '/';
}

function parseRoute(routePath: string, filePath: string): RouteInfo {
  const segments = routePath.split('/').filter(Boolean);
  const dynamicSegmentIndex = segments.findIndex((seg) => seg.startsWith('[') && seg.endsWith(']'));
  
  return {
    filePath,
    routePath,
    segments,
    hasDynamicSegment: dynamicSegmentIndex !== -1,
    dynamicSegmentIndex,
  };
}

function checkConflicts(routes: RouteInfo[]): {
  exactDuplicates: RouteInfo[][];
  patternConflicts: Array<{ route1: RouteInfo; route2: RouteInfo; reason: string }>;
} {
  const exactDuplicates: RouteInfo[][] = [];
  const patternConflicts: Array<{ route1: RouteInfo; route2: RouteInfo; reason: string }> = [];
  
  // Check for exact duplicates
  const routePathMap = new Map<string, RouteInfo[]>();
  for (const route of routes) {
    if (!routePathMap.has(route.routePath)) {
      routePathMap.set(route.routePath, []);
    }
    routePathMap.get(route.routePath)!.push(route);
  }
  
  for (const [routePath, routeList] of routePathMap.entries()) {
    if (routeList.length > 1) {
      exactDuplicates.push(routeList);
    }
  }
  
  // Group routes by their parent path (everything except the last segment)
  // This helps us find routes at the same level that might conflict
  const routesByParent = new Map<string, RouteInfo[]>();
  
  for (const route of routes) {
    if (route.segments.length === 0) continue;
    
    // Get parent path (all segments except the last one)
    const parentSegments = route.segments.slice(0, -1);
    const parentPath = parentSegments.join('/');
    
    if (!routesByParent.has(parentPath)) {
      routesByParent.set(parentPath, []);
    }
    routesByParent.get(parentPath)!.push(route);
  }
  
  // Check for conflicts: routes at the same level where one is dynamic and one is static
  // e.g., /api/patients/[id] vs /api/patients/all
  for (const [parentPath, siblingRoutes] of routesByParent.entries()) {
    if (siblingRoutes.length < 2) continue;
    
    // Get the last segment of each route
    const routesByLastSegment = new Map<string, RouteInfo[]>();
    
    for (const route of siblingRoutes) {
      const lastSegment = route.segments[route.segments.length - 1];
      if (!routesByLastSegment.has(lastSegment)) {
        routesByLastSegment.set(lastSegment, []);
      }
      routesByLastSegment.get(lastSegment)!.push(route);
    }
    
    // Check for conflicts between dynamic and static routes at the same level
    const dynamicSegments = Array.from(routesByLastSegment.keys()).filter((seg) =>
      seg.startsWith('[') && seg.endsWith(']')
    );
    const staticSegments = Array.from(routesByLastSegment.keys()).filter(
      (seg) => !seg.startsWith('[') || !seg.endsWith(']')
    );
    
    // If we have both dynamic and static routes at the same level, flag potential conflicts
    if (dynamicSegments.length > 0 && staticSegments.length > 0) {
      for (const dynamicSeg of dynamicSegments) {
        for (const staticSeg of staticSegments) {
          const dynamicRoutes = routesByLastSegment.get(dynamicSeg)!;
          const staticRoutes = routesByLastSegment.get(staticSeg)!;
          
          // This is a real conflict: static routes will match first, potentially shadowing dynamic routes
          // Common problematic static segments: 'all', 'list', 'search', 'stats', 'count', 'bulk', etc.
          const problematicStaticSegments = [
            'all',
            'list',
            'search',
            'stats',
            'count',
            'bulk',
            'new',
            'create',
            'export',
            'import',
          ];
          
          const isProblematic = problematicStaticSegments.includes(staticSeg.toLowerCase());
          
          for (const dynamicRoute of dynamicRoutes) {
            for (const staticRoute of staticRoutes) {
              patternConflicts.push({
                route1: dynamicRoute,
                route2: staticRoute,
                reason: isProblematic
                  ? `⚠️  CRITICAL: Dynamic route ${dynamicRoute.routePath} conflicts with static route ${staticRoute.routePath}. Static routes take precedence in Next.js, so "${staticSeg}" will be matched before the dynamic segment.`
                  : `Dynamic route ${dynamicRoute.routePath} may conflict with static route ${staticRoute.routePath} (static routes take precedence in Next.js)`,
              });
            }
          }
        }
      }
    }
    
    // Check for multiple dynamic routes at the same level with different parameter names
    // This is usually fine, but worth flagging for review
    if (dynamicSegments.length > 1) {
      const allDynamicRoutes: RouteInfo[] = [];
      for (const seg of dynamicSegments) {
        allDynamicRoutes.push(...routesByLastSegment.get(seg)!);
      }
      
      for (let i = 0; i < allDynamicRoutes.length; i++) {
        for (let j = i + 1; j < allDynamicRoutes.length; j++) {
          const r1 = allDynamicRoutes[i];
          const r2 = allDynamicRoutes[j];
          
          // Only flag if they're truly at the same level (same parent, same depth)
          if (r1.segments.length === r2.segments.length) {
            const seg1 = r1.segments[r1.segments.length - 1];
            const seg2 = r2.segments[r2.segments.length - 1];
            
            // Extract parameter names
            const param1 = seg1.replace(/[\[\]]/g, '');
            const param2 = seg2.replace(/[\[\]]/g, '');
            
            if (param1 !== param2) {
              // This is usually fine - different param names at same level are valid
              // But we'll note it for review
              patternConflicts.push({
                route1: r1,
                route2: r2,
                reason: `Two dynamic routes at the same level with different parameter names: "${param1}" vs "${param2}". This is usually fine, but verify they serve different purposes.`,
              });
            }
          }
        }
      }
    }
  }
  
  return { exactDuplicates, patternConflicts };
}

async function main() {
  console.log('🔍 Scanning for API route files...\n');
  
  const routeFiles = await glob('src/app/api/**/route.ts', {
    cwd: process.cwd(),
    absolute: true,
  });
  
  console.log(`Found ${routeFiles.length} route files\n`);
  
  const routes = routeFiles.map((filePath) => {
    const routePath = extractRoutePath(filePath);
    return parseRoute(routePath, filePath);
  });
  
  const { exactDuplicates, patternConflicts } = checkConflicts(routes);
  
  // Report results
  console.log('='.repeat(80));
  console.log('ROUTE CONFLICT ANALYSIS RESULTS');
  console.log('='.repeat(80));
  console.log();
  
  if (exactDuplicates.length === 0 && patternConflicts.length === 0) {
    console.log('✅ No conflicts found! All routes are unique.\n');
    return;
  }
  
  if (exactDuplicates.length > 0) {
    console.log(`❌ EXACT DUPLICATES FOUND: ${exactDuplicates.length} duplicate route(s)\n`);
    exactDuplicates.forEach((duplicateGroup, index) => {
      console.log(`Duplicate Group ${index + 1}: ${duplicateGroup[0].routePath}`);
      duplicateGroup.forEach((route) => {
        console.log(`  - ${route.filePath}`);
      });
      console.log();
    });
  }
  
  if (patternConflicts.length > 0) {
    console.log(`⚠️  PATTERN CONFLICTS FOUND: ${patternConflicts.length} potential conflict(s)\n`);
    patternConflicts.forEach((conflict, index) => {
      console.log(`Conflict ${index + 1}:`);
      console.log(`  Route 1: ${conflict.route1.routePath}`);
      console.log(`    File:  ${conflict.route1.filePath}`);
      console.log(`  Route 2: ${conflict.route2.routePath}`);
      console.log(`    File:  ${conflict.route2.filePath}`);
      console.log(`  Reason:  ${conflict.reason}`);
      console.log();
    });
  }
  
  console.log('='.repeat(80));
  console.log(`Summary: ${exactDuplicates.length} exact duplicate(s), ${patternConflicts.length} pattern conflict(s)`);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
