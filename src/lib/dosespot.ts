/**
 * DoseSpot E-Prescribing API Client
 * ==================================
 *
 * Ported from Java master-service DoseSpot integration.
 * Handles OAuth2 authentication, patient/clinician CRUD,
 * prescription retrieval, and SSO URL generation.
 *
 * All methods are feature-flagged at the API route level.
 * This client is only instantiated when DoseSpot is enabled for a clinic.
 *
 * @module lib/dosespot
 */

import axios, { AxiosError, AxiosInstance } from 'axios';
import crypto from 'crypto';
import { logger } from '@/lib/logger';
import { circuitBreakers } from '@/lib/resilience/circuitBreaker';

// ---------------------------------------------------------------------------
// Credential types
// ---------------------------------------------------------------------------

export type DoseSpotCredentials = {
  baseUrl: string;
  tokenUrl: string;
  ssoUrl: string;
  clinicId: string;
  clinicKey: string;
  adminId: string;
  subscriptionKey: string;
};

// ---------------------------------------------------------------------------
// DoseSpot API DTOs (PascalCase to match DoseSpot JSON convention)
// ---------------------------------------------------------------------------

export interface DoseSpotPatientPayload {
  FirstName: string;
  LastName: string;
  DateOfBirth: string;
  Gender: string;
  Email: string;
  Address1: string;
  City: string;
  State: string;
  ZipCode: string;
  PrimaryPhone: string;
  PrimaryPhoneType: string;
  Active: boolean;
}

export interface DoseSpotProviderPayload {
  FirstName: string;
  LastName: string;
  DateOfBirth: string;
  Email: string;
  Address1: string;
  City: string;
  State: string;
  ZipCode: string;
  PrimaryPhone: string;
  PrimaryPhoneType: string;
  PrimaryFax?: string;
  NPINumber: string;
  ClinicianRoleType: ClinicianRoleType[];
  Active: boolean;
}

export type ClinicianRoleType =
  | 'PrescribingClinician'
  | 'ReportingClinician'
  | 'EpcsCoordinator'
  | 'ClinicianAdmin'
  | 'PrescribingAgentClinician'
  | 'ProxyClinician';

export interface DoseSpotAllergy {
  PatientAllergyId: number;
  DisplayName: string;
  AllergenId: number;
  AllergenType: string;
  Reaction: string;
  ReactionType: string;
  StatusType: string;
  OnsetDate: string;
  LastUpdatedUserId: number;
}

export interface DoseSpotPrescription {
  PrescriptionId: number;
  WrittenDate: string;
  Directions: string;
  Quantity: string;
  DispenseUnitId: number;
  Refills: string;
  DaysSupply: number;
  PharmacyId: number;
  PharmacyNotes: string;
  NoSubstitutions: boolean;
  EffectiveDate: string;
  LastFillDate: string;
  PrescriberId: number;
  PrescriberAgentId: number;
  Status: string;
  Formulary: boolean;
  EligibilityId: number;
  Type: string;
  ErrorIgnored: boolean;
  ClinicId: number;
  IsUrgent: boolean;
  IsRxRenewal: boolean;
  RxRenewalNote: string;
  Strength: string;
  PatientMedicationId: number;
  MedicationStatus: string;
  DateInactive: string;
  DisplayName: string;
  DispensableDrugId: number;
  Schedule: number;
}

export interface DoseSpotSelfReportedMedication {
  SelfReportedMedicationId: number;
  DateReported: string;
  DatePrescribed: string;
  DisplayName: string;
  DispenseUnitType: string;
  Directions: string;
  DaysSupply: number;
  Quantity: string;
  DispenseUnitTypeId: number;
  Refills: number;
  Comment: string;
  Status: string;
  DiscontinuedDate: string;
  Schedule: number;
  Encounter: string;
  DispensableDrugID: number;
  RoutedDoseFormDrugID: number;
  OTC: boolean;
  NDC: string;
  DoseForm: string;
  Route: string;
  Strength: string;
}

export interface DoseSpotDiagnosisItem {
  DiagnosisId: number;
  DiagnosisCode: string;
  DiagnosisName: string;
}

export interface DoseSpotPageResult {
  CurrentPage: number;
  TotalPages: number;
  PageSize: number;
  TotalCount: number;
}

// API response wrappers
interface AllergyResponse {
  Items: DoseSpotAllergy[];
}

interface PrescriptionResponse {
  Items: DoseSpotPrescription[];
}

interface SelfReportedMedicationResponse {
  Items: DoseSpotSelfReportedMedication[];
}

interface DiagnosisResponse {
  Items: DoseSpotDiagnosisItem[];
  PageResult: DoseSpotPageResult;
}

// ---------------------------------------------------------------------------
// Pagination helper
// ---------------------------------------------------------------------------

export interface PagedResult<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

function paginateClientSide<T>(items: T[], page: number, size: number): PagedResult<T> {
  const totalElements = items.length;
  const fromIndex = Math.min(page * size, totalElements);
  const toIndex = Math.min(fromIndex + size, totalElements);
  return {
    items: items.slice(fromIndex, toIndex),
    page,
    size,
    totalElements,
    totalPages: Math.ceil(totalElements / size),
  };
}

// ---------------------------------------------------------------------------
// OAuth2 Token Management (with caching — fixes Java version's caching bug)
// ---------------------------------------------------------------------------

interface TokenCache {
  token: string;
  expiresAt: number;
}

const TOKEN_BUFFER_MS = 30_000;
const TOKEN_LIFETIME_MS = 500_000;
const tokenCacheMap = new Map<string, TokenCache>();

function getTokenCacheKey(credentials: DoseSpotCredentials): string {
  return `${credentials.tokenUrl}:${credentials.clinicId}`;
}

async function acquireToken(credentials: DoseSpotCredentials): Promise<string> {
  const cacheKey = getTokenCacheKey(credentials);
  const cached = tokenCacheMap.get(cacheKey);

  if (cached && Date.now() < cached.expiresAt - TOKEN_BUFFER_MS) {
    return cached.token;
  }

  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: credentials.clinicId,
    client_secret: credentials.clinicKey,
    username: credentials.adminId,
    password: credentials.clinicKey,
    scope: 'api',
  });

  const response = await axios.post<{ access_token: string }>(
    credentials.tokenUrl,
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Subscription-Key': credentials.subscriptionKey,
      },
      timeout: 15_000,
    }
  );

  const token = response.data.access_token;
  if (!token) {
    throw new Error('DoseSpot OAuth2 response missing access_token');
  }

  tokenCacheMap.set(cacheKey, {
    token,
    expiresAt: Date.now() + TOKEN_LIFETIME_MS,
  });

  return token;
}

// ---------------------------------------------------------------------------
// SSO URL Generation (ported from DoseSpotSSOServiceImpl.java)
// ---------------------------------------------------------------------------

function generateRandomPhrase(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

function sha512Base64(input: string): string {
  const hash = crypto.createHash('sha512').update(input, 'utf8').digest('base64');
  return hash.endsWith('==') ? hash.slice(0, -2) : hash;
}

function createEncryptedClinicCode(clinicKey: string, phrase: string): string {
  return phrase + sha512Base64(phrase + clinicKey);
}

function createEncryptedUserIdVerify(
  userId: string,
  clinicKey: string,
  phrase: string
): string {
  const phrase22 = phrase.substring(0, 22);
  return sha512Base64(userId + phrase22 + clinicKey);
}

export function generateSSOUrlForPatient(
  credentials: DoseSpotCredentials,
  prescriberUserId: string,
  patientUserId: string
): string {
  const phrase = generateRandomPhrase(32);
  const code = createEncryptedClinicCode(credentials.clinicKey, phrase);
  const verify = createEncryptedUserIdVerify(prescriberUserId, credentials.clinicKey, phrase);

  const params = new URLSearchParams({
    SingleSignOnClinicId: credentials.clinicId,
    SingleSignOnUserId: prescriberUserId,
    SingleSignOnPhraseLength: '32',
    SingleSignOnCode: code,
    SingleSignOnUserIdVerify: verify,
    PatientId: patientUserId,
  });

  return `${credentials.ssoUrl}?${params.toString()}`;
}

export function generateSSOUrlForPrescriber(
  credentials: DoseSpotCredentials,
  prescriberUserId: string
): string {
  const phrase = generateRandomPhrase(32);
  const code = createEncryptedClinicCode(credentials.clinicKey, phrase);
  const verify = createEncryptedUserIdVerify(prescriberUserId, credentials.clinicKey, phrase);

  const params = new URLSearchParams({
    SingleSignOnClinicId: credentials.clinicId,
    SingleSignOnUserId: prescriberUserId,
    SingleSignOnPhraseLength: '32',
    SingleSignOnCode: code,
    SingleSignOnUserIdVerify: verify,
  });

  return `${credentials.ssoUrl}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Axios Client Factory
// ---------------------------------------------------------------------------

const DOSESPOT_TIMEOUT_MS = 30_000;
const clientCache = new Map<string, AxiosInstance>();

function createAxiosClient(credentials: DoseSpotCredentials): AxiosInstance {
  const client = axios.create({
    baseURL: credentials.baseUrl,
    headers: {
      'Subscription-Key': credentials.subscriptionKey,
      'Content-Type': 'application/json',
    },
    timeout: DOSESPOT_TIMEOUT_MS,
  });

  client.interceptors.response.use(
    (res) => res,
    (error: AxiosError) => {
      logger.error('[DOSESPOT ERROR]', {
        url: error.config?.url,
        status: error.response?.status,
        message: error.message,
      });
      return Promise.reject(error);
    }
  );

  return client;
}

function getAxiosClient(credentials: DoseSpotCredentials): AxiosInstance {
  const cacheKey = `${credentials.baseUrl}:${credentials.clinicId}`;
  const existing = clientCache.get(cacheKey);
  if (existing) return existing;

  const client = createAxiosClient(credentials);
  clientCache.set(cacheKey, client);
  return client;
}

// ---------------------------------------------------------------------------
// Core API call wrapper (circuit breaker protected)
// ---------------------------------------------------------------------------

async function callDoseSpot<T>(
  credentials: DoseSpotCredentials,
  fn: (client: AxiosInstance, token: string) => Promise<{ data: T }>,
  context: string
): Promise<T> {
  return circuitBreakers.dosespot.execute(async () => {
    const token = await acquireToken(credentials);
    const client = getAxiosClient(credentials);

    try {
      const res = await fn(client, token);
      return res.data;
    } catch (err: unknown) {
      const axiosErr = err as AxiosError;
      const status = axiosErr.response?.status;
      const responseData = axiosErr.response?.data;

      let detail = axiosErr.message;
      if (responseData) {
        if (
          typeof responseData === 'object' &&
          responseData !== null &&
          'ResultDescription' in responseData
        ) {
          detail = String((responseData as Record<string, unknown>).ResultDescription);
        } else if (typeof responseData === 'string') {
          detail = responseData;
        } else {
          detail = JSON.stringify(responseData);
        }
      }

      throw new Error(`[DoseSpot:${context}] ${status ?? 'unknown'} ${detail}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Auth header helper
// ---------------------------------------------------------------------------

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// Public Client Factory
// ---------------------------------------------------------------------------

export function createDoseSpotClient(credentials: DoseSpotCredentials) {
  return {
    // ----- Patient operations -----

    addPatient: (patient: DoseSpotPatientPayload): Promise<string> =>
      callDoseSpot<Record<string, unknown>>(
        credentials,
        (client, token) =>
          client.post('/api/patients', patient, { headers: authHeaders(token) }),
        'addPatient'
      ).then((data) => {
        if (data && typeof data.Id !== 'undefined') return String(data.Id);
        throw new Error('DoseSpot addPatient: unexpected response');
      }),

    updatePatient: (
      doseSpotPatientId: string,
      patient: DoseSpotPatientPayload
    ): Promise<void> =>
      callDoseSpot<unknown>(
        credentials,
        (client, token) =>
          client.put(`/api/patients/${doseSpotPatientId}`, patient, {
            headers: authHeaders(token),
          }),
        'updatePatient'
      ).then(() => undefined),

    getPatientAllergies: (
      patientId: string,
      page = 0,
      size = 10
    ): Promise<PagedResult<DoseSpotAllergy>> =>
      callDoseSpot<AllergyResponse>(
        credentials,
        (client, token) =>
          client.get(`/api/patients/${patientId}/allergies`, {
            headers: authHeaders(token),
          }),
        'getPatientAllergies'
      ).then((data) => paginateClientSide(data.Items ?? [], page, size)),

    getPatientPrescriptions: (
      patientId: string,
      page = 0,
      size = 10
    ): Promise<PagedResult<DoseSpotPrescription>> =>
      callDoseSpot<PrescriptionResponse>(
        credentials,
        (client, token) =>
          client.get(`/api/patients/${patientId}/prescriptions`, {
            headers: authHeaders(token),
          }),
        'getPatientPrescriptions'
      ).then((data) => paginateClientSide(data.Items ?? [], page, size)),

    getSelfReportedMedications: (
      patientId: string,
      page = 0,
      size = 10
    ): Promise<PagedResult<DoseSpotSelfReportedMedication>> =>
      callDoseSpot<SelfReportedMedicationResponse>(
        credentials,
        (client, token) =>
          client.get(`/api/patients/${patientId}/selfReportedMedications`, {
            headers: authHeaders(token),
          }),
        'getSelfReportedMedications'
      ).then((data) => paginateClientSide(data.Items ?? [], page, size)),

    // ----- Clinician / Provider operations -----

    addProvider: (provider: DoseSpotProviderPayload): Promise<string> =>
      callDoseSpot<Record<string, unknown>>(
        credentials,
        (client, token) =>
          client.post('/api/clinicians', provider, { headers: authHeaders(token) }),
        'addProvider'
      ).then((data) => {
        const id = String(data.Id ?? '0');
        if (id !== '0') return id;

        const result = data.Result as Record<string, unknown> | undefined;
        const desc = String(result?.ResultDescription ?? '');

        if (desc.includes('Email Address already exists')) {
          throw new DoseSpotError(
            'Provider with same email address already exists.',
            'DOSESPOT_EMAIL_CONFLICT',
            409
          );
        }
        if (desc.includes('NPI is not in the correct format')) {
          throw new DoseSpotError(
            'NPI is not in the correct format.',
            'NPI_FORMAT_NOT_PROPER',
            400
          );
        }
        throw new DoseSpotError(desc || 'Provider creation failed', 'DOSESPOT_ERROR', 400);
      }),

    updateProvider: (
      doseSpotProviderId: string,
      provider: DoseSpotProviderPayload
    ): Promise<void> =>
      callDoseSpot<unknown>(
        credentials,
        (client, token) =>
          client.put(`/api/clinicians/${doseSpotProviderId}`, provider, {
            headers: authHeaders(token),
          }),
        'updateProvider'
      ).then(() => undefined),

    getClinician: (doseSpotProviderId: string): Promise<ClinicianRoleType[]> =>
      callDoseSpot<Record<string, unknown>>(
        credentials,
        (client, token) =>
          client.get(`/api/clinicians/${doseSpotProviderId}`, {
            headers: authHeaders(token),
          }),
        'getClinician'
      ).then((data) => {
        const item = data.Item as Record<string, unknown> | undefined;
        const roles = (item?.Roles ?? []) as string[];
        const validRoles: ClinicianRoleType[] = [
          'PrescribingClinician',
          'ReportingClinician',
          'EpcsCoordinator',
          'ClinicianAdmin',
          'PrescribingAgentClinician',
          'ProxyClinician',
        ];
        return roles.filter((r): r is ClinicianRoleType =>
          validRoles.includes(r as ClinicianRoleType)
        );
      }),

    // ----- Diagnosis search -----

    searchDiagnosis: (
      searchTerm: string,
      pageNumber = 1
    ): Promise<{ items: DoseSpotDiagnosisItem[]; pageResult: DoseSpotPageResult | null }> =>
      callDoseSpot<DiagnosisResponse>(
        credentials,
        (client, token) =>
          client.get('/api/diagnoses/search', {
            params: { searchTerm, pageNumber },
            headers: authHeaders(token),
          }),
        'searchDiagnosis'
      ).then((data) => ({
        items: data.Items ?? [],
        pageResult: data.PageResult ?? null,
      })),

    // ----- SSO URL generation -----

    generatePatientSSOUrl: (prescriberUserId: string, patientUserId: string): string =>
      generateSSOUrlForPatient(credentials, prescriberUserId, patientUserId),

    generatePrescriberSSOUrl: (prescriberUserId: string): string =>
      generateSSOUrlForPrescriber(credentials, prescriberUserId),

    getCredentials: () => credentials,
  };
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class DoseSpotError extends Error {
  constructor(
    message: string,
    public code: string = 'DOSESPOT_ERROR',
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'DoseSpotError';
  }
}

// ---------------------------------------------------------------------------
// Environment-based default credentials (fallback)
// ---------------------------------------------------------------------------

export function getEnvCredentials(): DoseSpotCredentials | null {
  const required = [
    'DOSESPOT_API_BASE_URL',
    'DOSESPOT_API_TOKEN_URL',
    'DOSESPOT_SSO_URL',
    'DOSESPOT_CLINIC_ID',
    'DOSESPOT_CLINIC_KEY',
    'DOSESPOT_ADMIN_ID',
    'DOSESPOT_SUBSCRIPTION_KEY',
  ] as const;

  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    return null;
  }

  return {
    baseUrl: process.env.DOSESPOT_API_BASE_URL!,
    tokenUrl: process.env.DOSESPOT_API_TOKEN_URL!,
    ssoUrl: process.env.DOSESPOT_SSO_URL!,
    clinicId: process.env.DOSESPOT_CLINIC_ID!,
    clinicKey: process.env.DOSESPOT_CLINIC_KEY!,
    adminId: process.env.DOSESPOT_ADMIN_ID!,
    subscriptionKey: process.env.DOSESPOT_SUBSCRIPTION_KEY!,
  };
}

export type DoseSpotClient = ReturnType<typeof createDoseSpotClient>;
