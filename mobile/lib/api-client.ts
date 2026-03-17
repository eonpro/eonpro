import { appConfig } from './config';
import { tokenStorage } from './auth';

const TIMEOUT_MS = 30_000;

export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please log in again.';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isSessionExpired() {
    return this.status === 401 || this.status === 403;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit & { parseJson?: boolean }
): Promise<T> {
  const token = await tokenStorage.getAccessToken();
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const userSignal = init?.signal;
  if (userSignal) {
    const onAbort = () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
    userSignal.addEventListener('abort', onAbort);
  }

  const url = path.startsWith('http')
    ? path
    : `${appConfig.apiBaseUrl}${path}`;

  try {
    const response = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        return apiFetch(path, init);
      }
      throw new ApiError(SESSION_EXPIRED_MESSAGE, response.status);
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new ApiError(
        body?.error || body?.message || `Request failed (${response.status})`,
        response.status,
        body
      );
    }

    if (init?.parseJson === false) {
      return response as unknown as T;
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const refreshToken = await tokenStorage.getRefreshToken();
      if (!refreshToken) return false;

      const response = await fetch(
        `${appConfig.apiBaseUrl}/api/auth/refresh-token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        }
      );

      if (!response.ok) return false;

      const data = await response.json();
      if (data.token) {
        await tokenStorage.setTokens(data.token, data.refreshToken ?? refreshToken);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}
