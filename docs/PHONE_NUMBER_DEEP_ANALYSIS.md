# Deep Analysis: Phone Numbers Showing as 0000000000

This document traces **exactly** where phone can be lost from intake to patient record, and how to verify each step. Use it when phone is still missing after other fixes.

---

## 1. End-to-end data flow

```
[Source]  →  [Payload]  →  [Normalizer]  →  [Route]  →  [DB]
```

- **Source**: Airtable (wellmedr-intake-automation.js) **or** Fillout (direct POST).
- **Payload**: Flat JSON with keys like `phone`, `first-name`, `email`. Key names vary by source.
- **Normalizer**: `normalizeWellmedrPayload()` → `buildWellmedrPatient()` in `src/lib/wellmedr/intakeNormalizer.ts`. Reads many key variants and sets `patient.phone` (digits only, or `''`).
- **Route**: `src/app/api/webhooks/wellmedr-intake/route.ts`. Runs `normalizePatientData(normalized.patient)` → `patientData.phone = sanitizePhone(patient.phone)` (returns `''` if empty). Then `phoneForDb = patientData.phone || '0000000000'`.
- **DB**: Patient is created/updated with `phone: phoneForDb`. So **if the normalizer leaves `patient.phone` empty, the DB gets `'0000000000'`**. The bug is always upstream of the DB: either the payload never had a usable phone, or the normalizer didn’t extract it.

---

## 2. Failure point 1: Source doesn’t send phone

### Airtable path

- Script: `scripts/airtable/wellmedr-intake-automation.js`.
- It builds `payload` from the triggered record:
  - For each `WELLMEDR_FIELDS` (includes `'phone'`), it uses `getCellValueWithAliases(record, fieldName)` and `stringCellValue(raw, fieldName)`.
  - **Aliases for phone**: `FIELD_ALIASES['phone']` (e.g. "Phone Number", "Mobile", "Primary Phone", "Contact #", …). If the **actual Airtable column name** is not in this list, `getCellValueWithAliases` returns `null` and `payload['phone']` is never set.
  - **Fallback 1**: If `payload['phone']` is still empty and `table.fields` is defined, the script loops over `table.fields` and tries any field whose name contains "phone", "tel", "mobile", "cell". **In Airtable Automations, `table` from `base.getTable()` may not expose `.fields`**, so this fallback may never run.
  - **Fallback 2** (added): If `payload['phone']` is still empty, the script tries a fixed list of extra column names (e.g. "Contact #", "Contact", "Primary Contact Number") with `record.getCellValue(name)` and `stringCellValue(raw, 'phone')`, so phone is still found when the column name isn’t in the main alias list and when `table.fields` is unavailable.

**How to verify**

- In Airtable, note the **exact** column name for the phone field (e.g. "Primary Contact", "Contact #").
- If it’s not in `FIELD_ALIASES['phone']`, add it (or rely on Fallback 2).
- After running the automation, check the webhook response `_diagnostic.receivedKeys`. If there is **no** key that looks like phone (e.g. `phone`, `Phone Number`, `Primary Contact`), the script is not sending phone — fix the script (aliases or fallback).

### Fillout path

- Adapter: `src/lib/wellmedr/filloutAdapter.ts` → `filloutToWellmedrPayload()`.
- Each question is mapped by **id** and **name** to a Wellmedr key. If the question maps to `phone`, the flat payload gets `flat['phone'] = toPhoneValue(q.value)`.
- If the question **id/name** isn’t in `FILLOUT_KEY_TO_WELLMEDR` and doesn’t match the regex `/phone|mobile|cell|tel(ephone)?/`, the question is stored under its raw **id** (e.g. `flat['abc123'] = value`). The normalizer then only sees it if that key is in its list or in the “any key containing phone” fallback.

**How to verify**

- Inspect one Fillout webhook body: find the question that holds the phone (by label or id).
- Check that its `id` or `name` is either in `FILLOUT_KEY_TO_WELLMEDR` or matches the phone regex in the adapter. If not, add a mapping or ensure the normalizer’s fallback can see that key (e.g. key contains "phone" or "mobile").

---

## 3. Failure point 2: Payload has phone under a key the normalizer doesn’t read

- Normalizer: `buildWellmedrPatient()` in `src/lib/wellmedr/intakeNormalizer.ts`.
- It reads phone from a long list of keys (`phone`, `Phone`, `phone-number`, `Phone Number`, `Primary Phone`, `Contact Number`, …) and then `findPayloadKeyCaseInsensitive` / `findFirstValueForKeyContaining(p, ['phone', 'mobile', 'cell', 'telephone'])`.
- If the payload uses a **new** key (e.g. "Primary Contact Number") that isn’t in that list and doesn’t match the “key containing phone/mobile/cell/telephone” logic, `phoneRaw` is undefined.
- Last-resort: it scans **all** keys for key names containing "phone", "mobile", "cell", "tel", "contact" and runs `coerceToPhoneString(value)`. So if the key name is something like "Contact" or "Primary Contact", it should still be found. If the **value** is an object/array that `coerceToPhoneString` doesn’t handle, the normalizer logs: `[Wellmedr Normalizer] Phone-like key(s) present but no value extracted`.

**How to verify**

- In the webhook response, check `_diagnostic`:
  - `receivedKeys`: list of top-level keys in the payload.
  - `phoneLikeKeysInPayload`: keys that look like phone (see below).
  - `phoneReceived`: whether `patientData.phone` was non-empty after normalization.
- If a key in `phoneLikeKeysInPayload` has `valuePresent: true` but `phoneReceived` is false, the **value** is present but not extracted (wrong format or coerce failure). Check logs for the “Phone-like key(s) present but no value extracted” warning and fix the value shape or `coerceToPhoneString`/object handling.

---

## 4. Failure point 3: Value format (object/array/linked record)

- **Airtable**: Linked records or lookups often return objects like `{ name: '...', phoneNumber: '+1...' }` or arrays of such objects. The script uses `stringCellValue()` to pull a string from `value.phoneNumber`, `value.phone`, `value.number`, `value.name`, or `value.fields.*`. If Airtable changes the shape (e.g. different property names), `stringCellValue` can return null or empty.
- **Normalizer**: `coerceToPhoneString()` handles string, number, array of strings, array of objects (with `phoneNumber`/`phone`/`number`/`name`), and single object (same props). If the payload sends a different structure, phone can be lost.

**How to verify**

- Ensure Airtable script’s `stringCellValue` covers the actual cell shape (e.g. log `typeof raw` and `Object.keys(raw)` in dev if needed; do not log PHI in production).
- Ensure normalizer’s `coerceToPhoneString` and the Fillout adapter’s `toPhoneValue` handle the exact shape Fillout/Airtable send (e.g. nested `fields.phoneNumber`).

---

## 5. Checklist when phone is 0000000000

1. **Webhook response**  
   - `_diagnostic.phoneReceived === false` → phone was not extracted.  
   - `_diagnostic.receivedKeys`: does it contain any phone-like key? If not → **source** (Airtable column name or Fillout question id/name).  
   - `_diagnostic.phoneLikeKeysInPayload`: for each key, `valuePresent` true but still `phoneReceived` false → **value format** or normalizer coercion.

2. **Airtable**  
   - Confirm exact column name; add to `FIELD_ALIASES['phone']` or ensure Fallback 2 list includes it.  
   - Confirm `table.fields` is available in your automation context; if not, Fallback 2 (fixed list of names) is the only way to pick up renamed columns.

3. **Fillout**  
   - Confirm question id/name is mapped to `phone` in `filloutAdapter` or matches the phone regex.

4. **Logs**  
   - `[WELLMEDR-INTAKE …] No phone in normalized payload` + `phoneLikeKeys: [...]`: payload had phone-like keys but normalizer didn’t set phone (key name or value format).  
   - `[Wellmedr Normalizer] Phone-like key(s) present but no value extracted`: value was present but `coerceToPhoneString` returned empty.

5. **Never store 0000000000 when source has phone**  
   - Fix is always upstream: ensure the payload contains a usable phone under a key the normalizer reads, and that the value is in a format the script and normalizer can coerce to digits. The route’s `phoneForDb = patientData.phone || '0000000000'` is intentional for “no phone provided”; we don’t want to change that until the upstream path is correct.

---

## 6. Files reference

| Layer            | File(s) |
|-----------------|--------|
| Airtable script | `scripts/airtable/wellmedr-intake-automation.js` |
| Fillout → flat  | `src/lib/wellmedr/filloutAdapter.ts` |
| Normalizer      | `src/lib/wellmedr/intakeNormalizer.ts` (`buildWellmedrPatient`, `coerceToPhoneString`, `sanitizePhone`) |
| Webhook route   | `src/app/api/webhooks/wellmedr-intake/route.ts` (`normalizePatientData`, `sanitizePhone`, `phoneForDb`, `_diagnostic`) |

---

## 7. Summary

- **Why 0000000000?** Because `patientData.phone` is empty when the patient is created/updated, so the route sets `phoneForDb = patientData.phone || '0000000000'`.
- **Why is patientData.phone empty?** Either (1) the payload never had a phone key the normalizer reads, or (2) the payload had a phone-like key but the value wasn’t extracted (format/coercion).
- **Fix strategy:** Use `_diagnostic` and logs to see whether the problem is missing key (source: Airtable/Fillout) or present key with bad value (script/normalizer format). Then fix the source column/question name, add aliases or fallbacks, and/or extend `stringCellValue` / `coerceToPhoneString` for the actual value shape.
