# Vercel: Changes Not Deploying & Patient Portal Not Saving

**Last updated:** February 7, 2026

This doc covers two related issues:

1. **New deployments happen but the live site doesn’t seem to include your latest code.**
2. **Patient portal data (weight, progress, etc.) is not saving in production.**

---

## 1. Why your changes might not appear on Vercel

### A. Build or browser cache

- **Vercel:** The project may be using a cached build. New “deployments” can reuse cache and not
  pick up code changes.
- **Browser:** The browser may be serving old JS/CSS.

**What to do:**

1. **Force a clean deploy (recommended)**
   - Vercel Dashboard → your project → **Deployments** → **⋯** on latest → **Redeploy** → check
     **“Clear build cache and redeploy”** → Redeploy.
   - Or from repo: push an empty commit to `main`:  
     `git commit --allow-empty -m "chore: force redeploy" && git push origin main`
2. **Confirm which code is live**
   - Open `https://<your-domain>/api/health` in the browser. The response includes `commit` (and
     optionally `buildId`) when running on Vercel. Compare `commit` to the latest commit SHA on
     `main` in GitHub. If they differ, the production domain is not serving the latest deployment.
3. **Hard refresh when testing**
   - Use **Cmd+Shift+R** (Mac) or **Ctrl+Shift+R** (Windows/Linux), or open the site in an
     incognito/private window.

### B. Production domain not pointing at the latest deployment

- If you use **Git integration** and also deploy via **GitHub Actions** (e.g.
  `vercel deploy --prebuilt --prod`), you can have two production builds per push. The
  **Production** domain is attached to one of them in Vercel.
- If the domain is still assigned to an older deployment, you’ll see new deployments in the list but
  the live site won’t change.

**What to do:**

1. Vercel Dashboard → **Deployments** → find the deployment that matches your latest `main` commit
   (use the commit message or SHA).
2. If that deployment is **not** the one with the production domain, open it → **⋯** → **Promote to
   Production** (or assign the production domain to this deployment, depending on your Vercel UI).
3. Ensure the project’s **Production Branch** is `main` (Settings → Git).

### C. GitHub Actions deploy not updating the production URL

- The workflow runs `vercel deploy --prebuilt --prod`, which creates a new production deployment.
  That deployment **should** become the active production deployment for the project.
- If your production URL is a **custom domain** (e.g. `app.eonpro.io`), it should still point at
  “current production” for that project. If you have multiple Vercel projects or use preview URLs
  only, make sure you’re opening the URL that is actually set as **Production** in the project.

**What to do:**

- In Vercel → **Settings** → **Domains**, confirm which domain is **Production**.
- After a deploy from `main`, wait 1–2 minutes, then open `https://<production-domain>/api/health`
  and check the `commit` value.

---

## 2. Why patient portal might not be saving in production

Saving uses the same APIs as locally (e.g. `POST /api/patient-progress/weight`). If it works locally
but not on Vercel, the usual cause is **auth or environment**.

### A. 401 Unauthorized (most likely)

- The portal sends `Authorization: Bearer <token>` and `credentials: 'include'`. If the API returns
  **401**, the request is rejected and nothing is saved.
- **Common cause:** `JWT_SECRET` in Vercel **Production** env is missing or different from the one
  used when the token was issued (e.g. from another env or local). Tokens then fail verification and
  every authenticated API returns 401.

**What to do:**

1. **Confirm JWT_SECRET in Vercel**
   - Vercel Dashboard → Project → **Settings** → **Environment Variables**.
   - Ensure `JWT_SECRET` exists for **Production** and is the same value used wherever the patient
     logs in (e.g. same app or same auth provider).
   - If you changed it, existing tokens are invalid until users log in again.
2. **Confirm token is sent**
   - In the browser: Patient portal → open DevTools → **Network**. Log weight (or any action that
     should save). Click the request to the API (e.g. `patient-progress/weight`).
   - In **Request Headers** you should see `Authorization: Bearer <long-string>`. If it’s missing,
     the frontend is not sending the token (e.g. token not in `localStorage` or not read correctly).
3. **Check response status**
   - If the request shows **401**, the server is rejecting the token (wrong/missing `JWT_SECRET` or
     expired/invalid token). Fix env and/or have the user log in again.

### B. 403 Forbidden

- User is authenticated but not allowed to access that patient (e.g. `patientId` in the request
  doesn’t match the logged-in patient).
- Fix: ensure the portal uses the correct `patientId` (from `/api/auth/me` or `user.patientId` in
  localStorage).

### C. 500 or network error

- Check Vercel **Functions** (or **Logs**) for the time of the request.
- Typical causes: **DATABASE_URL** (or **DIRECT_DATABASE_URL**) missing/wrong for Production, or a
  runtime error in the API.
- Also open `https://<production-domain>/api/health` and confirm the response is healthy and DB is
  OK.

---

## 3. Quick checklist

| Step | Action                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Redeploy with **“Clear build cache and redeploy”** (or push empty commit to `main`).                                           |
| 2    | Open `https://<production-domain>/api/health` and verify `commit` matches latest `main`.                                       |
| 3    | Hard refresh (or incognito) when testing the UI.                                                                               |
| 4    | In Vercel, ensure **Production** env has `JWT_SECRET` and `DATABASE_URL` (and any DB URL your app uses).                       |
| 5    | In browser DevTools → Network, confirm patient portal API requests send `Authorization: Bearer ...` and check for 401/403/500. |
| 6    | If 401 after deploy, have the user **log out and log in again** so a new token is issued with the current `JWT_SECRET`.        |

---

## 4. Verifying which code is live

- **GET** `https://<your-production-domain>/api/health` (no query params) returns a minimal JSON
  response.
- When running on Vercel, the response includes:
  - **`commit`** – Git commit SHA of the deployed build (e.g. `abc1234`). Compare with
    `git log -1 --format=%h main` on your repo.
  - **`buildId`** (if set) – Vercel build identifier.
- If `commit` is missing or different from the latest `main`, the production domain is not serving
  the latest deployment; use the steps in section 1 to fix it.
