import axios, { AxiosError, AxiosInstance } from "axios";
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';

// Lifefile credentials can come from clinic config or env vars as fallback
export type LifefileCredentials = {
  baseUrl: string;
  username: string;
  password: string;
  vendorId: string;
  practiceId: string;
  locationId: string;
  networkId: string;
  practiceName?: string;
  practiceAddress?: string;
  practicePhone?: string;
  practiceFax?: string;
};

// Required env vars (legacy - for backwards compatibility)
const REQUIRED_ENV = [
  "LIFEFILE_BASE_URL",
  "LIFEFILE_USERNAME",
  "LIFEFILE_PASSWORD",
  "LIFEFILE_VENDOR_ID",
  "LIFEFILE_PRACTICE_ID",
  "LIFEFILE_LOCATION_ID",
  "LIFEFILE_NETWORK_ID",
] as const;

// Cache for clinic-specific clients
const clientCache = new Map<string, AxiosInstance>();

/**
 * Get credentials from environment variables (legacy/fallback)
 */
export function getEnvCredentials(): LifefileCredentials | null {
  const missing = REQUIRED_ENV.filter((key: any) => !process.env[key]);
  if (missing.length > 0) {
    logger.warn(`Missing Lifefile environment variables: ${missing.join(", ")}`);
    return null;
  }

  return {
    baseUrl: process.env.LIFEFILE_BASE_URL!,
    username: process.env.LIFEFILE_USERNAME!,
    password: process.env.LIFEFILE_PASSWORD!,
    vendorId: process.env.LIFEFILE_VENDOR_ID!,
    practiceId: process.env.LIFEFILE_PRACTICE_ID!,
    locationId: process.env.LIFEFILE_LOCATION_ID!,
    networkId: process.env.LIFEFILE_NETWORK_ID!,
    practiceName: process.env.LIFEFILE_PRACTICE_NAME,
    practiceAddress: process.env.LIFEFILE_PRACTICE_ADDRESS,
    practicePhone: process.env.LIFEFILE_PRACTICE_PHONE,
    practiceFax: process.env.LIFEFILE_PRACTICE_FAX,
  };
}

/**
 * Create an Axios client for the given credentials
 */
function createClient(credentials: LifefileCredentials): AxiosInstance {
  const client = axios.create({
    baseURL: credentials.baseUrl,
    auth: {
      username: credentials.username,
      password: credentials.password,
    },
    headers: {
      "X-Vendor-ID": credentials.vendorId,
      "X-Practice-ID": credentials.practiceId,
      "X-Location-ID": credentials.locationId,
      "X-API-Network-ID": credentials.networkId,
      "Content-Type": "application/json",
    },
    timeout: 20000,
  });

  client.interceptors.response.use(
    (res: any) => res,
    (error: AxiosError) => {
      logger.error("[LIFEFILE ERROR]", {
        url: error.config?.url,
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
      return Promise.reject(error);
    }
  );

  return client;
}

/**
 * Get or create a client for the given credentials
 * Uses caching to avoid creating multiple clients for the same clinic
 */
function getClient(credentials: LifefileCredentials): AxiosInstance {
  const cacheKey = `${credentials.baseUrl}-${credentials.vendorId}-${credentials.practiceId}`;

  if (clientCache.has(cacheKey)) {
    return clientCache.get(cacheKey)!;
  }

  const client = createClient(credentials);
  clientCache.set(cacheKey, client);
  return client;
}

/**
 * Legacy: Get client from environment variables
 */
function getLegacyClient(): AxiosInstance {
  const credentials = getEnvCredentials();
  if (!credentials) {
    throw new Error(
      `Missing Lifefile environment variables: ${REQUIRED_ENV.join(", ")}`
    );
  }
  return getClient(credentials);
}

async function callLifefile<T = any>(
  fn: (client: AxiosInstance) => Promise<{ data: T }>,
  context: string,
  credentials?: LifefileCredentials
): Promise<T> {
  const client = credentials ? getClient(credentials) : getLegacyClient();

  try {
    const res = await fn(client);
    return res.data;
  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    // @ts-ignore

    if (err.response?.status && err.response.status >= 500) {
      logger.warn(`[LIFEFILE RETRY] ${context}`);
      const res = await fn(client);
      return res.data;
    }
    throw new Error(
      `[Lifefile:${context}] ${err.response?.status} ${
        JSON.stringify(err.response?.data ?? errorMessage) ?? "unknown error"
      }`
    );
  }
}

export type LifefileOrderRx = {
  rxType?: "new" | "refill";
  rxNumber?: number;
  drugName: string;
  drugStrength?: string;
  drugForm?: string;
  lfProductID?: number;
  quantity?: string;
  quantityUnits?: string;
  directions?: string;
  refills?: number | string;
  dateWritten?: string;
  daysSupply?: number;
  scheduleCode?: "2" | "3" | "4" | "5" | "L" | "O";
  clinicalDifferenceStatement?: string;
};

export type LifefileOrderPayload = {
  message: {
    id: string;
    sentTime: string;
  };
  order: {
    general: {
      memo?: string;
      referenceId?: string;
    };
    prescriber: {
      npi: string;
      licenseState?: string;
      licenseNumber?: string;
      dea?: string;
      firstName?: string;
      middleName?: string;
      lastName?: string;
      address1?: string;
      address2?: string;
      city?: string;
      state?: string;
      zip?: string;
      phone?: string;
      fax?: string;
      email?: string;
    };
    practice?: {
      id?: string | number;
      name?: string;
    };
    patient: {
      firstName: string;
      lastName: string;
      gender?: string;
      dateOfBirth: string;
      address1?: string;
      address2?: string;
      address3?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
      phoneHome?: string;
      phoneMobile?: string;
      phoneWork?: string;
      email?: string;
    };
    shipping?: {
      recipientType?: "clinic" | "patient";
      recipientFirstName?: string;
      recipientLastName?: string;
      recipientPhone?: string;
      recipientEmail?: string;
      addressLine1?: string;
      addressLine2?: string;
      addressLine3?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      country?: string;
      service?: number;
    };
    billing?: {
      payorType?: "pat" | "doc";
    };
    rxs: LifefileOrderRx[];
    document?: {
      pdfBase64?: string;
    };
  };
};

export type LifefileOrderResponse = {
  orderId?: string | number;
  status?: string;
  [key: string]: any;
};

export type LifefileCancelResponse = {
  success?: boolean;
  orderId?: string | number;
  status?: string;
  message?: string;
  [key: string]: any;
};

export type LifefileModifyResponse = {
  success?: boolean;
  orderId?: string | number;
  status?: string;
  message?: string;
  [key: string]: any;
};

// Supported cancellation reasons
export const CANCELLATION_REASONS = [
  'patient_request',
  'provider_request', 
  'duplicate_order',
  'incorrect_medication',
  'incorrect_dosage',
  'incorrect_quantity',
  'incorrect_patient_info',
  'insurance_issue',
  'cost_issue',
  'other'
] as const;

export type CancellationReason = typeof CANCELLATION_REASONS[number];

/**
 * Create Lifefile API methods with optional clinic-specific credentials
 */
export function createLifefileClient(credentials?: LifefileCredentials) {
  return {
    createPatient: (data: any) =>
      callLifefile((client: any) => client.post("/patients", data), "createPatient", credentials),

    createPrescription: (data: any) =>
      callLifefile(
        (client: any) => client.post("/prescriptions", data),
        "createPrescription",
        credentials
      ),

    addMedication: (id: string | number, data: any) =>
      callLifefile(
        (client: any) => client.post(`/prescriptions/${id}/medications`, data),
        "addMedication",
        credentials
      ),

    attachPdf: (id: string | number, data: any) =>
      callLifefile(
        (client: any) => client.post(`/prescriptions/${id}/attachments`, data),
        "attachPdf",
        credentials
      ),

    createOrder: (data: any) =>
      callLifefile((client: any) => client.post("/orders", data), "createOrder", credentials),

    createFullOrder: (payload: LifefileOrderPayload) =>
      callLifefile<LifefileOrderResponse>(
        (client: any) => client.post("/order", payload),
        "createFullOrder",
        credentials
      ),

    getOrderStatus: (orderId: string | number) =>
      callLifefile((client: any) => client.get(`/order/${orderId}`), "getOrderStatus", credentials),

    /**
     * Cancel an order that was previously submitted to Lifefile
     * Note: Orders can only be cancelled before they enter fulfillment
     * @param orderId - The Lifefile order ID
     * @param reason - Reason for cancellation
     * @param notes - Optional additional notes
     */
    cancelOrder: (orderId: string | number, reason?: string, notes?: string) =>
      callLifefile<LifefileCancelResponse>(
        (client: any) => client.post(`/order/${orderId}/cancel`, { 
          reason: reason || 'provider_request',
          notes: notes || '',
        }),
        "cancelOrder",
        credentials
      ),

    /**
     * Alternative cancel method using DELETE (some APIs use this)
     */
    deleteOrder: (orderId: string | number) =>
      callLifefile<LifefileCancelResponse>(
        (client: any) => client.delete(`/order/${orderId}`),
        "deleteOrder",
        credentials
      ),

    /**
     * Void/cancel a prescription by order ID
     * Some pharmacy APIs use a "void" endpoint
     */
    voidOrder: (orderId: string | number, reason?: string) =>
      callLifefile<LifefileCancelResponse>(
        (client: any) => client.post(`/order/${orderId}/void`, { reason }),
        "voidOrder",
        credentials
      ),

    /**
     * Modify an existing order (if supported by Lifefile)
     * Note: May require order to be in specific status
     * @param orderId - The Lifefile order ID  
     * @param modifications - Fields to update
     */
    modifyOrder: (orderId: string | number, modifications: Partial<LifefileOrderPayload>) =>
      callLifefile<LifefileModifyResponse>(
        (client: any) => client.patch(`/order/${orderId}`, modifications),
        "modifyOrder",
        credentials
      ),

    /**
     * Update shipping information for an order
     */
    updateOrderShipping: (orderId: string | number, shipping: LifefileOrderPayload['order']['shipping']) =>
      callLifefile<LifefileModifyResponse>(
        (client: any) => client.patch(`/order/${orderId}/shipping`, shipping),
        "updateOrderShipping",
        credentials
      ),

    /**
     * Add notes to an existing order
     */
    addOrderNotes: (orderId: string | number, notes: string) =>
      callLifefile<LifefileModifyResponse>(
        (client: any) => client.post(`/order/${orderId}/notes`, { notes }),
        "addOrderNotes",
        credentials
      ),

    // Return the credentials being used (useful for building payloads)
    getCredentials: () => credentials || getEnvCredentials(),
  };
}

// Default client using environment variables (legacy compatibility)
const lifefile = createLifefileClient();

export default lifefile;
