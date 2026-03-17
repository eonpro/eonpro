import { Router } from 'expo-router';

const ROUTE_MAP: Record<string, string> = {
  '/patient-portal': '/(tabs)/home',
  '/portal': '/(tabs)/home',
  '/patient-portal/medications': '/(tabs)/meds',
  '/patient-portal/progress': '/(tabs)/health',
  '/patient-portal/chat': '/(tabs)/chat',
  '/patient-portal/appointments': '/appointments',
  '/patient-portal/shipments': '/(tabs)/meds',
  '/patient-portal/support': '/support',
  '/patient-portal/settings': '/settings',
  '/patient-portal/billing': '/billing',
  '/patient-portal/bloodwork': '/bloodwork',
  '/patient-portal/documents': '/documents',
  '/patient-portal/care-plan': '/care-plan',
  '/patient-portal/care-team': '/care-team',
  '/patient-portal/photos': '/photos',
  '/patient-portal/resources': '/resources',
  '/patient-portal/health-score': '/health-score',
  '/patient-portal/calculators': '/calculators',
};

export function resolveDeepLink(url: string): string | null {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;

    for (const [webPath, mobilePath] of Object.entries(ROUTE_MAP)) {
      if (path === webPath || path.startsWith(webPath + '/')) {
        return mobilePath;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function handleDeepLink(url: string, router: Router): boolean {
  const route = resolveDeepLink(url);
  if (route) {
    router.push(route as never);
    return true;
  }
  return false;
}
