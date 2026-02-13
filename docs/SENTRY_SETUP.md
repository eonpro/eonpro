# Sentry Setup (Error Tracking & Performance)

Sentry is already integrated in the codebase. To **enable** it in production (and optionally in
preview/development), add the DSN and client DSN to your environment.

---

## 1. Create a Sentry project (if you don’t have one)

1. Go to [sentry.io](https://sentry.io) and sign in or create an account.
2. Create an **organization** (or use an existing one).
3. **Add project** → choose **Next.js**.
4. Name it (e.g. `eonpro` or `eonpro-production`).
5. After creation, Sentry shows a **DSN** (e.g.
   `https://abc123@o123456.ingest.us.sentry.io/1234567`). Copy it.

---

## 2. Set environment variables

### Required to enable Sentry

| Variable                 | Where                                  | Description                                                                          |
| ------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------ |
| `SENTRY_DSN`             | Server (API routes, server components) | DSN from Sentry project settings.                                                    |
| `NEXT_PUBLIC_SENTRY_DSN` | Client (browser)                       | **Same DSN** – must be prefixed with `NEXT_PUBLIC_` so the client bundle can use it. |

Use the **same** DSN for both; Sentry accepts server and client events on one project.

### Optional (for source maps and releases)

| Variable            | Description                                                                    |
| ------------------- | ------------------------------------------------------------------------------ |
| `SENTRY_ORG`        | Sentry org slug (e.g. from URL: `sentry.io/organizations/my-org/`)             |
| `SENTRY_PROJECT`    | Project slug (e.g. `eonpro`)                                                   |
| `SENTRY_AUTH_TOKEN` | Auth token from Sentry: **Settings → Auth Tokens** (scope: `project:releases`) |

With these set, `@sentry/nextjs` can upload source maps on build so stack traces show your source
code.

---

## 3. Where to set them

### Vercel (production / preview)

1. **Vercel Dashboard** → your project → **Settings** → **Environment Variables**.
2. Add:
   - `SENTRY_DSN` = your DSN (e.g. `https://xxx@o123.ingest.us.sentry.io/123`)
   - `NEXT_PUBLIC_SENTRY_DSN` = same DSN
3. Choose **Production** (and optionally **Preview**) so all deployed envs report to Sentry.
4. Redeploy so the new variables are applied.

### Local (.env or .env.local)

```bash
SENTRY_DSN="https://xxx@o123.ingest.us.sentry.io/123"
NEXT_PUBLIC_SENTRY_DSN="https://xxx@o123.ingest.us.sentry.io/123"
```

- With these set, **server** and **client** errors in development will be sent (unless you filter
  them in Sentry config).
- The server config uses `beforeSend` to drop events in non-production unless `SENTRY_DEBUG=1`. The
  client config drops events unless `NEXT_PUBLIC_SENTRY_DEBUG=true`. So by default, local events are
  not sent unless you opt in.

---

## 4. Verify it’s working

1. Deploy with `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` set.
2. Trigger an error (e.g. hit a route that throws, or use Sentry’s “Test” button in **Project
   Settings → Client Keys (DSN)**).
3. In Sentry, open **Issues** (or **Performance**). You should see the event.

---

## 5. Verify with the test page

The app includes a verification page at **`/sentry-example-page`**.

1. Set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` (see step 2).
2. Start the dev server (`npm run dev`) or deploy.
3. Open **`/sentry-example-page`** and click **Trigger client error** or **Send via
   captureException**.
4. In Sentry, go to **Issues**. You should see the test error. If so, the SDK is working.

---

## 6. What’s already configured

- **Server:** `sentry.server.config.ts` – Prisma integration, HTTP breadcrumbs, `beforeSend` to
  strip auth headers and sensitive body fields, no PHI.
- **Client:** `sentry.client.config.ts` – Browser tracing, Replay (with input masking for HIPAA),
  `beforeSend` to strip auth and mask user data.
- **Edge:** `sentry.edge.config.ts` – Edge runtime tracing.
- **Next.js:** `next.config.js` wraps the build with Sentry when `SENTRY_DSN` or
  `NEXT_PUBLIC_SENTRY_DSN` is set.
- **Tunnel:** `tunnelRoute: '/api/sentry'` – Client events are proxied through your domain to
  Sentry, which fixes CORS errors and bypasses ad-blockers.
- **Login route:** Login 500s are reported with `Sentry.captureException` and safe context (route,
  step, duration; no PHI).

See [OBSERVABILITY.md](./OBSERVABILITY.md) for how to use `captureException`, `captureMessage`, and
custom metrics in your code.

---

## 7. Quick checklist

- [ ] Create (or select) a Sentry project and copy the DSN.
- [ ] Add `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` in Vercel for Production (and Preview if
      desired).
- [ ] Redeploy.
- [ ] Visit `/sentry-example-page` and trigger a test error; confirm it appears in Sentry Issues.
- [ ] (Optional) Add `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` for source map uploads.

---

## 8. Troubleshooting

### CORS or 404 when sending to Sentry ingest

**Symptoms:** Console shows `Access to fetch at '...ingest.us.sentry.io...' has been blocked by CORS policy` or `404 (Not Found)`.

**Cause:** The DSN may be invalid (deleted project, wrong project ID) or ad-blockers blocked the request.

**What we did:** The app uses a **tunnel** (`/api/sentry`) so the browser sends events to your domain instead of Sentry directly. This eliminates CORS and ad-blocker issues.

**If you still get 404 after deploying:** Verify the DSN in [Sentry → Project Settings → Client Keys (DSN)](https://sentry.io). Copy the current DSN and update `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN` in Vercel, then redeploy.
