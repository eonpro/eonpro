#!/usr/bin/env tsx

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// Get all actual pages
function getAllPages(dir: string, basePath: string = ''): Set<string> {
  const pages = new Set<string>();
  
  try {
    const entries = readdirSync(dir);
    
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Skip node_modules and other non-app directories
        if (entry.startsWith('.') || entry === 'node_modules') continue;
        
        // Next.js route groups like (dashboard) don't appear in URLs
        const isRouteGroup = entry.startsWith('(') && entry.endsWith(')');
        
        if (!isRouteGroup) {
          const newBase = basePath ? `${basePath}/${entry}` : entry;
          const subPages = getAllPages(fullPath, newBase);
          subPages.forEach(page => pages.add(page));
        } else {
          // Route group - continue recursively but don't add to path
          const subPages = getAllPages(fullPath, basePath);
          subPages.forEach(page => pages.add(page));
        }
      } else if (entry === 'page.tsx' || entry === 'page.ts') {
        // This is a page
        const pagePath = basePath || '/';
        pages.add(pagePath);
      }
    }
  } catch (e) {
    // Directory doesn't exist or can't be read
  }
  
  return pages;
}

// Extract paths from code
function extractPaths(content: string, filePath: string): string[] {
  const paths: string[] = [];
  
  // router.push('/path') or router.push("/path")
  const routerPushRegex = /router\.push\(['"]([^'"]+)['"]\)/g;
  let match;
  while ((match = routerPushRegex.exec(content)) !== null) {
    const path = match[1];
    // Skip query strings and fragments for now
    const cleanPath = path.split('?')[0].split('#')[0];
    if (cleanPath.startsWith('/')) {
      paths.push(cleanPath);
    }
  }
  
  // redirect('/path') or redirect("/path")
  const redirectRegex = /redirect\(['"]([^'"]+)['"]\)/g;
  while ((match = redirectRegex.exec(content)) !== null) {
    const path = match[1];
    const cleanPath = path.split('?')[0].split('#')[0];
    if (cleanPath.startsWith('/')) {
      paths.push(cleanPath);
    }
  }
  
  // Link href="/path" or Link href='/path'
  const linkHrefRegex = /href=["']([^"']+)["']/g;
  while ((match = linkHrefRegex.exec(content)) !== null) {
    const path = match[1];
    // Skip external URLs
    if (path.startsWith('http') || path.startsWith('mailto:') || path.startsWith('tel:')) {
      continue;
    }
    const cleanPath = path.split('?')[0].split('#')[0];
    if (cleanPath.startsWith('/')) {
      paths.push(cleanPath);
    }
  }
  
  return paths;
}

// Check if a path exists (handling dynamic routes)
function pathExists(path: string, pages: Set<string>): boolean {
  // Normalize path - remove leading/trailing slashes for comparison
  const normalizedPath = path === '/' ? '/' : path.replace(/^\/|\/$/g, '');
  
  // Exact match
  if (pages.has(normalizedPath) || pages.has(`/${normalizedPath}`) || (normalizedPath === '/' && pages.has(''))) {
    return true;
  }
  
  // Check for dynamic routes [id], [code], etc.
  const segments = normalizedPath.split('/').filter(s => s);
  
  // Try matching against dynamic routes
  for (const page of pages) {
    const pageNormalized = page === '/' ? '' : page.replace(/^\/|\/$/g, '');
    const pageSegments = pageNormalized.split('/').filter(s => s);
    
    if (segments.length !== pageSegments.length) continue;
    
    let matches = true;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const pageSeg = pageSegments[i];
      
      // If page segment is a dynamic route like [id], it matches any value
      if (pageSeg && pageSeg.startsWith('[') && pageSeg.endsWith(']')) {
        continue;
      }
      
      if (seg !== pageSeg) {
        matches = false;
        break;
      }
    }
    
    if (matches) return true;
  }
  
  // Check if it's an API route (these are valid but not pages)
  if (path.startsWith('/api/')) {
    return true; // API routes are valid
  }
  
  return false;
}

// Main execution
const appDir = join(process.cwd(), 'src/app');
const pages = getAllPages(appDir);

// Convert to paths with leading slash
const pagePaths = new Set<string>();
pages.forEach(page => {
  if (page === '/') {
    pagePaths.add('/');
  } else {
    pagePaths.add(`/${page}`);
  }
});

// Also add root
pagePaths.add('/');

console.log(`Found ${pagePaths.size} pages\n`);

// Scan all TypeScript/TSX files
const brokenRedirects: Array<{ file: string; path: string; type: string }> = [];

function scanDirectory(dir: string) {
  try {
    const entries = readdirSync(dir);
    
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        if (entry.startsWith('.') || entry === 'node_modules') continue;
        scanDirectory(fullPath);
      } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
        try {
          const content = readFileSync(fullPath, 'utf-8');
          const relativePath = fullPath.replace(process.cwd() + '/', '');
          const paths = extractPaths(content, relativePath);
          
          for (const path of paths) {
            if (!pathExists(path, pagePaths)) {
              // Determine type
              let type = 'unknown';
              if (content.includes(`router.push('${path}')`) || content.includes(`router.push("${path}")`)) {
                type = 'router.push()';
              } else if (content.includes(`redirect('${path}')`) || content.includes(`redirect("${path}")`)) {
                type = 'redirect()';
              } else if (content.includes(`href="${path}"`) || content.includes(`href='${path}'`)) {
                type = 'Link href';
              }
              
              brokenRedirects.push({ file: relativePath, path, type });
            }
          }
        } catch (e) {
          // Skip files that can't be read
        }
      }
    }
  } catch (e) {
    // Directory doesn't exist
  }
}

scanDirectory(join(process.cwd(), 'src'));

// Report results
if (brokenRedirects.length === 0) {
  console.log('✅ No broken redirects or links found!');
} else {
  console.log(`❌ Found ${brokenRedirects.length} broken redirects/links:\n`);
  
  // Group by path
  const byPath = new Map<string, Array<{ file: string; type: string }>>();
  brokenRedirects.forEach(({ file, path, type }) => {
    if (!byPath.has(path)) {
      byPath.set(path, []);
    }
    byPath.get(path)!.push({ file, type });
  });
  
  for (const [path, occurrences] of byPath.entries()) {
    console.log(`\n🔴 ${path}`);
    const uniqueFiles = new Set(occurrences.map(o => o.file));
    for (const file of uniqueFiles) {
      const types = occurrences.filter(o => o.file === file).map(o => o.type);
      console.log(`   ${file} (${types.join(', ')})`);
    }
  }
}

process.exit(brokenRedirects.length > 0 ? 1 : 0);
