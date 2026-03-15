import { logger } from '@/lib/logger';
import { createCircuitBreaker, circuitBreakerRegistry } from '@/lib/resilience/circuitBreaker';
import { decryptPHI, isEncrypted } from '@/lib/security/phi-encryption';
import type { ShippingAdapter, IntegrationHealthResult } from '@/lib/integrations/adapter';
import { registerAdapter } from '@/lib/integrations/adapter';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FedExCredentials = {
  clientId: string;
  clientSecret: string;
  accountNumber: string;
};

export type FedExCredentialSource = 'clinic' | 'env';
export type FedExEnvironment = 'sandbox' | 'production';

export type FedExCredentialResolution = {
  credentials: FedExCredentials;
  source: FedExCredentialSource;
  environment: FedExEnvironment;
  accountFingerprint: string;
  usedEnvFallback: boolean;
  clinicConfigComplete: boolean;
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

export type LabelFormat = 'PDF' | 'ZPLII' | 'PNG';

export type CreateShipmentInput = {
  serviceType: string;
  packagingType: string;
  shipper: FedExAddress;
  recipient: FedExAddress;
  packages: FedExPackageDetails[];
  shipDate?: string; // YYYY-MM-DD, defaults to today
  oneRate?: boolean;
  labelFormat?: LabelFormat;
};

export type CreateShipmentResult = {
  trackingNumber: string;
  shipmentId: string;
  serviceType: string;
  labelPdfBase64: string;
  labelFormat: LabelFormat;
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

function getFedExEnvironment(): FedExEnvironment {
  return process.env.FEDEX_SANDBOX === 'true' ? 'sandbox' : 'production';
}

function toAccountFingerprint(accountNumber: string): string {
  const last4 = accountNumber.slice(-4).padStart(4, '*');
  const hash8 = crypto.createHash('sha256').update(accountNumber).digest('hex').slice(0, 8);
  return `${last4}-${hash8}`;
}

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
    signal: AbortSignal.timeout(30000),
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
      signal: AbortSignal.timeout(30000),
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

/**
 * Resolve credentials for Track API specifically.
 * FedEx may require Track API on a separate project with different credentials.
 * Falls back to the main Ship API credentials if track-specific ones aren't set.
 */
export function resolveTrackCredentials(): FedExCredentials | null {
  const trackClientId = process.env.FEDEX_TRACK_CLIENT_ID;
  const trackClientSecret = process.env.FEDEX_TRACK_CLIENT_SECRET;
  const trackAccountNumber = process.env.FEDEX_TRACK_ACCOUNT_NUMBER || process.env.FEDEX_ACCOUNT_NUMBER;

  if (trackClientId && trackClientSecret && trackAccountNumber) {
    return { clientId: trackClientId, clientSecret: trackClientSecret, accountNumber: trackAccountNumber };
  }

  return getEnvCredentials();
}

function maybeDecrypt(value: string): string {
  return isEncrypted(value) ? (decryptPHI(value) || '') : value;
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

export function resolveCredentialsWithAttribution(
  clinic?: {
    id?: number;
    fedexClientId?: string | null;
    fedexClientSecret?: string | null;
    fedexAccountNumber?: string | null;
    fedexEnabled?: boolean;
  },
  options?: {
    allowEnvFallback?: boolean;
  }
): FedExCredentialResolution {
  const allowEnvFallback = options?.allowEnvFallback === true;
  const environment = getFedExEnvironment();

  const clinicHasAnyConfig = Boolean(
    clinic?.fedexClientId || clinic?.fedexClientSecret || clinic?.fedexAccountNumber
  );
  const clinicConfigComplete = Boolean(
    clinic?.fedexEnabled &&
      clinic?.fedexClientId &&
      clinic?.fedexClientSecret &&
      clinic?.fedexAccountNumber
  );

  if (clinicConfigComplete) {
    const credentials: FedExCredentials = {
      clientId: maybeDecrypt(clinic!.fedexClientId!),
      clientSecret: maybeDecrypt(clinic!.fedexClientSecret!),
      accountNumber: maybeDecrypt(clinic!.fedexAccountNumber!),
    };
    return {
      credentials,
      source: 'clinic',
      environment,
      accountFingerprint: toAccountFingerprint(credentials.accountNumber),
      usedEnvFallback: false,
      clinicConfigComplete: true,
    };
  }

  // Guardrail: if clinic has any FedEx config (or is enabled) but is incomplete,
  // fail closed unless explicit env fallback is allowed.
  if (clinic?.fedexEnabled || clinicHasAnyConfig) {
    if (!allowEnvFallback) {
      throw new Error(
        'Clinic FedEx configuration is incomplete. Provide client ID, client secret, and account number, or disable clinic FedEx.'
      );
    }
  }

  const envCreds = getEnvCredentials();
  if (!envCreds) {
    throw new Error('FedEx credentials not configured. Set them in clinic settings or environment variables.');
  }

  if (clinic?.id && (clinic?.fedexEnabled || clinicHasAnyConfig)) {
    logger.warn('[FedEx] Using environment fallback credentials for clinic shipping', {
      clinicId: clinic.id,
      environment,
      accountFingerprint: toAccountFingerprint(envCreds.accountNumber),
      reason: clinic.fedexEnabled ? 'clinic_enabled_but_incomplete' : 'clinic_partial_configuration',
    });
  }

  return {
    credentials: envCreds,
    source: 'env',
    environment,
    accountFingerprint: toAccountFingerprint(envCreds.accountNumber),
    usedEnvFallback: true,
    clinicConfigComplete: false,
  };
}

export function fedexEnvironment(): FedExEnvironment {
  return getFedExEnvironment();
}

// ---------------------------------------------------------------------------
// Ship API — Create Shipment
// ---------------------------------------------------------------------------

function getTodayInTimezone(tz: string = 'America/New_York'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function buildShipmentPayload(
  credentials: FedExCredentials,
  input: CreateShipmentInput
) {
  const shipDate = input.shipDate || getTodayInTimezone();

  return {
    labelResponseOptions: 'LABEL',
    accountNumber: { value: credentials.accountNumber },
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
        payor: {
          responsibleParty: {
            accountNumber: { value: credentials.accountNumber },
          },
        },
      },
      labelSpecification: {
        imageType: input.labelFormat || 'PDF',
        labelStockType: (input.labelFormat === 'ZPLII' || input.labelFormat === 'PNG')
          ? 'STOCK_4X6'
          : 'PAPER_4X6',
        labelFormatType: 'COMMON2D',
        labelPrintingOrientation: 'TOP_EDGE_OF_TEXT_FIRST',
        labelRotation: 'NONE',
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
    labelFormat: input.labelFormat || 'PDF',
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
// Rate API — Get Rate Quote
// ---------------------------------------------------------------------------

export type RateQuoteInput = {
  serviceType: string;
  packagingType: string;
  shipper: FedExAddress;
  recipient: FedExAddress;
  packages: FedExPackageDetails[];
  oneRate?: boolean;
};

export type RateQuoteResult = {
  serviceType: string;
  serviceName: string;
  totalCharge: number;
  currency: string;
  surcharges: { type: string; description: string; amount: number }[];
  transitDays: string | null;
};

function buildRatePayload(
  credentials: FedExCredentials,
  input: RateQuoteInput
) {
  const shipDate = getTodayInTimezone();

  return {
    accountNumber: { value: credentials.accountNumber },
    rateRequestControlParameters: {
      returnTransitTimes: true,
    },
    requestedShipment: {
      rateRequestType: ['ACCOUNT'],
      shipper: {
        address: {
          streetLines: [input.shipper.address1],
          city: input.shipper.city,
          stateOrProvinceCode: input.shipper.state,
          postalCode: input.shipper.zip,
          countryCode: input.shipper.countryCode || 'US',
        },
      },
      recipient: {
        address: {
          streetLines: [input.recipient.address1],
          city: input.recipient.city,
          stateOrProvinceCode: input.recipient.state,
          postalCode: input.recipient.zip,
          countryCode: input.recipient.countryCode || 'US',
          residential: input.recipient.residential ?? true,
        },
      },
      serviceType: input.serviceType,
      packagingType: input.packagingType,
      pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
      shipDateStamp: shipDate,
      ...(input.oneRate
        ? {
            shipmentSpecialServices: {
              specialServiceTypes: ['FEDEX_ONE_RATE'],
            },
          }
        : {}),
      requestedPackageLineItems: input.packages.map((pkg) => ({
        weight: { units: 'LB', value: pkg.weightLbs },
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
    },
  };
}

export async function getRateQuote(
  credentials: FedExCredentials,
  input: RateQuoteInput
): Promise<RateQuoteResult> {
  const payload = buildRatePayload(credentials, input);

  const result = await fedexRequest<any>(
    credentials,
    'POST',
    '/rate/v1/rates/quotes',
    payload
  );

  const rateDetail = result.output?.rateReplyDetails?.[0];
  if (!rateDetail) {
    throw new Error('No rate quote returned from FedEx');
  }

  const rated = rateDetail.ratedShipmentDetails?.[0];
  const totalCharge = rated?.totalNetCharge ?? rated?.totalNetFedExCharge ?? 0;
  const currency = rated?.currency ?? 'USD';

  const surcharges = (rated?.shipmentRateDetail?.surCharges || []).map(
    (s: any) => ({
      type: s.type || s.surchargeType || 'UNKNOWN',
      description: s.description || s.type || '',
      amount: s.amount ?? 0,
    })
  );

  const transitDays =
    rateDetail.commit?.transitDays?.description ||
    rateDetail.commit?.dateDetail?.dayFormat ||
    null;

  return {
    serviceType: rateDetail.serviceType || input.serviceType,
    serviceName: rateDetail.serviceName || input.serviceType,
    totalCharge: typeof totalCharge === 'number' ? totalCharge : parseFloat(totalCharge) || 0,
    currency,
    surcharges,
    transitDays,
  };
}

// ---------------------------------------------------------------------------
// Track API — Shipment Tracking
// ---------------------------------------------------------------------------

export type ShippingStatusValue =
  | 'PENDING'
  | 'LABEL_CREATED'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'RETURNED'
  | 'EXCEPTION'
  | 'CANCELLED';

export type TrackingScanEvent = {
  date: string;
  description: string;
  city?: string;
  state?: string;
  countryCode?: string;
  statusCode: string;
};

export type AvailableImage = {
  type: string;
  size?: string;
};

export type DeliveryDetail = {
  receivedByName: string | null;
  deliveryLocation: string | null;
  deliveryLocationType: string | null;
  signatureUrl: string | null;
  photoUrl: string | null;
  availableImages: AvailableImage[];
  rawDeliveryDetails: Record<string, unknown> | null;
};

export type TrackingResult = {
  trackingNumber: string;
  status: ShippingStatusValue;
  statusDescription: string;
  statusDetail: string | null;
  estimatedDelivery: Date | null;
  actualDelivery: Date | null;
  signedBy: string | null;
  location: { city?: string; state?: string; countryCode?: string } | null;
  deliveryDetail: DeliveryDetail | null;
  scanEvents: TrackingScanEvent[];
  raw: unknown;
};

const FEDEX_STATUS_MAP: Record<string, ShippingStatusValue> = {
  // Ready for shipment / label created
  OC: 'LABEL_CREATED',
  OF: 'LABEL_CREATED',

  // Picked up
  PU: 'SHIPPED',

  // In transit
  IT: 'IN_TRANSIT',
  AA: 'IN_TRANSIT',
  AC: 'IN_TRANSIT',
  AD: 'IN_TRANSIT',
  AF: 'IN_TRANSIT',
  AP: 'IN_TRANSIT',
  AR: 'IN_TRANSIT',
  AX: 'IN_TRANSIT',
  CC: 'IN_TRANSIT',
  CP: 'IN_TRANSIT',
  DP: 'IN_TRANSIT',
  DR: 'IN_TRANSIT',
  DS: 'IN_TRANSIT',
  EA: 'IN_TRANSIT',
  ED: 'IN_TRANSIT',
  EO: 'IN_TRANSIT',
  EP: 'IN_TRANSIT',
  FD: 'IN_TRANSIT',
  LO: 'IN_TRANSIT',
  OX: 'IN_TRANSIT',
  PF: 'IN_TRANSIT',
  PL: 'IN_TRANSIT',
  PM: 'IN_TRANSIT',
  SF: 'IN_TRANSIT',
  SP: 'IN_TRANSIT',
  TR: 'IN_TRANSIT',

  // Out for delivery / ready for pickup
  OD: 'OUT_FOR_DELIVERY',
  HL: 'OUT_FOR_DELIVERY',

  // Delivered
  DL: 'DELIVERED',

  // Returning to sender
  RS: 'RETURNED',
  RP: 'RETURNED',

  // Delivery problems / exceptions
  CA: 'EXCEPTION',
  CD: 'EXCEPTION',
  CH: 'EXCEPTION',
  DD: 'EXCEPTION',
  DE: 'EXCEPTION',
  DY: 'EXCEPTION',
  IX: 'EXCEPTION',
  LP: 'EXCEPTION',
  PD: 'EXCEPTION',
  PX: 'EXCEPTION',
  RC: 'EXCEPTION',
  RD: 'EXCEPTION',
  RG: 'EXCEPTION',
  RM: 'EXCEPTION',
  RR: 'EXCEPTION',
  SE: 'EXCEPTION',
};

export function isFedExTrackingNumber(tn: string): boolean {
  return /^\d{12}$|^\d{15}$|^\d{20}$|^\d{22}$/.test(tn.trim());
}

function mapFedExStatus(code: string | undefined): ShippingStatusValue {
  if (!code) return 'PENDING';
  return FEDEX_STATUS_MAP[code.toUpperCase()] ?? 'IN_TRANSIT';
}

function parseFedExDateTime(dateStr: string | undefined | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function extractDateByType(
  dateAndTimes: Array<{ type?: string; dateTime?: string }> | undefined,
  type: string
): Date | null {
  if (!dateAndTimes) return null;
  const entry = dateAndTimes.find(
    (d) => d.type?.toUpperCase() === type.toUpperCase()
  );
  return parseFedExDateTime(entry?.dateTime);
}

function buildLocationString(loc: { city?: string; stateOrProvinceCode?: string; state?: string } | undefined): string {
  if (!loc) return '';
  const city = loc.city || '';
  const state = loc.stateOrProvinceCode || loc.state || '';
  return [city, state].filter(Boolean).join(', ');
}

function parseTrackResult(trackingNumber: string, trackResult: any): TrackingResult | null {
  if (!trackResult) return null;

  const errorCode = trackResult.error?.code;
  if (errorCode === 'TRACKING.TRACKINGNUMBER.NOTFOUND') {
    logger.info('[FedEx Track] Tracking number not found (may be sandbox)', { trackingNumber });
    return null;
  }
  if (trackResult.error) {
    logger.warn('[FedEx Track] Track result error', {
      trackingNumber,
      errorCode,
      errorMessage: trackResult.error?.message?.slice(0, 200),
    });
    return null;
  }

  const latest = trackResult.latestStatusDetail || {};
  const statusCode: string = latest.code || '';
  const status = mapFedExStatus(statusCode);
  const statusDescription = latest.statusByLocale || latest.description || statusCode;
  const statusDetail = latest.ancillaryDetail?.reason || latest.ancillaryDetail?.reasonDetail || null;

  const scanLocation = latest.scanLocation || {};
  const location = (scanLocation.city || scanLocation.stateOrProvinceCode)
    ? {
        city: scanLocation.city,
        state: scanLocation.stateOrProvinceCode,
        countryCode: scanLocation.countryCode,
      }
    : null;

  const dateAndTimes: Array<{ type?: string; dateTime?: string }> = trackResult.dateAndTimes || [];
  const estimatedDelivery =
    extractDateByType(dateAndTimes, 'ESTIMATED_DELIVERY') ||
    extractDateByType(dateAndTimes, 'ANTICIPATED_TENDER');
  const actualDelivery = extractDateByType(dateAndTimes, 'ACTUAL_DELIVERY');

  const signedBy: string | null = trackResult.deliveryDetails?.receivedByName || null;

  let deliveryDetail: DeliveryDetail | null = null;
  if (trackResult.deliveryDetails) {
    const dd = trackResult.deliveryDetails;
    const attempt = dd.deliveryAttempts?.[0];

    // FedEx may nest photo/signature URLs under various keys; search broadly
    const findUrl = (...keys: string[]): string | null => {
      for (const k of keys) {
        if (dd[k] && typeof dd[k] === 'string') return dd[k];
        if (attempt?.[k] && typeof attempt[k] === 'string') return attempt[k];
      }
      return null;
    };

    const rawAvailableImages: any[] = trackResult.availableImages || [];
    const availableImages: AvailableImage[] = rawAvailableImages.map((img: any) => ({
      type: img.type || '',
      size: img.size || undefined,
    }));

    deliveryDetail = {
      receivedByName: dd.receivedByName || null,
      deliveryLocation: dd.actualDeliveryAddress
        ? buildLocationString(dd.actualDeliveryAddress)
        : null,
      deliveryLocationType: dd.locationType || attempt?.deliveryOptionEligibilityDetails?.[0]?.option || null,
      signatureUrl: findUrl('signatureUrl', 'proofOfDeliveryURL', 'signatureImageUrl', 'signatureProofOfDeliveryURL'),
      photoUrl: findUrl('photoUrl', 'pictureProofOfDeliveryURL', 'pictureProofURL', 'deliveryPhotoUrl', 'imageUrl', 'proofOfDeliveryImageURL'),
      availableImages,
      rawDeliveryDetails: dd,
    };
  } else if (trackResult.availableImages) {
    const rawAvailableImages: any[] = trackResult.availableImages || [];
    deliveryDetail = {
      receivedByName: null,
      deliveryLocation: null,
      deliveryLocationType: null,
      signatureUrl: null,
      photoUrl: null,
      availableImages: rawAvailableImages.map((img: any) => ({ type: img.type || '', size: img.size || undefined })),
      rawDeliveryDetails: null,
    };
  }

  const rawScanEvents: any[] = trackResult.scanEvents || [];
  const scanEvents: TrackingScanEvent[] = rawScanEvents.slice(0, 50).map((ev: any) => ({
    date: ev.date || '',
    description: ev.eventDescription || ev.eventType || '',
    city: ev.scanLocation?.city,
    state: ev.scanLocation?.stateOrProvinceCode,
    countryCode: ev.scanLocation?.countryCode,
    statusCode: ev.derivedStatusCode || ev.eventType || '',
  }));

  const locationStr = buildLocationString(scanLocation);
  const fullStatusDetail = [
    statusDescription,
    locationStr ? `- ${locationStr}` : '',
    signedBy ? `Signed by: ${signedBy}` : '',
  ].filter(Boolean).join(' ');

  return {
    trackingNumber,
    status,
    statusDescription,
    statusDetail: fullStatusDetail || statusDetail,
    estimatedDelivery,
    actualDelivery,
    signedBy,
    location,
    deliveryDetail,
    scanEvents,
    raw: trackResult,
  };
}

// TTL cache: don't re-poll the same tracking number within TRACK_CACHE_TTL_MS
const TRACK_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const trackingCache = new Map<string, { result: TrackingResult | null; cachedAt: number }>();

function getCachedTracking(trackingNumber: string): TrackingResult | null | undefined {
  const entry = trackingCache.get(trackingNumber);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > TRACK_CACHE_TTL_MS) {
    trackingCache.delete(trackingNumber);
    return undefined;
  }
  return entry.result;
}

function setCachedTracking(trackingNumber: string, result: TrackingResult | null): void {
  trackingCache.set(trackingNumber, { result, cachedAt: Date.now() });
  // Evict old entries if cache grows beyond 500
  if (trackingCache.size > 500) {
    const now = Date.now();
    for (const [key, val] of trackingCache) {
      if (now - val.cachedAt > TRACK_CACHE_TTL_MS) trackingCache.delete(key);
    }
  }
}

function getEffectiveTrackCredentials(credentials: FedExCredentials): FedExCredentials {
  const trackCreds = resolveTrackCredentials();
  return trackCreds || credentials;
}

export async function trackShipment(
  credentials: FedExCredentials,
  trackingNumber: string,
  options?: { skipCache?: boolean }
): Promise<TrackingResult | null> {
  if (!options?.skipCache) {
    const cached = getCachedTracking(trackingNumber);
    if (cached !== undefined) return cached;
  }

  const effectiveCreds = getEffectiveTrackCredentials(credentials);

  const payload = {
    trackingInfo: [
      { trackingNumberInfo: { trackingNumber } },
    ],
    includeDetailedScans: true,
  };

  let response: any;
  try {
    response = await fedexRequest<any>(
      effectiveCreds,
      'POST',
      '/track/v1/trackingnumbers',
      payload
    );
  } catch (err) {
    logger.error('[FedEx Track] API call failed', {
      trackingNumber,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  const completeTrackResult = response.output?.completeTrackResults?.[0];
  const trackResult = completeTrackResult?.trackResults?.[0];

  const result = parseTrackResult(trackingNumber, trackResult);
  setCachedTracking(trackingNumber, result);
  return result;
}

export async function trackShipmentBatch(
  credentials: FedExCredentials,
  trackingNumbers: string[],
  options?: { skipCache?: boolean }
): Promise<Map<string, TrackingResult | null>> {
  const effectiveCreds = getEffectiveTrackCredentials(credentials);
  const results = new Map<string, TrackingResult | null>();

  // Separate cached vs. uncached
  const toFetch: string[] = [];
  for (const tn of trackingNumbers) {
    if (!options?.skipCache) {
      const cached = getCachedTracking(tn);
      if (cached !== undefined) {
        results.set(tn, cached);
        continue;
      }
    }
    toFetch.push(tn);
  }

  if (toFetch.length === 0) return results;

  // FedEx allows up to 30 tracking numbers per request
  const BATCH_SIZE = 30;
  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);
    const payload = {
      trackingInfo: batch.map((tn) => ({
        trackingNumberInfo: { trackingNumber: tn },
      })),
      includeDetailedScans: true,
    };

    let response: any;
    try {
      response = await fedexRequest<any>(
        effectiveCreds,
        'POST',
        '/track/v1/trackingnumbers',
        payload
      );
    } catch (err) {
      logger.error('[FedEx Track] Batch API call failed', {
        batchSize: batch.length,
        error: err instanceof Error ? err.message : String(err),
      });
      for (const tn of batch) results.set(tn, null);
      continue;
    }

    const completeTrackResults: any[] = response.output?.completeTrackResults || [];
    for (const ctr of completeTrackResults) {
      const tn: string = ctr.trackingNumber || '';
      const trackResult = ctr.trackResults?.[0];
      const parsed = parseTrackResult(tn, trackResult);
      setCachedTracking(tn, parsed);
      results.set(tn, parsed);
    }

    // Mark any tracking numbers not returned as null
    for (const tn of batch) {
      if (!results.has(tn)) {
        setCachedTracking(tn, null);
        results.set(tn, null);
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Track API — Proof of Delivery Document (SPOD / Picture POD)
// ---------------------------------------------------------------------------

export type ProofOfDeliveryResult = {
  trackingNumber: string;
  documentBase64: string;
  documentFormat: string;
  documentType: string;
};

export async function getProofOfDelivery(
  credentials: FedExCredentials,
  trackingNumber: string,
  options?: { format?: 'PNG' | 'PDF' }
): Promise<ProofOfDeliveryResult | null> {
  const effectiveCreds = getEffectiveTrackCredentials(credentials);
  const format = options?.format || 'PNG';

  const payload = {
    trackDocumentSpecification: [
      {
        trackingNumberInfo: { trackingNumber },
        documentType: 'SIGNATURE_PROOF_OF_DELIVERY',
        documentFormat: format,
      },
    ],
    accountNumber: { value: effectiveCreds.accountNumber },
  };

  try {
    const response = await fedexRequest<any>(
      effectiveCreds,
      'POST',
      '/track/v1/trackingdocuments',
      payload
    );

    const docResponse = response.output?.documentResultList?.[0];
    const doc = docResponse?.documents?.[0];

    if (doc?.encodedDocuments) {
      return {
        trackingNumber,
        documentBase64: doc.encodedDocuments,
        documentFormat: doc.documentFormat || format,
        documentType: doc.documentType || 'SIGNATURE_PROOF_OF_DELIVERY',
      };
    }

    const alertDoc = docResponse?.trackDocumentDetail;
    if (alertDoc?.document) {
      return {
        trackingNumber,
        documentBase64: alertDoc.document,
        documentFormat: format,
        documentType: 'SIGNATURE_PROOF_OF_DELIVERY',
      };
    }

    logger.info('[FedEx SPOD] No document returned', {
      trackingNumber,
      hasOutput: !!response.output,
      resultCount: response.output?.documentResultList?.length,
    });
    return null;
  } catch (err) {
    logger.warn('[FedEx SPOD] Proof of delivery request failed', {
      trackingNumber,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
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
