import { ExpoConfig, ConfigContext } from 'expo/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';

interface ClinicConfig {
  clinicId: number;
  slug: string;
  appName: string;
  bundleIdentifier: string;
  scheme: string;
  icon: string;
  splash: string;
  apiBaseUrl: string;
  associatedDomain: string;
}

function loadClinicConfig(): ClinicConfig {
  const slug = process.env.CLINIC ?? 'eonpro';
  const configPath = resolve(__dirname, 'clinics', `${slug}.json`);
  const raw = readFileSync(configPath, 'utf-8');
  return JSON.parse(raw);
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const clinic = loadClinicConfig();

  return {
    ...config,
    name: clinic.appName,
    slug: clinic.slug,
    version: '1.0.0',
    orientation: 'portrait',
    icon: clinic.icon,
    scheme: clinic.scheme,
    userInterfaceStyle: 'automatic',
    splash: {
      image: clinic.splash,
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: clinic.bundleIdentifier,
      appleTeamId: 'N7VQSZKR76',
      config: {
        usesNonExemptEncryption: false,
      },
      infoPlist: {
        NSFaceIDUsageDescription: `${clinic.appName} uses Face ID for secure login.`,
        NSCameraUsageDescription: `${clinic.appName} needs camera access for progress photos and ID verification.`,
        NSPhotoLibraryUsageDescription: `${clinic.appName} needs photo library access to upload progress photos.`,
        NSHealthShareUsageDescription: `${clinic.appName} reads your health data to track your wellness progress.`,
        NSHealthUpdateUsageDescription: `${clinic.appName} writes weight data to keep your health records in sync.`,
      },
      associatedDomains: [`applinks:${clinic.associatedDomain}`],
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#ffffff',
        foregroundImage: './assets/images/android-icon-foreground.png',
      },
      package: clinic.bundleIdentifier,
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      [
        'expo-camera',
        {
          cameraPermission: `${clinic.appName} needs camera access for progress photos and ID verification.`,
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission: `${clinic.appName} needs photo library access to upload progress photos.`,
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/images/notification-icon.png',
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      clinicId: clinic.clinicId,
      clinicSlug: clinic.slug,
      apiBaseUrl: clinic.apiBaseUrl,
      associatedDomain: clinic.associatedDomain,
      eas: {
        projectId: process.env.EAS_PROJECT_ID ?? '',
      },
    },
  };
};
