/**
 * Codemod: replace UTC calendar date patterns in src/ with platform-calendar helpers.
 * Run: node scripts/replace-utc-calendar-dates.mjs
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(process.cwd(), 'src');

const SKIP_SUBSTR = [
  'lib/utils/timezone.ts',
  'lib/utils/platform-calendar.ts',
  'hooks/use-platform-today-state.ts',
  'domains/provider/validation.ts',
  'admin/affiliates/competitions/page.tsx',
];

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

function rel(p) {
  return path.relative(process.cwd(), p).split(path.sep).join('/');
}

/** Insert a new import after `'use client'` (if present) and any following blank lines. */
function ensureImport(content, line) {
  if (content.includes("@/lib/utils/platform-calendar")) return content;
  const lines = content.split('\n');
  let insertIdx = 0;
  const first = lines[0]?.trim() ?? '';
  if (first === "'use client';" || first === '"use client";' || first === "'use client'" || first === '"use client"') {
    insertIdx = 1;
    while (insertIdx < lines.length && lines[insertIdx].trim() === '') insertIdx++;
  }
  lines.splice(insertIdx, 0, line);
  return lines.join('\n');
}

const files = walk(ROOT).filter((f) => !SKIP_SUBSTR.some((s) => rel(f).includes(s)));

let changed = 0;
for (const file of files) {
  let s = fs.readFileSync(file, 'utf8');
  const orig = s;
  if (!s.includes("toISOString().split('T')[0]")) continue;

  s = s.replace(/new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/g, 'calendarTodayServer()');

  s = s.replace(/([\w$.]+)\.toISOString\(\)\.split\('T'\)\[0\]/g, (match, id) => {
    if (match.includes('instantToCalendarDate')) return match;
    return `instantToCalendarDate(${id})`;
  });

  if (s === orig) continue;

  const needToday = s.includes('calendarTodayServer()');
  const needInstant = s.includes('instantToCalendarDate(');
  if (needToday && needInstant) {
    s = ensureImport(s, "import { calendarTodayServer, instantToCalendarDate } from '@/lib/utils/platform-calendar';");
  } else if (needToday) {
    s = ensureImport(s, "import { calendarTodayServer } from '@/lib/utils/platform-calendar';");
  } else if (needInstant) {
    s = ensureImport(s, "import { instantToCalendarDate } from '@/lib/utils/platform-calendar';");
  }

  fs.writeFileSync(file, s);
  changed++;
  console.log('updated', rel(file));
}

console.log('files changed:', changed);
