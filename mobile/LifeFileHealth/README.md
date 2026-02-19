# LifeFile Health — Companion App

Lightweight React Native app that syncs Apple Health (HealthKit) data to the
LifeFile platform via the Terra SDK. Data flows through the same webhook
pipeline used for web-connected devices (Fitbit, Garmin, etc.).

## Why a native app?

Apple HealthKit has no web API — a native iOS app is required to read HealthKit
data. This companion app's sole purpose is:

1. Authenticate the patient (same login as the web portal)
2. Connect to Apple Health via Terra's React Native SDK
3. Run background sync — Terra SDK handles all HealthKit permissions,
   background delivery, and data upload

## Setup

```bash
cd mobile/LifeFileHealth
npm install
cd ios && pod install && cd ..

# Replace TERRA_DEV_ID in src/screens/HomeScreen.tsx
# with your actual Terra developer ID

npm run ios
```

## Environment

- Update `API_BASE` in `src/services/auth.ts` and `src/services/terra.ts`
  to point to your backend URL.
- Ensure the backend has `TERRA_API_KEY`, `TERRA_DEV_ID`, and
  `TERRA_WEBHOOK_SECRET` configured.

## Data Flow

```
Apple Health → Terra SDK → Terra Cloud → Webhook → /api/webhooks/terra → DB
```

The webhook handler (`src/app/api/webhooks/terra/route.ts` in the main project)
processes incoming data identically regardless of whether it came from a
web-connected device or Apple Health via this companion app.

## iOS Permissions

The app requires the following HealthKit entitlements in `ios/`:

- `com.apple.developer.healthkit`
- `com.apple.developer.healthkit.background-delivery`

Add an `NSHealthShareUsageDescription` key to `Info.plist` explaining why
health data is needed.

## App Store Notes

- The app must be submitted with a valid HealthKit usage description
- Apple requires real HealthKit functionality (no stubs) for approval
- Background delivery must be properly configured in Xcode capabilities
