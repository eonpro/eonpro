import Constants from 'expo-constants';

interface AppConfig {
  clinicId: number;
  clinicSlug: string;
  apiBaseUrl: string;
  associatedDomain: string;
}

function getConfig(): AppConfig {
  const extra = Constants.expoConfig?.extra;
  if (!extra) {
    throw new Error('Missing expo config extra — is app.config.ts loaded?');
  }
  const config = {
    clinicId: extra.clinicId,
    clinicSlug: extra.clinicSlug,
    apiBaseUrl: extra.apiBaseUrl,
    associatedDomain: extra.associatedDomain,
  };
  console.log('[AppConfig]', JSON.stringify(config));
  return config;
}

export const appConfig = getConfig();
