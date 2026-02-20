/**
 * Integration Adapter Interfaces
 *
 * Typed contracts for all external service integrations.
 * Each adapter implements a standard interface that enables:
 * - Swappable implementations (real, mock, test)
 * - Consistent error handling and retry semantics
 * - Health checking across all integrations
 *
 * @module lib/integrations/adapter
 */

// ============================================================================
// Base Adapter Interface
// ============================================================================

export interface IntegrationAdapter<TConfig = unknown> {
  readonly name: string;
  readonly version: string;
  isConfigured(): boolean;
  healthCheck(): Promise<IntegrationHealthResult>;
}

export interface IntegrationHealthResult {
  healthy: boolean;
  latencyMs?: number;
  message?: string;
  lastChecked: Date;
}

// ============================================================================
// Email Adapter (AWS SES, SendGrid, etc.)
// ============================================================================

export interface EmailAdapter extends IntegrationAdapter {
  sendEmail(params: SendEmailParams): Promise<EmailResult>;
  sendTemplatedEmail(params: SendTemplatedEmailParams): Promise<EmailResult>;
  getSendQuota(): Promise<EmailQuota>;
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

export interface SendTemplatedEmailParams {
  to: string | string[];
  template: string;
  templateData: Record<string, unknown>;
  from?: string;
}

export interface EmailResult {
  messageId: string;
  success: boolean;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface EmailQuota {
  max24HourSend: number;
  sentLast24Hours: number;
  maxSendRate: number;
}

// ============================================================================
// SMS Adapter (Twilio, etc.)
// ============================================================================

export interface SmsAdapter extends IntegrationAdapter {
  sendSms(params: SendSmsParams): Promise<SmsResult>;
  checkOptOut(phone: string): Promise<boolean>;
}

export interface SendSmsParams {
  to: string;
  body: string;
  from?: string;
  mediaUrl?: string[];
  statusCallback?: string;
}

export interface SmsResult {
  sid: string;
  status: string;
  success: boolean;
}

// ============================================================================
// Pharmacy Adapter (Lifefile, etc.)
// ============================================================================

export interface PharmacyAdapter extends IntegrationAdapter {
  submitOrder(params: PharmacyOrderParams): Promise<PharmacyOrderResult>;
  cancelOrder(orderId: string): Promise<PharmacyCancelResult>;
  getOrderStatus(orderId: string): Promise<PharmacyOrderStatus>;
}

export interface PharmacyOrderParams {
  patient: {
    firstName: string;
    lastName: string;
    dob: string;
    gender: string;
    phone: string;
    email: string;
    address: {
      address1: string;
      address2?: string;
      city: string;
      state: string;
      zip: string;
    };
  };
  provider: {
    firstName: string;
    lastName: string;
    npi: string;
    dea?: string;
    signatureUrl?: string;
  };
  prescriptions: Array<{
    medicationKey: string;
    medName: string;
    strength: string;
    form: string;
    quantity: string;
    refills: string;
    sig: string;
    daysSupply?: number;
  }>;
  shippingMethod: number;
  messageId: string;
}

export interface PharmacyOrderResult {
  orderId: string;
  referenceId: string;
  status: string;
  success: boolean;
  rawResponse?: unknown;
}

export interface PharmacyCancelResult {
  success: boolean;
  rawResponse?: unknown;
}

export interface PharmacyOrderStatus {
  orderId: string;
  status: string;
  trackingNumber?: string;
  trackingUrl?: string;
  shippedAt?: Date;
  deliveredAt?: Date;
}

// ============================================================================
// Payment Adapter (Stripe, etc.)
// ============================================================================

export interface PaymentAdapter extends IntegrationAdapter {
  createCustomer(params: CreateCustomerParams): Promise<PaymentCustomer>;
  createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult>;
  createInvoice(params: CreateInvoiceParams): Promise<PaymentInvoiceResult>;
  refund(paymentIntentId: string, amount?: number): Promise<RefundResult>;
  verifyWebhookSignature(body: string, signature: string): unknown;
}

export interface CreateCustomerParams {
  email: string;
  name: string;
  metadata?: Record<string, string>;
}

export interface PaymentCustomer {
  id: string;
  email: string;
}

export interface CreatePaymentIntentParams {
  amount: number;
  currency: string;
  customerId: string;
  metadata?: Record<string, string>;
}

export interface PaymentIntentResult {
  id: string;
  clientSecret: string;
  status: string;
}

export interface CreateInvoiceParams {
  customerId: string;
  items: Array<{ description: string; amount: number; quantity?: number }>;
  metadata?: Record<string, string>;
  dueDate?: Date;
}

export interface PaymentInvoiceResult {
  id: string;
  url: string;
  status: string;
}

export interface RefundResult {
  id: string;
  amount: number;
  status: string;
}

// ============================================================================
// Storage Adapter (S3, etc.)
// ============================================================================

export interface StorageAdapter extends IntegrationAdapter {
  upload(params: StorageUploadParams): Promise<StorageUploadResult>;
  download(key: string): Promise<StorageDownloadResult>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}

export interface StorageUploadParams {
  key: string;
  body: Buffer | string;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface StorageUploadResult {
  key: string;
  url: string;
  etag?: string;
}

export interface StorageDownloadResult {
  body: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
}

// ============================================================================
// Shipping Adapter (FedEx, UPS, etc.)
// ============================================================================

export interface ShippingAdapter extends IntegrationAdapter {
  createLabel(params: CreateShippingLabelParams): Promise<ShippingLabelResult>;
  voidLabel(trackingNumber: string): Promise<{ success: boolean }>;
}

export interface ShippingAddress {
  personName: string;
  companyName?: string;
  phoneNumber: string;
  address1: string;
  address2?: string | null;
  city: string;
  state: string;
  zip: string;
  countryCode?: string;
}

export interface CreateShippingLabelParams {
  serviceType: string;
  packagingType: string;
  shipper: ShippingAddress;
  recipient: ShippingAddress;
  weightLbs: number;
  length?: number;
  width?: number;
  height?: number;
}

export interface ShippingLabelResult {
  trackingNumber: string;
  shipmentId: string;
  serviceType: string;
  labelPdfBase64: string;
}

// ============================================================================
// Webhook Ingestion Adapter
// ============================================================================

export interface WebhookSourceConfig {
  source: string;
  signatureHeader?: string;
  signatureAlgorithm?: 'hmac-sha256' | 'hmac-sha1' | 'stripe' | 'none';
  secret?: string;
  eventTypeField?: string;
  idempotencyField?: string;
}

export const WEBHOOK_SOURCES: Record<string, WebhookSourceConfig> = {
  stripe: {
    source: 'stripe',
    signatureHeader: 'stripe-signature',
    signatureAlgorithm: 'stripe',
    secret: process.env.STRIPE_WEBHOOK_SECRET,
    eventTypeField: 'type',
    idempotencyField: 'id',
  },
  lifefile: {
    source: 'lifefile',
    signatureAlgorithm: 'none',
    eventTypeField: 'eventType',
  },
  terra: {
    source: 'terra',
    signatureHeader: 'terra-signature',
    signatureAlgorithm: 'hmac-sha256',
    secret: process.env.TERRA_WEBHOOK_SECRET,
    eventTypeField: 'type',
  },
  ses: {
    source: 'ses',
    signatureAlgorithm: 'none',
    eventTypeField: 'notificationType',
  },
  heyflow: {
    source: 'heyflow',
    signatureAlgorithm: 'none',
    eventTypeField: 'type',
  },
  shipping: {
    source: 'shipping',
    signatureAlgorithm: 'none',
    eventTypeField: 'eventType',
  },
} as const;

// ============================================================================
// Adapter Registry
// ============================================================================

const adapterRegistry = new Map<string, IntegrationAdapter>();

export function registerAdapter(name: string, adapter: IntegrationAdapter): void {
  adapterRegistry.set(name, adapter);
}

export function getAdapter<T extends IntegrationAdapter>(name: string): T | undefined {
  return adapterRegistry.get(name) as T | undefined;
}

export async function checkAllHealth(): Promise<Record<string, IntegrationHealthResult>> {
  const results: Record<string, IntegrationHealthResult> = {};
  for (const [name, adapter] of adapterRegistry) {
    try {
      results[name] = await adapter.healthCheck();
    } catch {
      results[name] = {
        healthy: false,
        message: 'Health check threw an exception',
        lastChecked: new Date(),
      };
    }
  }
  return results;
}
