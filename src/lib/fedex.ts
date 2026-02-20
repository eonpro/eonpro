import { logger } from '@/lib/logger';
import { createCircuitBreaker, circuitBreakerRegistry } from '@/lib/resilience/circuitBreaker';
import { decryptPHI, isEncrypted } from '@/lib/security/phi-encryption';
import type { ShippingAdapter, IntegrationHealthResult } from '@/lib/integrations/adapter';
import { registerAdapter } from '@/lib/integrations/adapter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FedExCredentials = {
  clientId: string;
  clientSecret: string;
  accountNumber: string;
};

export type FedExAddress = {
  personName: string;
  companyName?: string;
  phoneNumber: string;
  address1: string;
  address2?: string | null;
  city: string;
  state: string;
  zip: string;
  countryCode?: string;
  residential?: boolean;
};

export type FedExPackageDetails = {
  weightLbs: number;
  length?: number;
  width?: number;
  height?: number;
};

export type CreateShipmentInput = {
  serviceType: string;
  packagingType: string;
  shipper: FedExAddress;
  recipient: FedExAddress;
  packages: FedExPackageDetails[];
  shipDate?: string; // YYYY-MM-DD, defaults to today
  oneRate?: boolean;
};

export type CreateShipmentResult = {
  trackingNumber: string;
  shipmentId: string;
  serviceType: string;
  labelPdfBase64: string;
};

// ---------------------------------------------------------------------------
// OAuth2 Token Management
// ---------------------------------------------------------------------------

type TokenEntry = {
  accessToken: string;
  expiresAt: number;
};

const tokenCache = new Map<string, TokenEntry>();

const FEDEX_API_BASE =
  process.env.FEDEX_SANDBOX === 'true'
    ? 'https://apis-sandbox.fedex.com'
    : 'https://apis.fedex.com';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 min before expiry

async function getAccessToken(credentials: FedExCredentials): Promise<string> {
  const cacheKey = credentials.clientId;
  const cached = tokenCache.get(cacheKey);

  if (cached && Date.now() < cached.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return cached.accessToken;
  }

  const response = await fetch(`${FEDEX_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('FedEx OAuth token request failed', {
      status: response.status,
      error: errorText,
    });
    throw new Error(`FedEx OAuth failed: ${response.status}`);
  }

  const data = await response.json();
  const expiresAt = Date.now() + data.expires_in * 1000;

  tokenCache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAt,
  });

  return data.access_token;
}

// ---------------------------------------------------------------------------
// Circuit Breaker
// ---------------------------------------------------------------------------

const fedexCircuitBreaker = createCircuitBreaker({
  name: 'fedex',
  timeout: 30000, // FedEx can be slow
  errorThreshold: 40,
  volumeThreshold: 5,
  sleepWindow: 60000,
  fallback: async () => {
    throw new Error('FedEx API is temporarily unavailable. Please try again.');
  },
});

circuitBreakerRegistry.register(fedexCircuitBreaker, 'fedex');

// ---------------------------------------------------------------------------
// API Helpers
// ---------------------------------------------------------------------------

async function fedexRequest<T>(
  credentials: FedExCredentials,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  return fedexCircuitBreaker.execute(async () => {
    const token = await getAccessToken(credentials);

    const response = await fetch(`${FEDEX_API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('FedEx API error', {
        status: response.status,
        path,
        error: errorBody.slice(0, 500),
      });
      throw new Error(`FedEx API error: ${response.status} - ${errorBody.slice(0, 200)}`);
    }

    return response.json() as Promise<T>;
  });
}

// ---------------------------------------------------------------------------
// Credential Resolution
// ---------------------------------------------------------------------------

function getEnvCredentials(): FedExCredentials | null {
  const clientId = process.env.FEDEX_CLIENT_ID;
  const clientSecret = process.env.FEDEX_CLIENT_SECRET;
  const accountNumber = process.env.FEDEX_ACCOUNT_NUMBER;

  if (!clientId || !clientSecret || !accountNumber) {
    return null;
  }

  return { clientId, clientSecret, accountNumber };
}

function maybeDecrypt(value: string): string {
  return isEncrypted(value) ? decryptPHI(value) : value;
}

export function resolveCredentials(clinic?: {
  fedexClientId?: string | null;
  fedexClientSecret?: string | null;
  fedexAccountNumber?: string | null;
  fedexEnabled?: boolean;
}): FedExCredentials {
  if (clinic?.fedexEnabled && clinic.fedexClientId && clinic.fedexClientSecret && clinic.fedexAccountNumber) {
    return {
      clientId: maybeDecrypt(clinic.fedexClientId),
      clientSecret: maybeDecrypt(clinic.fedexClientSecret),
      accountNumber: maybeDecrypt(clinic.fedexAccountNumber),
    };
  }

  const envCreds = getEnvCredentials();
  if (envCreds) return envCreds;

  throw new Error('FedEx credentials not configured. Set them in clinic settings or environment variables.');
}

// ---------------------------------------------------------------------------
// Ship API — Create Shipment
// ---------------------------------------------------------------------------

function buildShipmentPayload(
  credentials: FedExCredentials,
  input: CreateShipmentInput
) {
  const shipDate = input.shipDate || new Date().toISOString().split('T')[0];

  return {
    labelResponseOptions: 'LABEL',
    requestedShipment: {
      shipper: {
        contact: {
          personName: input.shipper.personName,
          ...(input.shipper.companyName && { companyName: input.shipper.companyName }),
          phoneNumber: input.shipper.phoneNumber.replace(/\D/g, ''),
        },
        address: {
          streetLines: [
            input.shipper.address1,
            ...(input.shipper.address2 ? [input.shipper.address2] : []),
          ],
          city: input.shipper.city,
          stateOrProvinceCode: input.shipper.state,
          postalCode: input.shipper.zip,
          countryCode: input.shipper.countryCode || 'US',
        },
      },
      recipients: [
        {
          contact: {
            personName: input.recipient.personName,
            ...(input.recipient.companyName && { companyName: input.recipient.companyName }),
            phoneNumber: input.recipient.phoneNumber.replace(/\D/g, ''),
          },
          address: {
            streetLines: [
              input.recipient.address1,
              ...(input.recipient.address2 ? [input.recipient.address2] : []),
            ],
            city: input.recipient.city,
            stateOrProvinceCode: input.recipient.state,
            postalCode: input.recipient.zip,
            countryCode: input.recipient.countryCode || 'US',
            residential: input.recipient.residential ?? true,
          },
        },
      ],
      shipDatestamp: shipDate,
      serviceType: input.serviceType,
      packagingType: input.packagingType,
      pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
      blockInsightVisibility: false,
      ...(input.oneRate
        ? {
            shipmentSpecialServices: {
              specialServiceTypes: ['FEDEX_ONE_RATE'],
            },
          }
        : {}),
      shippingChargesPayment: {
        paymentType: 'SENDER',
      },
      labelSpecification: {
        imageType: 'PDF',
        labelStockType: 'PAPER_4X6',
        labelFormatType: 'COMMON2D',
      },
      requestedPackageLineItems: input.packages.map((pkg, i) => ({
        sequenceNumber: i + 1,
        weight: {
          units: 'LB',
          value: pkg.weightLbs,
        },
        ...(pkg.length && pkg.width && pkg.height
          ? {
              dimensions: {
                length: Math.round(pkg.length),
                width: Math.round(pkg.width),
                height: Math.round(pkg.height),
                units: 'IN',
              },
            }
          : {}),
      })),
      accountNumber: {
        value: credentials.accountNumber,
      },
    },
  };
}

export async function createShipment(
  credentials: FedExCredentials,
  input: CreateShipmentInput
): Promise<CreateShipmentResult> {
  const payload = buildShipmentPayload(credentials, input);

  const result = await fedexRequest<any>(
    credentials,
    'POST',
    '/ship/v1/shipments',
    payload
  );

  const shipment = result.output?.transactionShipments?.[0];
  if (!shipment) {
    throw new Error('No shipment returned from FedEx');
  }

  const piece = shipment.pieceResponses?.[0];
  const trackingNumber =
    piece?.trackingNumber || shipment.masterTrackingNumber;

  const labelData =
    piece?.packageDocuments?.[0]?.encodedLabel ||
    shipment.shipmentDocuments?.[0]?.encodedLabel;

  if (!trackingNumber || !labelData) {
    logger.error('FedEx response missing tracking/label', {
      hasTracking: !!trackingNumber,
      hasLabel: !!labelData,
    });
    throw new Error('FedEx response missing tracking number or label data');
  }

  return {
    trackingNumber,
    shipmentId: shipment.masterTrackingNumber || trackingNumber,
    serviceType: input.serviceType,
    labelPdfBase64: labelData,
  };
}

// ---------------------------------------------------------------------------
// Ship API — Cancel Shipment
// ---------------------------------------------------------------------------

export async function cancelShipment(
  credentials: FedExCredentials,
  trackingNumber: string
): Promise<{ success: boolean }> {
  const payload = {
    accountNumber: { value: credentials.accountNumber },
    trackingNumber,
  };

  await fedexRequest<any>(
    credentials,
    'PUT',
    '/ship/v1/shipments/cancel',
    payload
  );

  return { success: true };
}

// ---------------------------------------------------------------------------
// Integration Adapter Registration
// ---------------------------------------------------------------------------

class FedExShippingAdapter implements ShippingAdapter {
  readonly name = 'fedex';
  readonly version = '1.0.0';

  isConfigured(): boolean {
    try {
      resolveCredentials();
      return true;
    } catch {
      return false;
    }
  }

  async healthCheck(): Promise<IntegrationHealthResult> {
    const start = Date.now();
    try {
      const creds = resolveCredentials();
      await getAccessToken(creds);
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        message: 'OAuth2 token acquired successfully',
        lastChecked: new Date(),
      };
    } catch (err: unknown) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : 'Unknown error',
        lastChecked: new Date(),
      };
    }
  }

  async createLabel(params: {
    serviceType: string;
    packagingType: string;
    shipper: FedExAddress;
    recipient: FedExAddress;
    weightLbs: number;
    length?: number;
    width?: number;
    height?: number;
  }) {
    const creds = resolveCredentials();
    return createShipment(creds, {
      serviceType: params.serviceType,
      packagingType: params.packagingType,
      shipper: params.shipper,
      recipient: params.recipient,
      packages: [{ weightLbs: params.weightLbs, length: params.length, width: params.width, height: params.height }],
    });
  }

  async voidLabel(trackingNumber: string) {
    const creds = resolveCredentials();
    return cancelShipment(creds, trackingNumber);
  }
}

registerAdapter('fedex', new FedExShippingAdapter());
