/**
 * Tenant isolation: ensure every Prisma model with clinicId is in CLINIC_ISOLATED_MODELS.
 * Fail build if a model has clinicId but is not in the list (prevents cross-tenant leakage).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { CLINIC_ISOLATED_MODELS } from '@/lib/db';

function parseSchemaForModelsWithClinicId(schemaPath: string): string[] {
  const content = fs.readFileSync(schemaPath, 'utf8');
  const blocks = content.split(/^model\s+/m);
  const result: string[] = [];
  for (let i = 1; i < blocks.length; i++) {
    const modelName = blocks[i].split(/\s+/)[0];
    if (blocks[i].match(/\bclinicId\s+Int\??\b/)) {
      const first = modelName[0].toLowerCase();
      const rest = modelName.slice(1);
      const camel = first + rest;
      result.push(camel.toLowerCase());
    }
  }
  return [...new Set(result)].sort();
}

describe('CLINIC_ISOLATED_MODELS completeness', () => {
  it('every model with clinicId in schema must be in CLINIC_ISOLATED_MODELS', () => {
    const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema not found: ${schemaPath}`);
    }
    const modelsWithClinicId = parseSchemaForModelsWithClinicId(schemaPath);
    const list = (CLINIC_ISOLATED_MODELS as readonly string[]).map((s) => s.toLowerCase());
    const missing = modelsWithClinicId.filter((m) => !list.includes(m));
    expect(
      missing,
      `Models with clinicId in schema but missing from CLINIC_ISOLATED_MODELS (add them to src/lib/db.ts): ${missing.join(', ')}`
    ).toEqual([]);
  });
});
