import type { ReportResult, ColumnDef } from '../types';

export function exportToCsv(
  result: ReportResult,
  columns: ColumnDef[],
  reportName: string
): string {
  const fmtVal = (val: any, col: ColumnDef): string => {
    if (val === null || val === undefined) return '';
    if (col.type === 'currency') return `$${(Number(val) / 100).toFixed(2)}`;
    if (col.type === 'percent') return `${Number(val).toFixed(2)}%`;
    if (col.type === 'date') return typeof val === 'string' ? val.slice(0, 10) : '';
    if (col.type === 'boolean') return val ? 'Yes' : 'No';
    return String(val).replace(/"/g, '""');
  };

  const visibleCols = columns.filter((c) => result.rows[0] && c.id in result.rows[0]);
  let csv = `${reportName}\n`;
  csv += `Generated: ${new Date().toLocaleString()}\n`;
  if (result.meta.dateRange) {
    csv += `Period: ${result.meta.dateRange.startDate.slice(0, 10)} to ${result.meta.dateRange.endDate.slice(0, 10)}\n`;
  }
  if (result.meta.groupBy) csv += `Grouped by: ${result.meta.groupBy}\n`;
  csv += `Total rows: ${result.meta.totalRows}\n\n`;

  if (Object.keys(result.summary).length > 0) {
    csv += `=== SUMMARY ===\n`;
    for (const [key, val] of Object.entries(result.summary)) {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
      const isCurrency =
        key.toLowerCase().includes('revenue') ||
        key.toLowerCase().includes('commission') ||
        key.toLowerCase().includes('amount') ||
        key.toLowerCase().includes('mrr');
      csv += `${label},${isCurrency ? '$' + (Number(val) / 100).toFixed(2) : val}\n`;
    }
    csv += '\n';
  }

  csv += `=== DATA ===\n`;
  csv += visibleCols.map((c) => `"${c.label}"`).join(',') + '\n';
  for (const row of result.rows) {
    csv += visibleCols.map((c) => `"${fmtVal(row[c.id], c)}"`).join(',') + '\n';
  }

  return csv;
}
