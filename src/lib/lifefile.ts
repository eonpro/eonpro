import axios, { AxiosError, AxiosInstance } from "axios";
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';

const REQUIRED_ENV = [
  "LIFEFILE_BASE_URL",
  "LIFEFILE_USERNAME",
  "LIFEFILE_PASSWORD",
  "LIFEFILE_VENDOR_ID",
  "LIFEFILE_PRACTICE_ID",
  "LIFEFILE_LOCATION_ID",
  "LIFEFILE_NETWORK_ID",
] as const;

function getClient(): AxiosInstance {
  if (clientInstance) {
    return clientInstance;
  }
  const missing = REQUIRED_ENV.filter((key: any) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing Lifefile environment variables: ${missing.join(", ")}`
    );
  }
  clientInstance = axios.create({
    baseURL: process.env.LIFEFILE_BASE_URL!,
    auth: {
      username: process.env.LIFEFILE_USERNAME!,
      password: process.env.LIFEFILE_PASSWORD!,
    },
    headers: {
      "X-Vendor-ID": process.env.LIFEFILE_VENDOR_ID!,
      "X-Practice-ID": process.env.LIFEFILE_PRACTICE_ID!,
      "X-Location-ID": process.env.LIFEFILE_LOCATION_ID!,
      "X-API-Network-ID": process.env.LIFEFILE_NETWORK_ID!,
      "Content-Type": "application/json",
    },
    timeout: 20000,
  });

  clientInstance.interceptors.response.use(
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

  return clientInstance;
}

let clientInstance: AxiosInstance | null = null;

async function callLifefile<T = any>(
  fn: (client: AxiosInstance) => Promise<{ data: T }>,
  context: string
): Promise<T> {
  const client = getClient();
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

const lifefile = {
  createPatient: (data: any) =>
    callLifefile((client: any) => client.post("/patients", data), "createPatient"),
  createPrescription: (data: any) =>
    callLifefile(
      (client: any) => client.post("/prescriptions", data),
      "createPrescription"
    ),
  addMedication: (id: string | number, data: any) =>
    callLifefile(
      (client: any) => client.post(`/prescriptions/${id}/medications`, data),
      "addMedication"
    ),
  attachPdf: (id: string | number, data: any) =>
    callLifefile(
      (client: any) => client.post(`/prescriptions/${id}/attachments`, data),
      "attachPdf"
    ),
  createOrder: (data: any) =>
    callLifefile((client: any) => client.post("/orders", data), "createOrder"),
  createFullOrder: (payload: LifefileOrderPayload) =>
    callLifefile<LifefileOrderResponse>(
      (client: any) => client.post("/order", payload),
      "createFullOrder"
    ),
  getOrderStatus: (orderId: string | number) =>
    callLifefile((client: any) => client.get(`/order/${orderId}`), "getOrderStatus"),
};

export default lifefile;
