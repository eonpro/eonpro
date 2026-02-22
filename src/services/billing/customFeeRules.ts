/**
 * CUSTOM FEE RULES ENGINE
 * =======================
 * Per-clinic, priority-ordered rules for complicated billing logic.
 * When customFeeRules is set, the first matching rule determines WAIVE or CHARGE (with optional min/max).
 * If no rule matches, standard prescription/transmission config is used.
 *
 * @module services/billing/customFeeRules
 */

import type { PlatformFeeType } from '@prisma/client';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types (stored in ClinicPlatformFeeConfig.customFeeRules as JSON)
// ---------------------------------------------------------------------------

export type CustomFeeRuleConditionField =
  | 'feeType'           // PRESCRIPTION | TRANSMISSION
  | 'orderTotalCents'   // number
  | 'medicationKey'      // string (normalized)
  | 'medName'           // string (primary rx med name)
  | 'form'              // string (e.g. INJECTION, CAPSULE)
  | 'rxCount'           // number of rxs on order
  | 'providerType';     // EONPRO | CLINIC

export type CustomFeeRuleConditionOperator =
  | 'eq' | 'neq' | 'gte' | 'lte' | 'gt' | 'lt'
  | 'in' | 'notIn'
  | 'contains' | 'startsWith' | 'endsWith';

export interface CustomFeeRuleCondition {
  field: CustomFeeRuleConditionField;
  operator: CustomFeeRuleConditionOperator;
  value: string | number | (string | number)[];
}

export type CustomFeeRuleAppliesTo = 'PRESCRIPTION' | 'TRANSMISSION' | 'BOTH';

export interface CustomFeeRuleCharge {
  type: 'FLAT' | 'PERCENTAGE';
  /** Flat amount in cents */
  amountCents?: number;
  /** Percentage in basis points (100 = 1%) when type is PERCENTAGE */
  basisPoints?: number;
  minCents?: number;
  maxCents?: number;
}

export interface CustomFeeRule {
  id: string;
  name?: string;
  /** Lower = evaluated first. Typical: 0, 10, 20, ... */
  priority: number;
  appliesTo?: CustomFeeRuleAppliesTo;
  /** All conditions must match (AND). */
  conditions: CustomFeeRuleCondition[];
  action: 'WAIVE' | 'CHARGE';
  charge?: CustomFeeRuleCharge;
}

export type CustomFeeRulesPayload = CustomFeeRule[] | null;

// ---------------------------------------------------------------------------
// Context passed into the rule engine (from order + config)
// ---------------------------------------------------------------------------

export interface CustomFeeRuleContext {
  feeType: PlatformFeeType;
  orderTotalCents: number | null;
  medicationKey: string;
  medName: string;
  form: string;
  rxCount: number;
  providerType: 'EONPRO' | 'CLINIC';
}

// ---------------------------------------------------------------------------
// Result of rule evaluation
// ---------------------------------------------------------------------------

export type CustomFeeRuleResult =
  | { action: 'WAIVE' }
  | { action: 'CHARGE'; amountCents: number; charge: CustomFeeRuleCharge };

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

function getContextValue(
  ctx: CustomFeeRuleContext,
  field: CustomFeeRuleConditionField
): string | number | null | undefined {
  switch (field) {
    case 'feeType':
      return ctx.feeType;
    case 'orderTotalCents':
      return ctx.orderTotalCents ?? 0;
    case 'medicationKey':
      return ctx.medicationKey;
    case 'medName':
      return ctx.medName;
    case 'form':
      return ctx.form;
    case 'rxCount':
      return ctx.rxCount;
    case 'providerType':
      return ctx.providerType;
    default:
      return undefined;
  }
}

function evaluateCondition(
  condition: CustomFeeRuleCondition,
  ctx: CustomFeeRuleContext
): boolean {
  const actual = getContextValue(ctx, condition.field);
  const expected = condition.value;
  const op = condition.operator;

  // Normalize for comparison: coerce to string for string ops, number for numeric
  const aStr = actual != null ? String(actual).toLowerCase() : '';
  const eStr = expected != null ? String(expected).toLowerCase() : '';
  const aNum = typeof actual === 'number' ? actual : Number(actual);
  const eNum = Array.isArray(expected) ? NaN : Number(expected);

  switch (op) {
    case 'eq':
      return actual === expected || aNum === eNum || aStr === eStr;
    case 'neq':
      return actual !== expected && aNum !== eNum && aStr !== eStr;
    case 'gte':
      return aNum >= eNum;
    case 'lte':
      return aNum <= eNum;
    case 'gt':
      return aNum > eNum;
    case 'lt':
      return aNum < eNum;
    case 'in':
      if (!Array.isArray(expected)) return false;
      return expected.some((v) => actual === v || aStr === String(v).toLowerCase());
    case 'notIn':
      if (!Array.isArray(expected)) return actual !== expected;
      return !expected.some((v) => actual === v || aStr === String(v).toLowerCase());
    case 'contains':
      return aStr.includes(eStr);
    case 'startsWith':
      return aStr.startsWith(eStr);
    case 'endsWith':
      return aStr.endsWith(eStr);
    default:
      return false;
  }
}

function matchesRule(rule: CustomFeeRule, ctx: CustomFeeRuleContext): boolean {
  if (rule.appliesTo && rule.appliesTo !== 'BOTH') {
    if (rule.appliesTo === 'PRESCRIPTION' && ctx.feeType !== 'PRESCRIPTION') return false;
    if (rule.appliesTo === 'TRANSMISSION' && ctx.feeType !== 'TRANSMISSION') return false;
  }
  if (!rule.conditions || rule.conditions.length === 0) return true;
  return rule.conditions.every((c) => evaluateCondition(c, ctx));
}

/**
 * Compute charge amount from a rule's charge config and order total.
 */
export function computeChargeAmount(
  charge: CustomFeeRuleCharge,
  orderTotalCents: number | null
): number {
  let amount: number;
  if (charge.type === 'FLAT') {
    amount = charge.amountCents ?? 0;
  } else {
    const basisPoints = charge.basisPoints ?? 0;
    const total = orderTotalCents ?? 0;
    amount = Math.round((total * basisPoints) / 10000);
  }
  if (charge.minCents != null && amount < charge.minCents) amount = charge.minCents;
  if (charge.maxCents != null && amount > charge.maxCents) amount = charge.maxCents;
  return Math.max(0, amount);
}

/**
 * Evaluate custom fee rules in priority order.
 * Returns the first matching rule's result, or null if no rules or no match (caller uses default config).
 */
export function evaluateCustomFeeRules(
  customFeeRules: CustomFeeRulesPayload,
  ctx: CustomFeeRuleContext
): CustomFeeRuleResult | null {
  if (!customFeeRules || !Array.isArray(customFeeRules) || customFeeRules.length === 0) {
    return null;
  }

  const sorted = [...customFeeRules].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

  for (const rule of sorted) {
    // Rules with no conditions match everything (catch-all)
    if (!matchesRule(rule as CustomFeeRule, ctx)) continue;

    logger.debug('[CustomFeeRules] Rule matched', {
      ruleId: rule.id,
      name: rule.name,
      action: rule.action,
    });

    if (rule.action === 'WAIVE') {
      return { action: 'WAIVE' };
    }

    if (rule.action === 'CHARGE' && rule.charge) {
      const amountCents = computeChargeAmount(rule.charge, ctx.orderTotalCents);
      return {
        action: 'CHARGE',
        amountCents,
        charge: rule.charge,
      };
    }
  }

  return null;
}

/**
 * Parse and validate customFeeRules from DB (JSON).
 */
export function parseCustomFeeRules(raw: unknown): CustomFeeRulesPayload {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  return raw as CustomFeeRule[];
}
