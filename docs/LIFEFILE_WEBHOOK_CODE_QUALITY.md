# Lifefile Webhook Code Quality – Enterprise Review

## Scope

- `src/lib/webhooks/lifefile-payload.ts` – shared payload extraction and sanitization
- `src/app/api/webhooks/lifefile/prescription-status/route.ts`
- `src/app/api/webhooks/lifefile/inbound/[clinicSlug]/route.ts`
- `src/app/api/webhooks/lifefile-data-push/route.ts`
- `tests/unit/webhooks/lifefile-payload.test.ts`

---

## 1. lifefile-payload.ts – Line-by-Line

| Line / area | Purpose | Quality / security |
|-------------|--------|--------------------|
| MAX_ID_LENGTH = 255 | Cap length of orderId/referenceId | Prevents oversized DB/query abuse; aligns with typical varchar(255). |
| ID_KEYS, REF_KEYS, NESTED_PATHS | Object.freeze() | Immutable config; no accidental mutation. |
| getString / normalizeId | Coerce and validate ID values | Rejects null, empty, non-string/non-finite-number; trims; enforces max length. |
| extractFrom | Read first valid string for keys | Uses normalizeId so all outputs are validated. |
| getNestedObject | Read nested object from payload | Rejects null, non-object, and arrays (avoids treating array as object). |
| extractLifefileOrderIdentifiers | Extract orderId + referenceId | Handles top-level + order/data/prescription/rx; returns only normalized strings or null. |
| buildOrderLookupWhere | Build Prisma where | Returns null when no IDs (caller must not query); typed return. |
| SHIPPING_STATUS_MAP | Map string → ShippingStatus | Object.freeze; uses Prisma ShippingStatus type. |
| mapToShippingStatusEnum | Webhook status → enum | Handles null/undefined/non-string; default SHIPPED; no injection. |
| sanitizeEventType | Safe eventType for OrderEvent | Alphanumeric + underscore + hyphen only; max 128 chars; invalid → "update". |
| MAX_WEBHOOK_BODY_BYTES | 512 KB | DoS protection; single constant for all routes. |

**Tests:** 30 unit tests cover extraction (top-level, nested, snake_case, numeric, null, array, length limits), buildOrderLookupWhere, mapToShippingStatusEnum, sanitizeEventType, and constants.

---

## 2. prescription-status/route.ts

| Area | Implementation | Quality / security |
|------|----------------|--------------------|
| Auth | findClinicByCredentials(Basic) | Username must be in allowlist; password compared per clinic (decrypted). No PHI in logs. |
| Body size | content-length check + rawBody.length | Rejects > MAX_WEBHOOK_BODY_BYTES with 413. |
| JSON parse | JSON.parse + object check | Rejects null, non-object, array (no prototype pollution / primitive payload). |
| Payload fields | status, trackingNumber, trackingUrl | Typed checks; trim + length cap (128 / 255 / 2048). |
| Order lookup | buildOrderLookupWhere + findFirst | Clinic-scoped; no lookup when no IDs; 400 when missing IDs. |
| Order update | updateData built from validated fields | Only set if present; lastWebhookPayload = stringified payload. |
| OrderEvent | eventType = sanitizeEventType(...), note length cap | Prevents injection; note truncated to safe length. |
| WebhookLog | endpoint, method, status, statusCode, errorMessage, etc. | No PHI in log payload; auth redacted in headers. |
| Errors | catch (error: unknown), message only in response | No stack/sensitive data to client; structured logger. |

---

## 3. inbound/[clinicSlug]/route.ts

| Area | Implementation | Quality / security |
|------|----------------|--------------------|
| Clinic resolution | By lifefileInboundPath (clinicSlug) | Explicit path → clinic; no credential guessing. |
| Basic Auth | verifyBasicAuth with timingSafeEqual | Constant-time comparison; length check before compare. |
| HMAC | verifyHmacSignature (optional when secret set) | Rejects if secret set but signature missing/invalid. |
| IP allowlist | isIpAllowed(clientIp, allowedIPs) | Optional; comma-separated list. |
| Body size | rawBody.length > MAX_WEBHOOK_BODY_BYTES → 413 | Applied after reading body. |
| JSON parse | Object check (reject null, non-object, array) | Same pattern as prescription-status. |
| Event type allowlist | allowedEvents.length > 0 → eventType must match | Configurable per clinic. |
| processShippingUpdate | extractLifefileOrderIdentifiers + buildOrderLookupWhere | Uses shared helpers; PatientShippingUpdate: clinicId, carrier required; status = mapToShippingStatusEnum; try/catch around create. |
| processPrescriptionStatus / processOrderStatus / processRxEvent | Same lookup helpers; OrderEvent note/eventType length caps | sanitizeEventType for eventType; note sliced to 200/500. |
| PHI in notifications | safeDecryptPHI for patient name | Decrypt for display only; no PHI in logger. |

---

## 4. lifefile-data-push/route.ts

| Area | Implementation | Quality / security |
|------|----------------|--------------------|
| Auth | findClinicByCredentials (same as prescription-status) | Allowlist username; password match per clinic. |
| Body size | rawBody.length > MAX_WEBHOOK_BODY_BYTES → 413 | Before parse. |
| XML path | parseXmlPayload; then object/array check | Ensures root is object for downstream use. |
| JSON path | Same object check as other routes | Reject null, non-object, array. |
| processRxEvent / processOrderStatus | extractLifefileOrderIdentifiers + buildOrderLookupWhere | OrderEvent: sanitizeEventType, note length cap; payload as object. |
| Errors | catch (error: unknown); log message/name only | No leaking stack or internal details. |

---

## 5. Cross-Cutting

- **No PHI in logs:** Logs use clinicId, orderId, referenceId, payloadKeys, timing; no patient names, emails, or identifiers in logger.
- **Idempotency:** Same webhook can be retried; order update and OrderEvent create are idempotent by outcome (last write wins). No duplicate key on WebhookLog for Lifefile (no eventId dedup in these handlers).
- **Input validation:** All order/reference IDs and event types pass through validation/limits; eventType and note are sanitized or length-capped before DB.
- **Clinic isolation:** Every order lookup is scoped by clinicId from auth or path.
- **Observability:** WebhookLog per request; processingTimeMs; structured logger with operation context.

---

## 6. Test Coverage

- **lifefile-payload.test.ts:** 30 tests for extractLifefileOrderIdentifiers (including edge cases and length limits), buildOrderLookupWhere, mapToShippingStatusEnum, sanitizeEventType, constants.
- **Route-level:** No automated route tests in this pass; manual/QA and WebhookLog inspection recommended. Future: integration tests with mocked Prisma for prescription-status and data-push.

---

## 7. Recommendations

1. **WebhookLog eventId:** If Lifefile sends a stable event/correlation ID, store it and dedupe (e.g. return 200 without re-processing) for true idempotency.
2. **Rate limiting:** Consider per-clinic or per-IP rate limits on webhook endpoints to reduce abuse/DoS.
3. **Alerting:** Monitor WebhookLog for status INVALID_AUTH, ERROR, or 413 and alert on spikes.
4. **Clinic type:** Replace `clinic: any` in findClinicByCredentials with a minimal interface (id, name, …) for type safety.
