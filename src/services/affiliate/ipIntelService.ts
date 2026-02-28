/**
 * IP Intelligence Service
 *
 * Provides IP address analysis for fraud detection.
 * Caches results in database for performance.
 *
 * Supports integration with:
 * - IPQualityScore
 * - MaxMind GeoIP2
 * - Internal heuristics
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getRequestId } from '@/lib/observability/request-context';
import { circuitBreakers } from '@/lib/resilience/circuitBreaker';
import crypto from 'crypto';

export interface IpIntelResult {
  ipHash: string;
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  isp: string | null;
  isProxy: boolean;
  isVpn: boolean;
  isTor: boolean;
  isDatacenter: boolean;
  isBot: boolean;
  riskScore: number; // 0-100
  fraudScore: number; // 0-100
  cached: boolean;
}

interface IpQualityScoreResponse {
  success: boolean;
  country_code: string;
  region: string;
  city: string;
  ISP: string;
  ASN: number;
  organization: string;
  is_crawler: boolean;
  timezone: string;
  mobile: boolean;
  host: string;
  proxy: boolean;
  vpn: boolean;
  tor: boolean;
  active_vpn: boolean;
  active_tor: boolean;
  recent_abuse: boolean;
  bot_status: boolean;
  connection_type: string;
  abuse_velocity: string;
  fraud_score: number;
  latitude: number;
  longitude: number;
}

const CACHE_TTL_HOURS = 24;

/**
 * Hash an IP address for storage
 */
export function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(`aff_ip:${ip}`).digest('hex');
}

/**
 * Check if cached result exists and is valid
 */
async function getCachedResult(ipHash: string): Promise<IpIntelResult | null> {
  const cached = await prisma.affiliateIpIntel.findUnique({
    where: { ipHash },
  });

  if (!cached) return null;

  // Check if expired
  if (cached.expiresAt < new Date()) {
    // Delete expired entry
    await prisma.affiliateIpIntel.delete({ where: { id: cached.id } });
    return null;
  }

  return {
    ipHash: cached.ipHash,
    country: cached.country,
    countryCode: cached.countryCode,
    region: cached.region,
    city: cached.city,
    isp: cached.isp,
    isProxy: cached.isProxy,
    isVpn: cached.isVpn,
    isTor: cached.isTor,
    isDatacenter: cached.isDatacenter,
    isBot: cached.isBot || cached.isCrawler,
    riskScore: cached.riskScore,
    fraudScore: cached.fraudScore,
    cached: true,
  };
}

/**
 * Query IPQualityScore API
 */
async function queryIpQualityScore(ip: string): Promise<IpIntelResult | null> {
  const apiKey = process.env.IPQUALITYSCORE_API_KEY;

  if (!apiKey) {
    logger.warn('[IpIntel] IPQUALITYSCORE_API_KEY not configured');
    return null;
  }

  try {
    const params = new URLSearchParams({
      strictness: '1',
      allow_public_access_points: 'true',
      fast: 'false',
      lighter_penalties: 'false',
    });

    const response = await circuitBreakers.ipIntel.execute(async () => {
      const res = await fetch(
        `https://ipqualityscore.com/api/json/ip/${apiKey}/${ip}?${params}`,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
        }
      );

      if (!res.ok) {
        throw new Error(`IPQualityScore API error: ${res.status}`);
      }

      return res;
    });

    if (!response) return null;

    const data: IpQualityScoreResponse = await response.json();

    if (!data.success) {
      return null;
    }

    // Calculate risk score based on various factors
    let riskScore = data.fraud_score;

    // Boost risk for known bad indicators
    if (data.tor || data.active_tor) riskScore = Math.max(riskScore, 90);
    if (data.proxy && data.vpn) riskScore = Math.max(riskScore, 75);
    if (data.recent_abuse) riskScore = Math.min(100, riskScore + 15);
    if (data.bot_status) riskScore = Math.min(100, riskScore + 20);

    return {
      ipHash: hashIp(ip),
      country: null, // Will be set from country_code
      countryCode: data.country_code,
      region: data.region,
      city: data.city,
      isp: data.ISP,
      isProxy: data.proxy,
      isVpn: data.vpn,
      isTor: data.tor || data.active_tor,
      isDatacenter: data.connection_type === 'Data Center',
      isBot: data.bot_status || data.is_crawler,
      riskScore: Math.min(100, riskScore),
      fraudScore: data.fraud_score,
      cached: false,
    };
  } catch (error) {
    logger.error('[IpIntel] Failed to query IPQualityScore', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Fallback heuristic analysis when no API is available
 */
function heuristicAnalysis(ip: string): IpIntelResult {
  const ipHash = hashIp(ip);

  // Very basic heuristics
  let riskScore = 0;
  let isDatacenter = false;

  // Check for common datacenter IP ranges (simplified)
  const datacenterPrefixes = [
    '52.',
    '54.',
    '35.', // AWS
    '104.',
    '172.', // Google Cloud
    '40.',
    '52.',
    '13.', // Azure
    '198.51.',
    '203.0.', // Documentation ranges (shouldn't be real traffic)
  ];

  for (const prefix of datacenterPrefixes) {
    if (ip.startsWith(prefix)) {
      isDatacenter = true;
      riskScore = 50;
      break;
    }
  }

  // Local/private IPs are suspicious for production traffic
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.16.')) {
    riskScore = 60;
  }

  return {
    ipHash,
    country: null,
    countryCode: null,
    region: null,
    city: null,
    isp: null,
    isProxy: false,
    isVpn: false,
    isTor: false,
    isDatacenter,
    isBot: false,
    riskScore,
    fraudScore: riskScore,
    cached: false,
  };
}

/**
 * Cache the result in the database
 */
async function cacheResult(result: IpIntelResult): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + CACHE_TTL_HOURS);

  try {
    await prisma.affiliateIpIntel.upsert({
      where: { ipHash: result.ipHash },
      update: {
        country: result.country,
        countryCode: result.countryCode,
        region: result.region,
        city: result.city,
        isp: result.isp,
        isProxy: result.isProxy,
        isVpn: result.isVpn,
        isTor: result.isTor,
        isDatacenter: result.isDatacenter,
        isBot: result.isBot,
        isCrawler: false,
        riskScore: result.riskScore,
        fraudScore: result.fraudScore,
        provider: 'ipqualityscore',
        expiresAt,
        updatedAt: new Date(),
      },
      create: {
        ipHash: result.ipHash,
        country: result.country,
        countryCode: result.countryCode,
        region: result.region,
        city: result.city,
        isp: result.isp,
        isProxy: result.isProxy,
        isVpn: result.isVpn,
        isTor: result.isTor,
        isDatacenter: result.isDatacenter,
        isBot: result.isBot,
        isCrawler: false,
        riskScore: result.riskScore,
        fraudScore: result.fraudScore,
        provider: 'ipqualityscore',
        expiresAt,
      },
    });
  } catch (error) {
    logger.error('[IpIntel] Failed to cache result', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Analyze an IP address
 */
export async function analyzeIp(ip: string): Promise<IpIntelResult> {
  const ipHash = hashIp(ip);

  // Check cache first
  const cached = await getCachedResult(ipHash);
  if (cached) {
    return cached;
  }

  // Try IPQualityScore API
  const apiResult = await queryIpQualityScore(ip);
  if (apiResult) {
    await cacheResult(apiResult);
    return apiResult;
  }

  // Fall back to heuristics
  const heuristicResult = heuristicAnalysis(ip);
  await cacheResult(heuristicResult);
  return heuristicResult;
}

/**
 * Batch analyze multiple IPs
 */
export async function analyzeIps(ips: string[]): Promise<Map<string, IpIntelResult>> {
  const results = new Map<string, IpIntelResult>();

  // Process in parallel with concurrency limit
  const batchSize = 5;
  for (let i = 0; i < ips.length; i += batchSize) {
    const batch = ips.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((ip) => analyzeIp(ip)));

    batch.forEach((ip, index) => {
      results.set(ip, batchResults[index]);
    });
  }

  return results;
}

/**
 * Clean up expired cache entries
 */
export async function cleanupExpiredCache(): Promise<number> {
  const result = await prisma.affiliateIpIntel.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });

  logger.info('[IpIntel] Cleaned up expired cache', { deleted: result.count });
  return result.count;
}
