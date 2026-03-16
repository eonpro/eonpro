import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { ReportResult, ColumnDef } from '../types';

export async function exportToPdf(result: ReportResult, columns: ColumnDef[], reportName: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontSize = 8;
  const headerSize = 14;
  const margin = 40;

  const visibleCols = columns.filter((c) => result.rows[0] && c.id in result.rows[0]);
  const colWidth = visibleCols.length > 0 ? (530 / visibleCols.length) : 530;

  let page = doc.addPage([612, 792]);
  let y = 752;

  const drawText = (text: string, x: number, yPos: number, size: number, f = font) => {
    page.drawText(text, { x, y: yPos, size, font: f, color: rgb(0.1, 0.1, 0.1) });
  };

  const newPage = () => {
    page = doc.addPage([612, 792]);
    y = 752;
  };

  drawText(reportName, margin, y, headerSize, boldFont);
  y -= 20;
  drawText(`Generated: ${new Date().toLocaleString()}`, margin, y, fontSize);
  y -= 12;
  if (result.meta.dateRange) {
    drawText(`Period: ${result.meta.dateRange.startDate.slice(0, 10)} to ${result.meta.dateRange.endDate.slice(0, 10)}`, margin, y, fontSize);
    y -= 12;
  }
  drawText(`Total rows: ${result.meta.totalRows}`, margin, y, fontSize);
  y -= 20;

  if (Object.keys(result.summary).length > 0) {
    drawText('Summary', margin, y, 10, boldFont);
    y -= 14;
    for (const [key, val] of Object.entries(result.summary)) {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
      const isCurrency = key.toLowerCase().includes('revenue') || key.toLowerCase().includes('commission') || key.toLowerCase().includes('amount');
      drawText(`${label}: ${isCurrency ? '$' + (Number(val) / 100).toFixed(2) : val}`, margin, y, fontSize);
      y -= 11;
    }
    y -= 10;
  }

  // Table header
  page.drawRectangle({ x: margin - 2, y: y - 2, width: 534, height: 14, color: rgb(0.93, 0.93, 0.93) });
  visibleCols.forEach((col, i) => {
    const text = col.label.length > (colWidth / 5) ? col.label.slice(0, Math.floor(colWidth / 5)) : col.label;
    drawText(text, margin + i * colWidth, y, fontSize, boldFont);
  });
  y -= 16;

  const fmtVal = (val: any, col: ColumnDef): string => {
    if (val === null || val === undefined) return '';
    if (col.type === 'currency') return '$' + (Number(val) / 100).toFixed(2);
    if (col.type === 'percent') return Number(val).toFixed(1) + '%';
    if (col.type === 'date') return typeof val === 'string' ? val.slice(0, 10) : '';
    if (col.type === 'boolean') return val ? 'Yes' : 'No';
    const s = String(val);
    return s.length > Math.floor(colWidth / 4.5) ? s.slice(0, Math.floor(colWidth / 4.5)) + '...' : s;
  };

  for (const row of result.rows) {
    if (y < 40) newPage();
    visibleCols.forEach((col, i) => {
      drawText(fmtVal(row[col.id], col), margin + i * colWidth, y, fontSize);
    });
    y -= 11;
  }

  return doc.save();
}
