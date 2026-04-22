import {
  CsvRow,
  Issue,
  IssueSeverity,
  IssueRule,
  DrugCategory,
  PatientLineItem,
  PatientSummary,
  MedicationSummary,
  MedicationPriceEntry,
  SummaryStats,
  AnalysisResult,
} from './types';

// ── Drug classification ──

const PRIMARY_GLP1_KEYWORDS = ['semaglutide', 'tirzepatide'];

const ADD_ON_KEYWORDS = [
  'nad',
  'nad+',
  'nicotinamide',
  'sermorelin',
  'cyanocobalamin',
  'b12',
  'vitamin b',
  'bpc-157',
  'bpc 157',
  'bpc157',
  'glutathione',
  'lipo-mino',
  'lipomino',
  'lipo mino',
  'mic',
  'methionine',
  'l-carnitine',
  'carnitine',
  'biotin',
  'testosterone',
  'pt-141',
  'pt 141',
  'pt141',
  'oxytocin',
  'sildenafil',
  'tadalafil',
  'ipamorelin',
  'tesamorelin',
  'gonadorelin',
  'anastrozole',
  'enclomiphene',
  'dhea',
  'pregnenolone',
  'progesterone',
  'estradiol',
  'tretinoin',
  'minoxidil',
  'finasteride',
  'dutasteride',
  'modafinil',
  'naltrexone',
  'metformin',
];

const ANTI_NAUSEA_KEYWORDS = ['ondansetron', 'ondansentron', 'zofran', 'odt tablet'];

const SUPPLY_KEYWORDS = [
  'syringe',
  'alcohol pad',
  'alcohol pads',
  'kit of',
  'needle',
  'sharps',
  'swab',
];

export function classifyDrug(drugName: string): DrugCategory {
  const lower = drugName.toLowerCase();
  if (SUPPLY_KEYWORDS.some((kw) => lower.includes(kw))) return DrugCategory.SUPPLY;
  if (PRIMARY_GLP1_KEYWORDS.some((kw) => lower.includes(kw))) return DrugCategory.PRIMARY_GLP1;
  if (ANTI_NAUSEA_KEYWORDS.some((kw) => lower.includes(kw))) return DrugCategory.ANTI_NAUSEA;
  if (ADD_ON_KEYWORDS.some((kw) => lower.includes(kw))) return DrugCategory.ADD_ON;
  return DrugCategory.UNKNOWN;
}

function isSupplyItem(drugName: string): boolean {
  return classifyDrug(drugName) === DrugCategory.SUPPLY;
}

function parseNumeric(val: string | undefined | null): number | null {
  if (val == null || val === '') return null;
  const cleaned = String(val).replace(/[$,\s]/g, '');
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}

function parseDateLoose(val: string | undefined | null): Date | null {
  if (!val || val.trim() === '') return null;
  const trimmed = val.trim();

  // Handle "M/D/YY" or "M/D/YYYY" (with optional time)
  const parts = trimmed.split(/[\s]+/);
  const datePart = parts[0];
  const dateSegments = datePart.split('/');
  if (dateSegments.length === 3) {
    let [m, d, y] = dateSegments.map(Number);
    if (y < 100) y += 2000;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const date = new Date(y, m - 1, d);
      if (!isNaN(date.getTime())) return date;
    }
  }

  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? null : fallback;
}

let issueCounter = 0;
function nextIssueId(): string {
  return `issue-${++issueCounter}`;
}

// ── Column header mapping ──
// The CSV headers may contain slight variations; normalize to our CsvRow fields.
const HEADER_MAP: Record<string, keyof CsvRow> = {
  'date range': 'dateRange',
  daterange: 'dateRange',
  'rx number': 'rxNumber',
  rxnumber: 'rxNumber',
  'date written': 'dateWritten',
  datewritten: 'dateWritten',
  'date shipped': 'dateShipped',
  dateshipped: 'dateShipped',
  'patient name': 'patientName',
  patientname: 'patientName',
  'practice name': 'practiceName',
  practicename: 'practiceName',
  'drug name': 'drugName',
  drugname: 'drugName',
  'rx qty': 'rxQty',
  rxqty: 'rxQty',
  'dispensed q': 'dispensedQ',
  dispensedq: 'dispensedQ',
  'filled qty': 'filledQty',
  filledqty: 'filledQty',
  'rx status': 'rxStatus',
  rxstatus: 'rxStatus',
  'rx price': 'rxPrice',
  rxprice: 'rxPrice',
  'order id': 'orderId',
  orderid: 'orderId',
};

export function mapHeaderToField(header: string): keyof CsvRow | null {
  const normalized = header.trim().toLowerCase().replace(/[_\-]+/g, ' ');
  return HEADER_MAP[normalized] ?? null;
}

export function parseRows(rawRows: Record<string, string>[]): CsvRow[] {
  return rawRows.map((raw, idx) => {
    const mapped: Partial<CsvRow> = { rowNumber: idx + 2 }; // +2 because row 1 = header

    for (const [header, value] of Object.entries(raw)) {
      const field = mapHeaderToField(header);
      if (!field || field === 'rowNumber') continue;

      if (field === 'rxQty' || field === 'dispensedQ' || field === 'filledQty' || field === 'rxPrice') {
        (mapped as Record<string, unknown>)[field] = parseNumeric(value);
      } else {
        (mapped as Record<string, unknown>)[field] = (value ?? '').toString().trim();
      }
    }

    return {
      rowNumber: mapped.rowNumber!,
      dateRange: mapped.dateRange ?? '',
      rxNumber: mapped.rxNumber ?? '',
      dateWritten: mapped.dateWritten ?? '',
      dateShipped: mapped.dateShipped ?? '',
      patientName: mapped.patientName ?? '',
      practiceName: mapped.practiceName ?? '',
      drugName: mapped.drugName ?? '',
      rxQty: mapped.rxQty ?? null,
      dispensedQ: mapped.dispensedQ ?? null,
      filledQty: mapped.filledQty ?? null,
      rxStatus: mapped.rxStatus ?? '',
      rxPrice: mapped.rxPrice ?? null,
      orderId: mapped.orderId ?? '',
    };
  });
}

// ── Detection rules ──

function detectDuplicateRxNumbers(rows: CsvRow[]): Issue[] {
  const rxMap = new Map<string, CsvRow[]>();
  for (const row of rows) {
    if (!row.rxNumber) continue;
    const key = row.rxNumber.trim();
    if (!rxMap.has(key)) rxMap.set(key, []);
    rxMap.get(key)!.push(row);
  }

  const issues: Issue[] = [];
  for (const [rxNum, group] of rxMap) {
    if (group.length > 1) {
      issues.push({
        id: nextIssueId(),
        severity: IssueSeverity.ERROR,
        rule: IssueRule.DUPLICATE_RX_NUMBER,
        rowNumbers: group.map((r) => r.rowNumber),
        patientName: group[0].patientName,
        drugName: group[0].drugName,
        rxNumber: rxNum,
        details: `Rx Number ${rxNum} appears ${group.length} times (rows ${group.map((r) => r.rowNumber).join(', ')})`,
      });
    }
  }
  return issues;
}

function detectPriceDiffsSameContext(rows: CsvRow[]): Issue[] {
  const groupMap = new Map<string, CsvRow[]>();
  for (const row of rows) {
    if (row.rxPrice == null || !row.patientName || !row.drugName) continue;
    const dateKey = row.dateShipped?.split(/\s/)[0] ?? '';
    const key = `${row.patientName.toLowerCase()}|${row.drugName.toLowerCase()}|${dateKey}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(row);
  }

  const issues: Issue[] = [];
  for (const [, group] of groupMap) {
    const prices = new Set(group.filter((r) => r.rxPrice != null).map((r) => r.rxPrice));
    if (prices.size > 1) {
      issues.push({
        id: nextIssueId(),
        severity: IssueSeverity.ERROR,
        rule: IssueRule.PRICE_DIFFERS_SAME_CONTEXT,
        rowNumbers: group.map((r) => r.rowNumber),
        patientName: group[0].patientName,
        drugName: group[0].drugName,
        rxNumber: group[0].rxNumber,
        details: `Same patient/drug/date billed at different prices: $${[...prices].join(', $')}`,
      });
    }
  }
  return issues;
}

function detectMedicationPriceInconsistency(rows: CsvRow[]): Issue[] {
  const drugPrices = new Map<string, Map<number, CsvRow[]>>();
  for (const row of rows) {
    if (row.rxPrice == null || isSupplyItem(row.drugName)) continue;
    const drugKey = row.drugName.toLowerCase().trim();
    if (!drugPrices.has(drugKey)) drugPrices.set(drugKey, new Map());
    const priceMap = drugPrices.get(drugKey)!;
    if (!priceMap.has(row.rxPrice)) priceMap.set(row.rxPrice, []);
    priceMap.get(row.rxPrice)!.push(row);
  }

  const issues: Issue[] = [];
  for (const [, priceMap] of drugPrices) {
    if (priceMap.size <= 1) continue;
    const allRows = [...priceMap.values()].flat();
    const priceBreakdown = [...priceMap.entries()]
      .map(([price, rws]) => `$${price} (${rws.length}x)`)
      .join(', ');
    issues.push({
      id: nextIssueId(),
      severity: IssueSeverity.WARNING,
      rule: IssueRule.MEDICATION_PRICE_INCONSISTENCY,
      rowNumbers: allRows.slice(0, 10).map((r) => r.rowNumber),
      patientName: '',
      drugName: allRows[0].drugName,
      rxNumber: '',
      details: `Drug billed at multiple prices: ${priceBreakdown}`,
    });
  }
  return issues;
}

function detectQuantityMismatches(rows: CsvRow[]): Issue[] {
  const issues: Issue[] = [];
  for (const row of rows) {
    if (row.rxQty != null && row.dispensedQ != null && row.rxQty !== row.dispensedQ) {
      issues.push({
        id: nextIssueId(),
        severity: IssueSeverity.WARNING,
        rule: IssueRule.RX_QTY_VS_DISPENSED,
        rowNumbers: [row.rowNumber],
        patientName: row.patientName,
        drugName: row.drugName,
        rxNumber: row.rxNumber,
        details: `Rx Qty (${row.rxQty}) != Dispensed Q (${row.dispensedQ})`,
      });
    }
    if (row.rxQty != null && row.filledQty != null && row.rxQty !== row.filledQty) {
      issues.push({
        id: nextIssueId(),
        severity: IssueSeverity.WARNING,
        rule: IssueRule.RX_QTY_VS_FILLED,
        rowNumbers: [row.rowNumber],
        patientName: row.patientName,
        drugName: row.drugName,
        rxNumber: row.rxNumber,
        details: `Rx Qty (${row.rxQty}) != Filled qty (${row.filledQty})`,
      });
    }
  }
  return issues;
}

function detectMissingPrice(rows: CsvRow[]): Issue[] {
  const issues: Issue[] = [];
  for (const row of rows) {
    if ((row.rxPrice == null || row.rxPrice === 0) && row.drugName && !isSupplyItem(row.drugName)) {
      issues.push({
        id: nextIssueId(),
        severity: IssueSeverity.WARNING,
        rule: IssueRule.MISSING_RX_PRICE,
        rowNumbers: [row.rowNumber],
        patientName: row.patientName,
        drugName: row.drugName,
        rxNumber: row.rxNumber,
        details: `Billable drug has no price (Rx Price is ${row.rxPrice ?? 'empty'})`,
      });
    }
  }
  return issues;
}

function detectDateAnomalies(rows: CsvRow[]): Issue[] {
  const issues: Issue[] = [];
  for (const row of rows) {
    const written = parseDateLoose(row.dateWritten);
    const shipped = parseDateLoose(row.dateShipped);
    if (written && shipped && shipped < written) {
      issues.push({
        id: nextIssueId(),
        severity: IssueSeverity.ERROR,
        rule: IssueRule.DATE_SHIPPED_BEFORE_WRITTEN,
        rowNumbers: [row.rowNumber],
        patientName: row.patientName,
        drugName: row.drugName,
        rxNumber: row.rxNumber,
        details: `Shipped (${row.dateShipped}) is before Written (${row.dateWritten})`,
      });
    }
  }
  return issues;
}

function detectOrderCrossPatient(rows: CsvRow[]): Issue[] {
  const orderMap = new Map<string, Set<string>>();
  const orderRows = new Map<string, CsvRow[]>();
  for (const row of rows) {
    if (!row.orderId) continue;
    const key = row.orderId.trim();
    if (!orderMap.has(key)) {
      orderMap.set(key, new Set());
      orderRows.set(key, []);
    }
    orderMap.get(key)!.add(row.patientName.toLowerCase().trim());
    orderRows.get(key)!.push(row);
  }

  const issues: Issue[] = [];
  for (const [orderId, patients] of orderMap) {
    if (patients.size > 1) {
      const rws = orderRows.get(orderId)!;
      issues.push({
        id: nextIssueId(),
        severity: IssueSeverity.ERROR,
        rule: IssueRule.ORDER_CROSS_PATIENT,
        rowNumbers: rws.slice(0, 10).map((r) => r.rowNumber),
        patientName: [...patients].join(', '),
        drugName: '',
        rxNumber: '',
        details: `Order ${orderId} linked to ${patients.size} different patients: ${[...patients].join(', ')}`,
      });
    }
  }
  return issues;
}

function detectPatientOutliers(rows: CsvRow[]): Issue[] {
  const patientRows = new Map<string, CsvRow[]>();
  for (const row of rows) {
    if (!row.patientName) continue;
    const key = row.patientName.toLowerCase().trim();
    if (!patientRows.has(key)) patientRows.set(key, []);
    patientRows.get(key)!.push(row);
  }

  const counts = [...patientRows.values()].map((g) => g.length);
  if (counts.length === 0) return [];

  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const stdDev = Math.sqrt(counts.reduce((s, c) => s + (c - mean) ** 2, 0) / counts.length);
  const threshold = mean + 2 * stdDev;
  const lowThreshold = Math.max(1, mean - 2 * stdDev);

  const totals = new Map<string, number>();
  for (const [key, rws] of patientRows) {
    totals.set(key, rws.reduce((s, r) => s + (r.rxPrice ?? 0), 0));
  }
  const billedValues = [...totals.values()];
  const billedMean = billedValues.reduce((a, b) => a + b, 0) / billedValues.length;
  const billedStdDev = Math.sqrt(
    billedValues.reduce((s, v) => s + (v - billedMean) ** 2, 0) / billedValues.length
  );
  const billedHigh = billedMean + 2 * billedStdDev;
  const billedLow = Math.max(0, billedMean - 2 * billedStdDev);

  const issues: Issue[] = [];

  for (const [key, rws] of patientRows) {
    if (rws.length > threshold || rws.length < lowThreshold) {
      issues.push({
        id: nextIssueId(),
        severity: IssueSeverity.INFO,
        rule: IssueRule.PATIENT_ROW_COUNT_OUTLIER,
        rowNumbers: rws.slice(0, 5).map((r) => r.rowNumber),
        patientName: rws[0].patientName,
        drugName: '',
        rxNumber: '',
        details: `Patient has ${rws.length} rows (avg: ${mean.toFixed(1)}, std: ${stdDev.toFixed(1)})`,
      });
    }

    const total = totals.get(key) ?? 0;
    if (total > billedHigh || total < billedLow) {
      issues.push({
        id: nextIssueId(),
        severity: IssueSeverity.INFO,
        rule: IssueRule.PATIENT_TOTAL_BILLED_OUTLIER,
        rowNumbers: rws.slice(0, 5).map((r) => r.rowNumber),
        patientName: rws[0].patientName,
        drugName: '',
        rxNumber: '',
        details: `Patient total billed: $${total.toFixed(2)} (avg: $${billedMean.toFixed(2)}, std: $${billedStdDev.toFixed(2)})`,
      });
    }
  }

  return issues;
}

// ── Summarizers ──

function buildPatientSummaries(rows: CsvRow[], issues: Issue[]): PatientSummary[] {
  const map = new Map<string, { rows: CsvRow[]; meds: Set<string>; orders: Set<string> }>();
  for (const row of rows) {
    const key = row.patientName.toLowerCase().trim();
    if (!map.has(key)) map.set(key, { rows: [], meds: new Set(), orders: new Set() });
    const entry = map.get(key)!;
    entry.rows.push(row);
    if (row.drugName) entry.meds.add(row.drugName);
    if (row.orderId) entry.orders.add(row.orderId);
  }

  const issuesByPatient = new Map<string, number>();
  for (const issue of issues) {
    if (issue.patientName) {
      const key = issue.patientName.toLowerCase().trim();
      issuesByPatient.set(key, (issuesByPatient.get(key) ?? 0) + 1);
    }
  }

  return [...map.entries()]
    .map(([key, { rows: rws, meds, orders }]) => {
      const lineItems: PatientLineItem[] = rws.map((r) => ({
        rowNumber: r.rowNumber,
        rxNumber: r.rxNumber,
        dateShipped: r.dateShipped,
        drugName: r.drugName,
        drugCategory: classifyDrug(r.drugName),
        rxQty: r.rxQty,
        dispensedQ: r.dispensedQ,
        filledQty: r.filledQty,
        rxPrice: r.rxPrice,
        rxStatus: r.rxStatus,
        orderId: r.orderId,
      }));

      const addOnItems = lineItems.filter((li) => li.drugCategory === DrugCategory.ADD_ON);
      const unknownItems = lineItems.filter((li) => li.drugCategory === DrugCategory.UNKNOWN);
      const primaryItems = lineItems.filter((li) => li.drugCategory === DrugCategory.PRIMARY_GLP1);

      const addOnDrugs = [...new Set([...addOnItems, ...unknownItems].map((li) => li.drugName))];
      const primaryDrugs = [...new Set(primaryItems.map((li) => li.drugName))];

      return {
        patientName: rws[0].patientName,
        totalRows: rws.length,
        uniqueMedications: [...meds],
        totalBilled: rws.reduce((s, r) => s + (r.rxPrice ?? 0), 0),
        orders: [...orders],
        issueCount: issuesByPatient.get(key) ?? 0,
        lineItems,
        hasAddOns: addOnDrugs.length > 0,
        addOnDrugs,
        primaryDrugs,
      };
    })
    .sort((a, b) => b.issueCount - a.issueCount || b.totalBilled - a.totalBilled);
}

function buildMedicationSummaries(rows: CsvRow[]): MedicationSummary[] {
  const map = new Map<
    string,
    { rows: CsvRow[]; prices: Map<number, number>; patients: Set<string> }
  >();

  for (const row of rows) {
    if (!row.drugName) continue;
    const key = row.drugName.toLowerCase().trim();
    if (!map.has(key)) map.set(key, { rows: [], prices: new Map(), patients: new Set() });
    const entry = map.get(key)!;
    entry.rows.push(row);
    if (row.rxPrice != null) {
      entry.prices.set(row.rxPrice, (entry.prices.get(row.rxPrice) ?? 0) + 1);
    }
    if (row.patientName) entry.patients.add(row.patientName.toLowerCase().trim());
  }

  return [...map.entries()]
    .map(([, { rows: rws, prices, patients }]) => {
      const uniquePrices: MedicationPriceEntry[] = [...prices.entries()]
        .map(([price, count]) => ({ price, count }))
        .sort((a, b) => b.count - a.count);

      return {
        drugName: rws[0].drugName,
        drugCategory: classifyDrug(rws[0].drugName),
        totalRows: rws.length,
        totalQuantityDispensed: rws.reduce((s, r) => s + (r.dispensedQ ?? 0), 0),
        totalBilled: rws.reduce((s, r) => s + (r.rxPrice ?? 0), 0),
        uniquePrices,
        uniquePatients: patients.size,
        hasPriceVariance: uniquePrices.length > 1,
      };
    })
    .sort((a, b) => b.totalBilled - a.totalBilled);
}

function buildSummaryStats(
  rows: CsvRow[],
  issues: Issue[],
  patients: PatientSummary[],
  medications: MedicationSummary[]
): SummaryStats {
  const allDates = rows
    .map((r) => parseDateLoose(r.dateShipped))
    .filter((d): d is Date => d != null)
    .sort((a, b) => a.getTime() - b.getTime());

  const orders = new Set(rows.map((r) => r.orderId).filter(Boolean));

  return {
    totalRows: rows.length,
    uniquePatients: patients.length,
    uniqueMedications: medications.length,
    uniqueOrders: orders.size,
    totalBilled: rows.reduce((s, r) => s + (r.rxPrice ?? 0), 0),
    dateRangeStart: allDates[0]?.toISOString().split('T')[0] ?? '',
    dateRangeEnd: allDates[allDates.length - 1]?.toISOString().split('T')[0] ?? '',
    issuesByServerity: {
      error: issues.filter((i) => i.severity === IssueSeverity.ERROR).length,
      warning: issues.filter((i) => i.severity === IssueSeverity.WARNING).length,
      info: issues.filter((i) => i.severity === IssueSeverity.INFO).length,
    },
    totalIssues: issues.length,
  };
}

// ── Main entry ──

export function analyzeCsv(rawRows: Record<string, string>[]): AnalysisResult {
  issueCounter = 0;
  const rows = parseRows(rawRows);

  const issues: Issue[] = [
    ...detectDuplicateRxNumbers(rows),
    ...detectPriceDiffsSameContext(rows),
    ...detectMedicationPriceInconsistency(rows),
    ...detectQuantityMismatches(rows),
    ...detectMissingPrice(rows),
    ...detectDateAnomalies(rows),
    ...detectOrderCrossPatient(rows),
    ...detectPatientOutliers(rows),
  ];

  const patients = buildPatientSummaries(rows, issues);
  const medications = buildMedicationSummaries(rows);
  const summary = buildSummaryStats(rows, issues, patients, medications);

  return { summary, issues, patients, medications, rows };
}
