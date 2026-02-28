/**
 * Runtime enum validation utilities for Prisma enums.
 *
 * Prisma generates enums as plain objects. These helpers validate that a raw
 * string is a member before passing it into a typed Prisma operation, turning
 * what would be a silent runtime error into an explicit validation failure.
 */

import { ValidationError } from '@/domains/shared/errors';

/**
 * Assert that `value` is a valid member of the given enum-like object.
 * Throws `ValidationError` with a descriptive message if not.
 */
export function assertEnum<T extends Record<string, string>>(
  enumObj: T,
  value: unknown,
  label: string
): T[keyof T] {
  const members = Object.values(enumObj) as string[];
  if (typeof value !== 'string' || !members.includes(value)) {
    throw new ValidationError(
      `Invalid ${label}: "${String(value)}". Expected one of: ${members.join(', ')}`
    );
  }
  return value as T[keyof T];
}

/**
 * Check if `value` is a valid member of the given enum-like object.
 * Returns the narrowed type or `undefined` (no throw).
 */
export function toEnum<T extends Record<string, string>>(
  enumObj: T,
  value: unknown
): T[keyof T] | undefined {
  const members = Object.values(enumObj) as string[];
  if (typeof value === 'string' && members.includes(value)) {
    return value as T[keyof T];
  }
  return undefined;
}
