# EonPro Patient Portal — Mobile App

Native iPhone app for the patient portal, built with Expo (React Native). Each clinic gets its own branded App Store listing via EAS Build profiles.

## Architecture

- **Framework**: Expo SDK 55, React Native 0.83, Expo Router v55
- **Styling**: NativeWind (Tailwind CSS for RN)
- **Data**: TanStack React Query with AsyncStorage persistence (24hr offline cache)
- **Auth**: JWT Bearer tokens stored in iOS Keychain via expo-secure-store
- **Biometrics**: Face ID / Touch ID via expo-local-authentication
- **Real-time**: Socket.IO client with polling fallback
- **Push**: APNS via expo-notifications
- **White-label**: Per-clinic build configs in `clinics/` + dynamic `app.config.ts`

## Quick Start

```bash
cd mobile
npm install
npm run sync-types   # Copy shared types from web app
npx expo start       # Start dev server
```

Scan the QR code with Expo Go, or press `i` for iOS simulator.

## Project Structure

```
mobile/
├── app/                    # Expo Router file-based routes (33 screens)
│   ├── (auth)/             # Login + Face ID
│   ├── (tabs)/             # 5-tab navigation (home, health, meds, chat, more)
│   ├── appointments/       # Booking flow
│   ├── billing/            # Stripe integration
│   ├── bloodwork/          # Lab results
│   ├── calculators/        # BMI, calories, macros
│   ├── care-plan/          # Goals + activities
│   ├── care-team/          # Provider directory
│   ├── documents/          # Upload + list
│   ├── health-score/       # Score breakdown
│   ├── injection-tracker/  # Client-side log
│   ├── notifications/      # Notification center
│   ├── photos/             # Camera + gallery upload
│   ├── refill/             # Early refill requests
│   ├── resources/          # Clinic videos/articles
│   ├── settings/           # Profile, Face ID, prefs
│   ├── shipment/           # Tracking timeline
│   └── support/            # Tickets + comments
├── clinics/                # Per-clinic build configs
│   ├── eonpro.json         # Default
│   ├── wellmedr.json
│   ├── otmeds.json
│   └── eonmeds.json
├── components/             # Providers + UI components
├── hooks/                  # usePortalQuery
├── lib/                    # API client, auth, branding, socket, offline
├── shared/                 # Auto-synced types from web app
└── scripts/                # sync-shared-types
```

## White-Label Builds

Each clinic gets its own app with unique name, icon, and bundle ID.

### Build a specific clinic

```bash
# Development build
CLINIC=wellmedr npx expo start

# EAS Build for App Store
eas build --platform ios --profile wellmedr

# Submit to App Store
eas submit --platform ios --profile wellmedr
```

### Add a new clinic

1. Create `clinics/{slug}.json`:
   ```json
   {
     "clinicId": 7,
     "slug": "newclinic",
     "appName": "NewClinic Health",
     "bundleIdentifier": "com.eonpro.newclinic",
     "scheme": "newclinic",
     "icon": "./clinics/assets/newclinic/icon.png",
     "splash": "./clinics/assets/newclinic/splash.png",
     "apiBaseUrl": "https://newclinic.eonpro.io",
     "associatedDomain": "newclinic.eonpro.io"
   }
   ```

2. Add icon (1024x1024) and splash to `clinics/assets/newclinic/`

3. Add EAS build profile to `eas.json`:
   ```json
   "newclinic": {
     "extends": "production",
     "env": { "CLINIC": "newclinic" }
   }
   ```

4. Build and submit:
   ```bash
   eas build --platform ios --profile newclinic
   eas submit --platform ios --profile newclinic
   ```

## Syncing Types

The mobile app shares TypeScript types with the web app via a copy script:

```bash
npm run sync-types
```

This copies `models.ts`, `prisma-enums.ts`, `schemas.ts`, and constants from `../src/` into `mobile/shared/`. Commit the result.

## Key Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo dev server |
| `npm run ios` | Start on iOS simulator |
| `npm run sync-types` | Copy types from web app |
| `npm run typecheck` | Run TypeScript check |
| `npm run build:dev` | EAS development build |
| `npm run build:prod` | EAS production build |

## Offline Support

- **Read**: React Query cache persisted to AsyncStorage (24hr TTL)
- **Write**: Failed mutations queued in AsyncStorage, replayed on reconnect
- **UI**: Yellow offline banner when network unavailable

## Backend Dependencies

The mobile app consumes the **existing** web app APIs. No backend modifications required for core functionality. Optional additive endpoints:

| Feature | New Backend File | Purpose |
|---------|-----------------|---------|
| APNS Push | `src/lib/push-notifications/apns-sender.ts` | Server-side APNS sending |
| HealthKit | `src/app/api/patient-portal/health-data/sync/route.ts` | Batch health data sync |
| App Config | `src/app/api/patient-portal/app-config/route.ts` | Min version enforcement |
| Deep Links | `public/.well-known/apple-app-site-association` | Universal links |

## App Store Checklist

- [ ] Apple Developer account
- [ ] App icons per clinic (1024x1024)
- [ ] Screenshots (6.7", 6.5", 5.5")
- [ ] Privacy policy URL
- [ ] HealthKit usage justification
- [ ] Camera/Photo Library usage descriptions (in app.config.ts)
- [ ] Face ID usage description (in app.config.ts)
- [ ] `ITSAppUsesNonExemptEncryption: NO` (in app.config.ts)
- [ ] Age rating: 17+ (medical)
- [ ] TestFlight beta testing
