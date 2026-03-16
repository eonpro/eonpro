/**
 * Shared types for the enterprise reporting engine.
 */

export interface ColumnDef {
  id: string;
  label: string;
  type: 'string' | 'number' | 'currency' | 'date' | 'boolean' | 'percent';
  sortable?: boolean;
  filterable?: boolean;
  groupable?: boolean;
  description?: string;
}

export interface FilterDef {
  field: string;
  label: string;
  type: 'date_range' | 'select' | 'multi_select' | 'number_range' | 'text';
  options?: { value: string; label: string }[];
}

export interface DataSourceDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  columns: ColumnDef[];
  filters: FilterDef[];
  groupByOptions: { id: string; label: string }[];
}

export interface ReportFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'between' | 'contains';
  value: any;
}

export interface ReportConfig {
  dataSource: string;
  columns: string[];
  filters: ReportFilter[];
  groupBy?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  dateRange?: { startDate: string; endDate: string };
  clinicId?: number;
  limit?: number;
}

export interface ReportRow {
  [key: string]: any;
}

export interface ReportSummary {
  [key: string]: number;
}

export interface ReportResult {
  rows: ReportRow[];
  summary: ReportSummary;
  meta: {
    totalRows: number;
    executedAt: string;
    dataSource: string;
    dateRange?: { startDate: string; endDate: string };
    groupBy?: string;
  };
}

export interface DataSourceAdapter {
  definition: DataSourceDef;
  execute(config: ReportConfig): Promise<ReportResult>;
}
