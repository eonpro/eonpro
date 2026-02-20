/**
 * Billing/Invoice Domain Types
 *
 * @module domains/billing/types
 */

export interface InvoiceFilterOptions {
  clinicId?: number;
  patientId?: number;
  status?: string;
  search?: string;
  startDate?: Date;
  endDate?: Date;
  prescriptionProcessed?: boolean;
}

export interface InvoicePaginationOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
}

export interface InvoiceSummary {
  id: number;
  invoiceNumber: string | null;
  status: string;
  totalAmount: number | null;
  patientId: number | null;
  patientName?: string;
  clinicId: number;
  createdAt: Date;
  paidAt: Date | null;
  stripeInvoiceId: string | null;
  prescriptionProcessed: boolean;
}

export interface PaginatedInvoices<T = InvoiceSummary> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface CreateInvoiceInput {
  clinicId: number;
  patientId: number;
  items: InvoiceItemInput[];
  notes?: string;
  discountCode?: string;
}

export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
  productId?: number;
}

export interface UserContext {
  id: number;
  email: string;
  role: string;
  clinicId?: number;
}
