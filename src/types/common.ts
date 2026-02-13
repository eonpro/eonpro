/**
 * Common TypeScript type definitions
 * Replaces any types throughout the application
 */

// Error types
export interface AppError extends Error {
  code?: string;
  statusCode?: number;
  details?: unknown;
}

export interface ApiError {
  message: string;
  code?: string;
  statusCode?: number;
  details?: Record<string, unknown>;
}

// API Response types
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Request context types
export interface RequestContext {
  userId?: string | number;
  userEmail?: string;
  userRole?: string;
  sessionId?: string;
}

/** User shape passed to layout components (from localStorage or auth/me). No PHI in logs. */
export interface LayoutUser {
  id: number;
  email: string;
  role: string;
  clinicId?: number;
  patientId?: number;
  providerId?: number;
  firstName?: string;
  lastName?: string;
  name?: string;
  specialty?: string;
}

// Database record types
export interface BaseRecord {
  id: number;
  createdAt: Date;
  updatedAt?: Date;
}

// Form data types
export interface FormData {
  [key: string]: string | number | boolean | File | undefined;
}

// Webhook types
export interface WebhookPayload {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
  signature?: string;
}

// File upload types
export interface FileUpload {
  filename: string;
  mimetype: string;
  size: number;
  data?: Buffer;
  url?: string;
}

// Configuration types
export interface FeatureFlags {
  [key: string]: boolean;
}

export interface AppConfig {
  environment: 'development' | 'staging' | 'production';
  features: FeatureFlags;
  apiUrl: string;
  version: string;
}

// Utility types
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type AsyncFunction<T = unknown> = () => Promise<T>;
export type Callback<T = unknown> = (error: Error | undefined, result?: T) => void;
