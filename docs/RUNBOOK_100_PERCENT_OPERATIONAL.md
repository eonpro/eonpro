# Runbook: Get to 100% Operational

Two items must be verified or fixed in your environment so the platform is fully operational:

1. **Lifefile tracking in production** – confirm webhooks are received and orders are updated.
2. **Documents 500** – if the Documents tab still returns 500, use the error message to fix it.

Use this runbook step-by-step. Replace placeholders like `YOUR_DOMAIN`, `YOUR_TOKEN`, and `2695` with your real values.

---

# Part 1: Verify Lifefile Tracking in Production

## 1.1 Confirm which webhook URL Lifefile is using

Lifefile must call one of these (with HTTPS in production):

| Endpoint | When to use |
|----------|-------------|
| `https://YOUR_DOMAIN/api/webhooks/lifefile/prescription-status` | Single global endpoint; clinic identified by Basic Auth **password** (first matching clinic wins). |
| `https://YOUR_DOMAIN/api/webhooks/lifefile/inbound/SLUG` | Per-clinic; `SLUG` = clinic’s **Inbound Path** (e.g. `wellmedr`). Clinic is identified by URL path. |
| `https://YOUR_DOMAIN/api/webhooks/lifefile-data-push` | Same auth model as prescription-status (password match). |

**What to do:**

- Ask Lifefile (or check their dashboard) which **exact URL** they have configured.
- In your app, open **Super Admin → Clinics → [clinic] → Pharmacy / Inbound Webhook** and note:
  - **Inbound Webhook URL** (if using inbound):  
    `https://YOUR_DOMAIN/api/webhooks/lifefile/inbound/{Inbound Path}`
  - **Inbound Path** value (e.g. `wellmedr`).

They must call the **same** URL you expect (prescription-status, inbound, or data-push). If they use a different path or domain, fix it on their side or add that URL to your config.

---

## 1.2 Check that webhooks are reaching the app (WebhookLog)

Every request to those endpoints is logged in the **WebhookLog** table.

**Option A – Database**

Run in your DB (production or a copy):

```sql
SELECT id, "createdAt", endpoint, status, "statusCode", "errorMessage",
       "responseData"::text, "clinicId"
FROM "WebhookLog"
WHERE endpoint LIKE '%lifefile%'
ORDER BY "createdAt" DESC
LIMIT 20;
```

**Option B – Admin UI (if you have a webhook monitor)**

Open the page that lists recent webhooks and filter by “lifefile” or the endpoint path.

**What to look for:**

- **Rows present:** Lifefile is calling your app. Note `endpoint`, `status`, `statusCode`, `errorMessage`, `responseData`.
- **No rows:** Either Lifefile is not calling this app, or they’re using a different URL. Go back to 1.1 and align the URL.
- **statusCode 401:** Auth failed. Go to **1.3**.
- **statusCode 200 and responseData like `processed: true`:** Webhook succeeded. Go to **1.4** to confirm the order was updated.
- **statusCode 200/202 and responseData like `processed: false` or `Order not found`:** Request accepted but order not found. Go to **1.4** (order IDs).

---

## 1.3 Fix webhook authentication (if you see 401 or “Invalid password”)

**Prescription-status and data-push**

- Auth: **Basic**. Username must be one of: `wellmedr_shipping`, `lifefile_webhook`, `lifefile_datapush`. **Password** must match the **decrypted** Inbound Webhook password for a clinic that has **Inbound Webhook** enabled.
- In **Super Admin → Clinics → [clinic] → Pharmacy / Inbound Webhook**:
  - Turn on **Inbound Webhook** (or equivalent).
  - Set **Username** (optional for these two endpoints) and **Password**.
  - Give Lifefile the **exact** username and password (they send Basic Auth with every request).
- If multiple clinics share the same password, the **first** matching clinic is used. Prefer one password per clinic or use the **inbound** endpoint (1.1) so the clinic is determined by the URL path.

**Inbound** (`/api/webhooks/lifefile/inbound/SLUG`)

- Auth: **Basic**. Username and password must match that clinic’s **Inbound** username/password (the one for path `SLUG`).
- If **HMAC secret** is set, Lifefile must send the signature header (`x-webhook-signature` or `x-lifefile-signature`). If they don’t, you get 401. Either:
  - Have Lifefile send the header, or
  - Clear the HMAC secret for that clinic so verification is skipped.

**Quick test (after fixing credentials):**

```bash
# Replace USERNAME, PASSWORD, and URL with the endpoint Lifefile uses
curl -s -w "\nHTTP:%{http_code}" -X POST \
  -u "USERNAME:PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"orderId":"TEST","referenceId":"REF-TEST","status":"shipped"}' \
  "https://YOUR_DOMAIN/api/webhooks/lifefile/prescription-status"
```

You should get HTTP 200 or 202 (and likely “Order not found” in body if TEST doesn’t exist). HTTP 401 = auth still wrong.

---

## 1.4 Align order IDs (fix “Order not found”)

If WebhookLog shows **200/202** but **`processed: false`** or **“Order not found”**, the order lookup is failing: our DB has no order with that `orderId`/`referenceId` for that clinic.

**Step 1 – See what we store when we send an order to Lifefile**

When a prescription is approved and sent to Lifefile, we save their order ID on our order:

- Table: **Order**
- Columns: **lifefileOrderId**, **referenceId**
- Both are used to find the order when Lifefile sends a tracking update.

**Step 2 – See what Lifefile sends**

From WebhookLog, open a recent row and look at **payload** (or the stored request body). Find the field they use as “order id” (e.g. `orderId`, `order_id`, or inside `order.orderId`). Note the **exact** value (string or number).

**Step 3 – Compare**

Run (replace clinic id and patient id if needed):

```sql
SELECT id, "lifefileOrderId", "referenceId", "patientId", "clinicId", status, "trackingNumber"
FROM "Order"
WHERE "clinicId" = YOUR_CLINIC_ID
  AND ("lifefileOrderId" IS NOT NULL OR "referenceId" IS NOT NULL)
ORDER BY "createdAt" DESC
LIMIT 10;
```

- If **lifefileOrderId** (or **referenceId**) in the DB **matches** what Lifefile sends (same string/number), the next webhook should find the order. If it still doesn’t, check **clinicId**: the webhook must resolve to the **same** clinic (1.3).
- If they **don’t match** (e.g. we store `"12345"` but they send `"LF-12345"`), then either:
  - Change how we save **lifefileOrderId** when we send the order (so we store what they will send back), or
  - Have Lifefile send the same format we store.

After fixing URL, auth, or IDs, trigger a new tracking update (or wait for the next one) and check WebhookLog again for **processed: true** and the Orders page for the updated order.

---

## 1.5 Confirm on the Orders page

- Log in as **Admin** (or user with Orders access).
- Open **Orders** (“Prescriptions with active tracking”).
- You should see orders that have **tracking number** and, if applicable, **Lifefile** badge.
- If an order was just updated by the webhook, it should appear with the new status/tracking (refresh if needed).

---

# Part 2: Fix Documents 500

If the **Documents** tab for a patient still returns **500**, follow this.

## 2.1 Get the error message

**A – From the browser**

1. Open the patient’s **Documents** tab so the 500 occurs.
2. Open **DevTools (F12) → Network**.
3. Reload or switch to the tab again.
4. Click the failed request whose path is **`documents`** (e.g. `/api/patients/2695/documents`).
5. Open **Response** (or **Preview**). You should see JSON with an **`error`** field. Copy that **exact** message.

If the response is **HTML** or **empty**, the 500 is likely from a layer **before** the documents route (e.g. auth middleware or Next.js). In that case use server logs (B) or your host’s error dashboard.

**B – From the server**

- In your logging system (e.g. Vercel logs, CloudWatch, or app logs), search for:
  - `GET /api/patients/[id]/documents`, or
  - `handleApiError`, or
  - the route name and **patientId** (e.g. 2695).
- Use the logged **error** message (and stack trace if needed).

**C – With curl (if you have a Bearer token)**

```bash
curl -s -w "\nHTTP_CODE:%{http_code}" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  "https://YOUR_DOMAIN/api/patients/2695/documents"
```

Replace `YOUR_TOKEN` and `2695`. The response body should be JSON with **`error`**; the last line is the HTTP code.

---

## 2.2 Match the error to a fix

Use the **exact** wording (or key phrases) from the `error` message:

| If the error says… | What to do |
|--------------------|------------|
| **Can't reach database** / **Connection** / **ECONNREFUSED** / **connect ETIMEDOUT** | Check **DATABASE_URL** (and **DIRECT_DATABASE_URL** if used) in the deploy environment. Ensure the app can reach the DB (network, firewall, VPC). Test from the same environment (e.g. Vercel serverless) if possible. |
| **relation "PatientDocument" does not exist** / **Table 'PatientDocument' does not exist** | Schema not applied. In the **deploy** environment run: `npx prisma migrate deploy` (or `npm run db:migrate`). Ensure your deploy pipeline runs migrations (e.g. in `vercel-build` or a pre-deploy step). |
| **Unknown arg** / **Invalid prisma.patientDocument** / **Invalid `prisma.xxx.create()`** | Prisma schema and DB are out of sync. Run `npx prisma generate` and `npx prisma migrate deploy` from the same codebase that’s deployed. Don’t use `db push` in production. |
| **JWT** / **token** / **Authentication** / **Unauthorized** (and you get 500, not 401) | Auth middleware may be throwing. Check **JWT_SECRET** (or equivalent) is set in the deploy environment. Check server logs for the full exception (e.g. “JWT_SECRET is not defined”). |
| **Patient not found** | You should normally get **404**, not 500. If you see 500 with this message, check the route and middleware for a bug. |
| **Access denied** / **Patient not in your clinic** | You should normally get **403**. Same as above; if 500, check route/middleware. |

If the message doesn’t match any row, search the FIX doc for a phrase from the message or treat it as a generic **DB/connectivity** or **auth** issue and check env vars and migrations.

---

## 2.3 Apply the fix and verify

- **DB:** Fix env vars or run migrations as above. Redeploy if needed.
- **Auth:** Set the correct env vars (e.g. **JWT_SECRET**). Redeploy. For **patient** users, ensure the JWT includes **patientId** (see FIX doc “Auth checklist”).
- Then:
  1. Open the same patient’s **Documents** tab again. It should load (list or empty).
  2. Optionally call the API again with curl; you should get **HTTP 200** and a JSON array.

---

# Checklist summary

**Lifefile**

- [ ] Lifefile’s webhook URL matches one of our three endpoints (1.1).
- [ ] WebhookLog shows recent rows for that endpoint (1.2).
- [ ] No 401; if 401, fix Basic Auth (and HMAC for inbound) (1.3).
- [ ] If “Order not found”, DB **lifefileOrderId** / **referenceId** match what Lifefile sends (1.4).
- [ ] Orders page shows the expected orders with tracking (1.5).

**Documents**

- [ ] Error message captured from response or logs (2.1).
- [ ] Fix applied from the table (2.2).
- [ ] Documents tab (and optional curl) return 200 (2.3).

When all items are done, you’re at **100% operational** for these two areas.
