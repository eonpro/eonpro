# Bloodwork Canonical Units — Design (No Implementation Yet)

**Status:** Design only. Do not auto-convert historical data until this is approved and migration is planned.  
**Date:** 2025-02-08.

---

## 1. Goal

- Store and display lab values in a **canonical unit** per biomarker so that:
  - Trend charts and cross-report comparison are correct (e.g. glucose in mg/dL only).
  - Multiple lab vendors or report formats that use different units (e.g. mmol/L vs mg/dL) can be normalized at read or write time.
- Keep **raw extracted** value and unit from the PDF for audit and display of “as reported.”
- Do **not** change existing `LabReportResult` rows or backfill historical data until a migration is designed and approved.

---

## 2. Unit Map (Proposed)

Canonical unit per biomarker (or per logical test). Prefer CLIA / LOINC-common units where applicable.

| Biomarker (normalized name / key) | Canonical unit | Common alternate units | Conversion |
|-----------------------------------|----------------|-------------------------|------------|
| GLUCOSE | mg/dL | mmol/L | mmol/L × 18.018 ≈ mg/dL |
| CREATININE | mg/dL | µmol/L | µmol/L ÷ 88.42 ≈ mg/dL |
| CHOLESTEROL, TOTAL | mg/dL | mmol/L | mmol/L × 38.67 ≈ mg/dL |
| HDL CHOLESTEROL | mg/dL | mmol/L | mmol/L × 38.67 ≈ mg/dL |
| LDL CHOLESTEROL | mg/dL | mmol/L | mmol/L × 38.67 ≈ mg/dL |
| TRIGLYCERIDES | mg/dL | mmol/L | mmol/L × 88.57 ≈ mg/dL |
| TESTOSTERONE (total) | ng/dL | nmol/L | nmol/L × 0.0289 ≈ ng/dL |
| TESTOSTERONE (free) | pg/mL | pmol/L | pmol/L × 0.289 ≈ pg/mL |
| T3, FREE | pg/mL | pmol/L | pmol/L × 0.651 ≈ pg/mL |
| T4, FREE | ng/dL | pmol/L | pmol/L × 0.0777 ≈ ng/dL |
| TSH | mIU/L | mIU/L | (already canonical in most reports) |
| VITAMIN D | ng/mL | nmol/L | nmol/L ÷ 2.496 ≈ ng/mL |
| HEMOGLOBIN | g/dL | g/L | g/L ÷ 10 = g/dL |
| HEMATOCRIT | % | (no common alternate) | — |
| SODIUM, POTASSIUM, etc. | Keep as reported (e.g. mmol/L, mEq/L) | — | Map only if needed |

- **Default:** If a biomarker is not in the map, **canonical unit = stored unit**; no conversion. Optionally flag “unmapped” for future expansion.

---

## 3. Conversion Rules

- **Direction:** Convert **from** stored/original unit **to** canonical unit when:
  - Building trend data (e.g. “glucose over time”).
  - Comparing results across reports.
- **Stored fields (future schema):**
  - Keep existing: `value`, `valueNumeric`, `unit`, `referenceRange` (as reported).
  - Optional new columns (or JSON): `canonicalUnit`, `canonicalValueNumeric`, `conversionFactorUsed`.
- **Rounding:** Store canonical value with a fixed precision (e.g. 2 decimal places for most chemistry) to avoid floating-point display noise.
- **Reference range:** Converting reference range strings (e.g. "70-99 mg/dL" → "3.9-5.5 mmol/L") is **out of scope** for v1; display “as reported” and optionally show canonical value only for the numeric result. Later: parse range and convert bounds if needed.

---

## 4. Where to Apply (Future)

- **Option A — At write (recommended):** When persisting `LabReportResult`, compute and store `canonicalUnit` and `canonicalValueNumeric` using the unit map. Display and trends use canonical values; raw remains for audit.
- **Option B — At read:** Store only raw; compute canonical in API or service when building trend payloads. Simpler schema; slightly more compute per request.
- **Recommendation:** Option A so that trend APIs stay simple and we can index/query by canonical value if needed later.

---

## 5. Migration Strategy (Future, No Auto-Conversion Now)

1. **Schema:** Add nullable `canonicalUnit` (string) and `canonicalValueNumeric` (float) to `LabReportResult` (or equivalent in your schema). Do **not** backfill existing rows in the same migration; leave them null.
2. **Parser / service:** For **new** uploads only, after validation, run a “normalize to canonical” step: look up biomarker (e.g. by normalized test name) in the unit map; if current unit matches an alternate, apply conversion and set canonical fields; otherwise set canonical = raw.
3. **Historical data:** Separate migration or background job: for each existing row with null canonical fields, run the same normalization logic (read-only from existing `unit` / `valueNumeric`). Run in batches; no change to raw fields.
4. **APIs:** Trend or comparison endpoints return `canonicalValueNumeric` and `canonicalUnit` when present; otherwise fall back to `valueNumeric` and `unit` for backward compatibility.

---

## 6. Out of Scope for This Design

- Automatic conversion of **reference range** text.
- Sex/age-specific reference ranges (separate design).
- Support for units that require patient weight (e.g. BSA-based) in this unit map.

---

*This document is design only. No code changes or data migration are implied until explicitly scheduled.*
