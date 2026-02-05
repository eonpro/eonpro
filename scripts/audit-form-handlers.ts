#!/usr/bin/env ts-node
/**
 * Audit script to check form submissions and button click handlers
 * Verifies that all handlers call existing API endpoints
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

interface HandlerInfo {
  file: string;
  line: number;
  handlerName: string;
  handlerType: 'onSubmit' | 'onClick' | 'handler';
  endpoint?: string;
  method?: string;
  issues: string[];
}

interface EndpointInfo {
  path: string;
  methods: string[];
  file: string;
}

// Extract all API endpoints from route files
function extractEndpoints(): Map<string, EndpointInfo> {
  const endpoints = new Map<string, EndpointInfo>();
  const routeFiles = glob.sync('src/app/api/**/route.ts', { cwd: process.cwd() });

  for (const file of routeFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const relativePath = path.relative('src/app/api', file).replace('/route.ts', '');
    const apiPath = `/api/${relativePath}`;

    // Extract HTTP methods
    const methods: string[] = [];
    if (content.includes('export async function GET')) methods.push('GET');
    if (content.includes('export async function POST')) methods.push('POST');
    if (content.includes('export async function PUT')) methods.push('PUT');
    if (content.includes('export async function PATCH')) methods.push('PATCH');
    if (content.includes('export async function DELETE')) methods.push('DELETE');

    if (methods.length > 0) {
      endpoints.set(apiPath, { path: apiPath, methods, file });
    }

    // Handle dynamic routes like [id]
    const dynamicMatch = relativePath.match(/\[(\w+)\]/);
    if (dynamicMatch) {
      const basePath = relativePath.replace(/\[.*?\]/g, '');
      const dynamicPath = `/api/${basePath}`;
      if (!endpoints.has(dynamicPath)) {
        endpoints.set(dynamicPath, { path: dynamicPath, methods, file });
      }
    }
  }

  return endpoints;
}

// Extract fetch calls from a file
function extractFetchCalls(content: string, filePath: string): HandlerInfo[] {
  const handlers: HandlerInfo[] = [];
  const lines = content.split('\n');

  // Pattern to match fetch calls
  const fetchPattern = /fetch\s*\(\s*['"`]([^'"`]+)['"`]/g;
  
  // Pattern to match handler functions
  const handlerPatterns = [
    /const\s+(handle\w+)\s*=\s*async\s*\(/g,
    /function\s+(handle\w+)\s*\(/g,
    /const\s+(\w+)\s*=\s*async\s*\(.*\)\s*=>/g,
  ];

  // Find all handler functions
  const handlerMap = new Map<number, string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of handlerPatterns) {
      const match = line.match(pattern);
      if (match) {
        handlerMap.set(i + 1, match[1]);
      }
    }
  }

  // Find onSubmit handlers
  const onSubmitPattern = /onSubmit\s*=\s*\{?\s*(\w+)/g;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(onSubmitPattern);
    if (match) {
      const handlerName = match[1];
      handlers.push({
        file: filePath,
        line: i + 1,
        handlerName,
        handlerType: 'onSubmit',
        issues: [],
      });
    }
  }

  // Find onClick handlers with fetch
  const onClickPattern = /onClick\s*=\s*\{?\s*(\w+)/g;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(onClickPattern);
    if (match) {
      const handlerName = match[1];
      handlers.push({
        file: filePath,
        line: i + 1,
        handlerName,
        handlerType: 'onClick',
        issues: [],
      });
    }
  }

  // Now find fetch calls within handler functions
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;
    while ((match = fetchPattern.exec(line)) !== null) {
      const endpoint = match[1];
      const methodMatch = line.match(/method:\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]/i);
      const method = methodMatch ? methodMatch[1].toUpperCase() : 'GET';

      // Find which handler this fetch is in
      let handlerName = 'unknown';
      let handlerType: 'onSubmit' | 'onClick' | 'handler' = 'handler';
      
      // Check if this line is within a handler function
      for (let j = i; j >= 0; j--) {
        if (handlerMap.has(j + 1)) {
          handlerName = handlerMap.get(j + 1)!;
          break;
        }
      }

      // Check if this is in an onSubmit or onClick handler
      const isOnSubmit = content.substring(0, content.indexOf(line)).includes(`onSubmit={${handlerName}`);
      const isOnClick = content.substring(0, content.indexOf(line)).includes(`onClick={${handlerName}`);

      if (isOnSubmit) handlerType = 'onSubmit';
      else if (isOnClick) handlerType = 'onClick';

      handlers.push({
        file: filePath,
        line: i + 1,
        handlerName,
        handlerType,
        endpoint,
        method,
        issues: [],
      });
    }
  }

  return handlers;
}

// Check if endpoint exists
function validateEndpoint(endpoint: string, method: string, endpoints: Map<string, EndpointInfo>): string[] {
  const issues: string[] = [];

  // Normalize endpoint
  let normalizedEndpoint = endpoint;
  
  // Handle dynamic segments
  normalizedEndpoint = normalizedEndpoint.replace(/\/\d+/g, '/[id]');
  normalizedEndpoint = normalizedEndpoint.replace(/\/[^/]+$/g, '/[id]');
  
  // Check exact match first
  if (endpoints.has(endpoint)) {
    const endpointInfo = endpoints.get(endpoint)!;
    if (!endpointInfo.methods.includes(method)) {
      issues.push(`Endpoint exists but doesn't support ${method} method. Available: ${endpointInfo.methods.join(', ')}`);
    }
    return issues;
  }

  // Check normalized match
  if (endpoints.has(normalizedEndpoint)) {
    const endpointInfo = endpoints.get(normalizedEndpoint)!;
    if (!endpointInfo.methods.includes(method)) {
      issues.push(`Endpoint exists (normalized) but doesn't support ${method} method. Available: ${endpointInfo.methods.join(', ')}`);
    }
    return issues;
  }

  // Check if any endpoint matches the pattern
  let found = false;
  for (const [epPath, epInfo] of endpoints.entries()) {
    // Simple pattern matching for dynamic routes
    const epPattern = epPath.replace(/\[id\]/g, '[^/]+');
    const regex = new RegExp(`^${epPattern}$`);
    if (regex.test(endpoint)) {
      found = true;
      if (!epInfo.methods.includes(method)) {
        issues.push(`Endpoint pattern matches but doesn't support ${method} method. Available: ${epInfo.methods.join(', ')}`);
      }
      break;
    }
  }

  if (!found) {
    issues.push(`Endpoint not found: ${endpoint}`);
  }

  return issues;
}

// Main audit function
async function audit() {
  console.log('🔍 Auditing form submissions and button handlers...\n');

  // Extract all endpoints
  console.log('📋 Extracting API endpoints...');
  const endpoints = extractEndpoints();
  console.log(`Found ${endpoints.size} API endpoints\n`);

  // Find all component/page files
  const files = [
    ...glob.sync('src/app/**/*.tsx', { cwd: process.cwd() }),
    ...glob.sync('src/components/**/*.tsx', { cwd: process.cwd() }),
  ];

  console.log(`📁 Scanning ${files.length} files for handlers...\n`);

  const allHandlers: HandlerInfo[] = [];
  const issues: HandlerInfo[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const handlers = extractFetchCalls(content, file);
      
      for (const handler of handlers) {
        if (handler.endpoint) {
          handler.issues = validateEndpoint(handler.endpoint, handler.method || 'GET', endpoints);
          if (handler.issues.length > 0) {
            issues.push(handler);
          }
        } else {
          // Handler without fetch call - might be an issue
          if (handler.handlerType === 'onSubmit' || handler.handlerType === 'onClick') {
            // Check if handler actually exists and calls something
            const handlerContent = extractHandlerContent(content, handler.handlerName);
            if (!handlerContent.includes('fetch') && !handlerContent.includes('apiFetch') && !handlerContent.includes('router.push')) {
              handler.issues.push('Handler does not appear to call any API endpoint');
              issues.push(handler);
            }
          }
        }
        allHandlers.push(handler);
      }
    } catch (error) {
      console.error(`Error reading ${file}:`, error);
    }
  }

  // Report results
  console.log('='.repeat(80));
  console.log('📊 AUDIT RESULTS');
  console.log('='.repeat(80));
  console.log(`\nTotal handlers found: ${allHandlers.length}`);
  console.log(`Issues found: ${issues.length}\n`);

  if (issues.length > 0) {
    console.log('⚠️  ISSUES FOUND:\n');
    for (const issue of issues) {
      console.log(`File: ${issue.file}:${issue.line}`);
      console.log(`Handler: ${issue.handlerName} (${issue.handlerType})`);
      if (issue.endpoint) {
        console.log(`Endpoint: ${issue.method || 'GET'} ${issue.endpoint}`);
      }
      console.log(`Issues:`);
      issue.issues.forEach(i => console.log(`  - ${i}`));
      console.log('');
    }
  } else {
    console.log('✅ No issues found! All handlers appear to call valid endpoints.');
  }

  // Generate summary by file
  const issuesByFile = new Map<string, HandlerInfo[]>();
  for (const issue of issues) {
    if (!issuesByFile.has(issue.file)) {
      issuesByFile.set(issue.file, []);
    }
    issuesByFile.get(issue.file)!.push(issue);
  }

  if (issuesByFile.size > 0) {
    console.log('\n📋 SUMMARY BY FILE:\n');
    for (const [file, fileIssues] of issuesByFile.entries()) {
      console.log(`${file}: ${fileIssues.length} issue(s)`);
    }
  }
}

function extractHandlerContent(content: string, handlerName: string): string {
  // Simple extraction - find the handler function
  const pattern = new RegExp(`(const|function)\\s+${handlerName}\\s*[=:]\\s*[^{]*\\{([\\s\\S]*?)\\n\\s*\\}`, 'm');
  const match = content.match(pattern);
  return match ? match[2] : '';
}

// Run audit
audit().catch(console.error);
