/**
 * Browser Fingerprinting for Affiliate Attribution
 *
 * Creates a unique browser fingerprint for cross-session tracking.
 * HIPAA-safe: Only creates anonymous identifiers, no PHI.
 *
 * Note: For production, consider using FingerprintJS Pro for better accuracy.
 * This is a lightweight implementation that doesn't require external dependencies.
 */

interface FingerprintComponents {
  userAgent: string;
  language: string;
  colorDepth: number;
  screenResolution: string;
  timezone: string;
  sessionStorage: boolean;
  localStorage: boolean;
  indexedDb: boolean;
  cpuClass: string | undefined;
  platform: string;
  plugins: string;
  canvas: string;
  webgl: string;
  webglVendor: string;
  webglRenderer: string;
  hardwareConcurrency: number;
  deviceMemory: number | undefined;
  touchSupport: string;
  fonts: string;
}

/**
 * Generate a simple hash from a string
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Convert to hex string
  const hashStr = Math.abs(hash).toString(16);
  return hashStr.padStart(8, '0');
}

/**
 * SHA-256 hash (if crypto API available)
 */
async function sha256Hash(message: string): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    return simpleHash(message);
  }

  try {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return simpleHash(message);
  }
}

/**
 * Get canvas fingerprint
 */
function getCanvasFingerprint(): string {
  if (typeof document === 'undefined') return '';

  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    canvas.width = 200;
    canvas.height = 50;

    // Draw some text with specific font
    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial'";
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Cwm fjordbank glyphs vext quiz, 😃', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('Cwm fjordbank glyphs vext quiz, 😃', 4, 17);

    return canvas.toDataURL();
  } catch {
    return '';
  }
}

/**
 * Get WebGL fingerprint
 */
function getWebglFingerprint(): { vendor: string; renderer: string; fingerprint: string } {
  if (typeof document === 'undefined') {
    return { vendor: '', renderer: '', fingerprint: '' };
  }

  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl') ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

    if (!gl) {
      return { vendor: '', renderer: '', fingerprint: '' };
    }

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : '';
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';

    return {
      vendor,
      renderer,
      fingerprint: `${vendor}~${renderer}`,
    };
  } catch {
    return { vendor: '', renderer: '', fingerprint: '' };
  }
}

/**
 * Get installed plugins (for non-Chromium browsers)
 */
function getPlugins(): string {
  if (typeof navigator === 'undefined' || !navigator.plugins) return '';

  const plugins: string[] = [];
  for (let i = 0; i < navigator.plugins.length; i++) {
    const plugin = navigator.plugins[i];
    plugins.push(plugin.name);
  }

  return plugins.sort().join(',');
}

/**
 * Get touch support information
 */
function getTouchSupport(): string {
  if (typeof window === 'undefined') return 'unknown';

  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const touchEvent = 'ontouchstart' in window;

  return `${maxTouchPoints}:${touchEvent}`;
}

/**
 * Collect all fingerprint components
 */
function collectComponents(): FingerprintComponents {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      userAgent: '',
      language: '',
      colorDepth: 0,
      screenResolution: '',
      timezone: '',
      sessionStorage: false,
      localStorage: false,
      indexedDb: false,
      cpuClass: undefined,
      platform: '',
      plugins: '',
      canvas: '',
      webgl: '',
      webglVendor: '',
      webglRenderer: '',
      hardwareConcurrency: 0,
      deviceMemory: undefined,
      touchSupport: '',
      fonts: '',
    };
  }

  const webgl = getWebglFingerprint();

  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    colorDepth: screen.colorDepth,
    screenResolution: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    sessionStorage: !!window.sessionStorage,
    localStorage: !!window.localStorage,
    indexedDb: !!window.indexedDB,
    cpuClass: (navigator as any).cpuClass,
    platform: navigator.platform,
    plugins: getPlugins(),
    canvas: getCanvasFingerprint(),
    webgl: webgl.fingerprint,
    webglVendor: webgl.vendor,
    webglRenderer: webgl.renderer,
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    deviceMemory: (navigator as any).deviceMemory,
    touchSupport: getTouchSupport(),
    fonts: '', // Font detection is complex, skip for basic implementation
  };
}

/**
 * Generate a browser fingerprint
 */
export async function generateFingerprint(): Promise<{
  fingerprint: string;
  components: Partial<FingerprintComponents>;
}> {
  const components = collectComponents();

  // Create a string from all components
  const componentString = Object.entries(components)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}:${value}`)
    .join('|');

  // Hash the component string
  const fingerprint = await sha256Hash(componentString);

  return {
    fingerprint,
    components: {
      userAgent: components.userAgent,
      language: components.language,
      screenResolution: components.screenResolution,
      timezone: components.timezone,
      platform: components.platform,
      hardwareConcurrency: components.hardwareConcurrency,
    },
  };
}

/**
 * Get a stable visitor ID based on fingerprint
 * Falls back to localStorage if fingerprinting fails
 */
export async function getVisitorId(): Promise<string> {
  // Try localStorage first for consistency
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('aff_visitor_id');
    if (stored) return stored;
  }

  // Generate fingerprint
  try {
    const { fingerprint } = await generateFingerprint();

    // Store for consistency
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('aff_visitor_id', fingerprint);
    }

    return fingerprint;
  } catch {
    // Fallback: generate random ID
    const fallbackId = `fallback_${Date.now()}_${Math.random().toString(36).substring(2)}`;

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('aff_visitor_id', fallbackId);
    }

    return fallbackId;
  }
}

/**
 * Hash an IP address for privacy
 */
export async function hashIpAddress(ip: string): Promise<string> {
  // Add a salt for additional privacy
  const salt = 'aff_ip_salt_2024';
  return sha256Hash(`${salt}:${ip}`);
}
