/**
 * Logout redirect regression test
 *
 * CRITICAL: Logout must use window.location.href (full page navigation), not
 * router.push(), so the user is redirected to login immediately. Using
 * router.push() causes the redirect to only happen on the next click.
 *
 * This test fails if any logout handler in src uses router.push for the
 * login redirect, ensuring the fix is never accidentally reverted.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.join(process.cwd(), 'src');

function getAllTsAndTsxFiles(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.next') {
      getAllTsAndTsxFiles(full, files);
    } else if (e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.tsx'))) {
      files.push(full);
    }
  }
  return files;
}

function extractLogoutFunctionBodies(content: string): string[] {
  const bodies: string[] = [];
  const markers = [
    'handleLogout = (e: React.MouseEvent) =>',
    'handleLogout = async () =>',
    'const logout = useCallback(async () =>',
    'const logout = async () =>',
    'logout = async () =>',
  ];
  for (const marker of markers) {
    let pos = 0;
    while (true) {
      const idx = content.indexOf(marker, pos);
      if (idx === -1) break;
      const afterMarker = content.slice(idx + marker.length);
      const openBrace = afterMarker.indexOf('{');
      if (openBrace === -1) {
        pos = idx + 1;
        continue;
      }
      const fromBrace = afterMarker.slice(openBrace);
      let depth = 0;
      for (let i = 0; i < fromBrace.length; i++) {
        const c = fromBrace[i];
        if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) {
            bodies.push(fromBrace.slice(0, i + 1));
            break;
          }
        }
      }
      pos = idx + 1;
    }
  }
  return bodies;
}

describe('Logout redirect regression', () => {
  it('logout handlers must use window.location.href, not router.push, for login redirect', () => {
    const files = getAllTsAndTsxFiles(SRC_DIR);
    const violations: { file: string; line: number; snippet: string }[] = [];

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relativePath = path.relative(process.cwd(), filePath);

      // Only check files that define a logout handler
      const hasHandleLogout = /handleLogout\s*=\s*(async|\(e:\s*React\.MouseEvent\))|const\s+logout\s*=\s*(async|useCallback)/.test(content);
      if (!hasHandleLogout) continue;

      const logoutBodies = extractLogoutFunctionBodies(content);
      const bodyToCheck = logoutBodies.length > 0 ? logoutBodies.join('\n') : content;

      // Fail if the logout flow uses router.push to /login (no query = logout redirect)
      const badPatterns = [
        /router\.push\s*\(\s*['"]\/login['"]\s*\)/,
        /router\.push\s*\(\s*['"]\/affiliate\/login['"]\s*\)/,
        /router\.push\s*\(\s*['"]\/influencer\/login['"]\s*\)/,
      ];

      for (const re of badPatterns) {
        const match = bodyToCheck.match(re);
        if (match) {
          const lineNum = content.slice(0, content.indexOf(match[0])).split('\n').length;
          violations.push({
            file: relativePath,
            line: lineNum,
            snippet: match[0],
          });
        }
      }
    }

    expect(
      violations,
      `Logout must use window.location.href for immediate redirect. Use window.location.href = '/login' instead of router.push('/login'). Violations:\n${violations.map((v) => `  ${v.file}:${v.line}  ${v.snippet}`).join('\n')}`
    ).toHaveLength(0);
  });
});
