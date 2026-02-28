#!/usr/bin/env node
/**
 * Auto-generates src/types/prisma-enums.ts from prisma/schema.prisma.
 *
 * Run: node scripts/generate-prisma-enums.js
 * Add to package.json scripts: "generate:enums": "node scripts/generate-prisma-enums.js"
 *
 * This eliminates manual sync between Prisma schema enums and client-safe TypeScript types.
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'types', 'prisma-enums.ts');

function parseEnums(schemaContent) {
  const enumRegex = /enum\s+(\w+)\s*\{([^}]+)\}/g;
  const enums = [];

  let match;
  while ((match = enumRegex.exec(schemaContent)) !== null) {
    const name = match[1];
    const values = match[2]
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .filter((line) => line && line.length > 0);

    enums.push({ name, values });
  }

  return enums;
}

function generateTypeScript(enums) {
  const lines = [
    '/**',
    ' * AUTO-GENERATED — DO NOT EDIT MANUALLY',
    ` * Generated from prisma/schema.prisma on ${new Date().toISOString().split('T')[0]}`,
    ' * Run: node scripts/generate-prisma-enums.js',
    ' *',
    " * Client-safe Prisma enum types. Use these in 'use client' components instead of",
    " * importing from '@prisma/client', which pulls Node.js-only runtime code.",
    ' */',
    '',
  ];

  for (const { name, values } of enums) {
    // Type union
    lines.push(`export type ${name} =`);
    values.forEach((val, i) => {
      const sep = i < values.length - 1 ? '' : ';';
      lines.push(`  | '${val}'${sep}`);
    });
    lines.push('');

    // Runtime object (for iteration/validation)
    lines.push(`export const ${name} = {`);
    values.forEach((val) => {
      lines.push(`  ${val}: '${val}' as const,`);
    });
    lines.push('} as const;');
    lines.push('');
  }

  return lines.join('\n');
}

// Also scan split schema files if they exist
function getSchemaContent() {
  let content = '';
  
  // Main schema
  if (fs.existsSync(SCHEMA_PATH)) {
    content += fs.readFileSync(SCHEMA_PATH, 'utf-8');
  }

  // Split schema files (e.g., prisma/schema/billing.prisma)
  const schemaDir = path.join(__dirname, '..', 'prisma', 'schema');
  if (fs.existsSync(schemaDir)) {
    const files = fs.readdirSync(schemaDir).filter((f) => f.endsWith('.prisma'));
    for (const file of files) {
      content += '\n' + fs.readFileSync(path.join(schemaDir, file), 'utf-8');
    }
  }

  return content;
}

const schemaContent = getSchemaContent();
const enums = parseEnums(schemaContent);

// Deduplicate enums by name (split files may repeat definitions)
const seen = new Set();
const uniqueEnums = enums.filter(({ name }) => {
  if (seen.has(name)) return false;
  seen.add(name);
  return true;
});

const output = generateTypeScript(uniqueEnums);
fs.writeFileSync(OUTPUT_PATH, output, 'utf-8');

console.log(`Generated ${uniqueEnums.length} enums → ${OUTPUT_PATH}`);
