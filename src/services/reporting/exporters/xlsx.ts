import type { ReportResult, ColumnDef } from '../types';

/**
 * Export report to XLSX-compatible tab-separated format.
 * Uses a lightweight TSV approach that Excel/Google Sheets can open directly,
 * avoiding heavy xlsx library dependency on serverless.
 */
export function exportToXlsx(
  result: ReportResult,
  columns: ColumnDef[],
  reportName: string
): Buffer {
  const visibleCols = columns.filter((c) => result.rows[0] && c.id in result.rows[0]);

  const fmtVal = (val: any, col: ColumnDef): string => {
    if (val === null || val === undefined) return '';
    if (col.type === 'currency') return (Number(val) / 100).toFixed(2);
    if (col.type === 'percent') return (Number(val) / 100).toFixed(2);
    if (col.type === 'date') return typeof val === 'string' ? val.slice(0, 10) : '';
    if (col.type === 'boolean') return val ? 'Yes' : 'No';
    return String(val).replace(/\t/g, ' ');
  };

  let tsv = '';

  tsv += `${reportName}\n`;
  tsv += `Generated\t${new Date().toISOString()}\n`;
  if (result.meta.dateRange) {
    tsv += `Period\t${result.meta.dateRange.startDate.slice(0, 10)} to ${result.meta.dateRange.endDate.slice(0, 10)}\n`;
  }
  tsv += `Rows\t${result.meta.totalRows}\n`;
  tsv += '\n';

  if (Object.keys(result.summary).length > 0) {
    for (const [key, val] of Object.entries(result.summary)) {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
      tsv += `${label}\t${val}\n`;
    }
    tsv += '\n';
  }

  tsv += visibleCols.map((c) => c.label).join('\t') + '\n';
  for (const row of result.rows) {
    tsv += visibleCols.map((c) => fmtVal(row[c.id], c)).join('\t') + '\n';
  }

  return Buffer.from(tsv, 'utf-8');
}
