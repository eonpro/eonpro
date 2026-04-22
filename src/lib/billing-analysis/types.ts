export enum IssueSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

export enum IssueRule {
  DUPLICATE_RX_NUMBER = 'Duplicate Rx Number',
  PRICE_DIFFERS_SAME_CONTEXT = 'Same patient+drug+date at different prices',
  MEDICATION_PRICE_INCONSISTENCY = 'Medication priced inconsistently across dataset',
  RX_QTY_VS_DISPENSED = 'Rx Qty != Dispensed Q',
  RX_QTY_VS_FILLED = 'Rx Qty != Filled qty',
  MISSING_RX_PRICE = 'Missing Rx Price on billable drug',
  PATIENT_ROW_COUNT_OUTLIER = 'Patient medication count outlier',
  PATIENT_TOTAL_BILLED_OUTLIER = 'Patient total billed outlier',
  DATE_SHIPPED_BEFORE_WRITTEN = 'Date Shipped before Date Written',
  ORDER_CROSS_PATIENT = 'Order ID shared across patients',
}

export interface CsvRow {
  rowNumber: number;
  dateRange: string;
  rxNumber: string;
  dateWritten: string;
  dateShipped: string;
  patientName: string;
  practiceName: string;
  drugName: string;
  rxQty: number | null;
  dispensedQ: number | null;
  filledQty: number | null;
  rxStatus: string;
  rxPrice: number | null;
  orderId: string;
}

export interface Issue {
  id: string;
  severity: IssueSeverity;
  rule: IssueRule;
  rowNumbers: number[];
  patientName: string;
  drugName: string;
  rxNumber: string;
  details: string;
}

export enum DrugCategory {
  PRIMARY_GLP1 = 'primary_glp1',
  ADD_ON = 'add_on',
  ANTI_NAUSEA = 'anti_nausea',
  SUPPLY = 'supply',
  UNKNOWN = 'unknown',
}

export interface PatientLineItem {
  rowNumber: number;
  rxNumber: string;
  dateShipped: string;
  drugName: string;
  drugCategory: DrugCategory;
  rxQty: number | null;
  dispensedQ: number | null;
  filledQty: number | null;
  rxPrice: number | null;
  rxStatus: string;
  orderId: string;
}

export interface MedicationPriceEntry {
  price: number;
  count: number;
}

export interface MedicationSummary {
  drugName: string;
  drugCategory: DrugCategory;
  totalRows: number;
  totalQuantityDispensed: number;
  totalBilled: number;
  uniquePrices: MedicationPriceEntry[];
  uniquePatients: number;
  hasPriceVariance: boolean;
}

export interface PatientSummary {
  patientName: string;
  totalRows: number;
  uniqueMedications: string[];
  totalBilled: number;
  orders: string[];
  issueCount: number;
  lineItems: PatientLineItem[];
  hasAddOns: boolean;
  addOnDrugs: string[];
  primaryDrugs: string[];
}

export interface SummaryStats {
  totalRows: number;
  uniquePatients: number;
  uniqueMedications: number;
  uniqueOrders: number;
  totalBilled: number;
  dateRangeStart: string;
  dateRangeEnd: string;
  issuesByServerity: {
    error: number;
    warning: number;
    info: number;
  };
  totalIssues: number;
}

export interface AnalysisResult {
  summary: SummaryStats;
  issues: Issue[];
  patients: PatientSummary[];
  medications: MedicationSummary[];
  rows: CsvRow[];
}
