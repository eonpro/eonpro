/**
 * Client-safe address utilities (no Prisma/DB/analytics).
 * Use this in 'use client' components to avoid pulling node:async_hooks into the client bundle.
 * For server code, use @/lib/address.
 */
export type { ParsedAddress } from './types';
export {
  parseAddressString,
  extractAddressFromPayload,
  smartParseAddress,
  tryParseJsonAddress,
  isApartmentString,
  isStateName,
  isZipCode,
  extractZipFromString,
  extractCityState,
} from './parser';
export {
  normalizeState,
  normalizeZip,
  normalizeCity,
} from './normalizer';
