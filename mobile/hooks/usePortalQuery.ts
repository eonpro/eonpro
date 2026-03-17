import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';

export function usePortalQuery<T = unknown>(
  key: string[],
  path: string,
  options?: Omit<UseQueryOptions<T, ApiError>, 'queryKey' | 'queryFn'>
) {
  return useQuery<T, ApiError>({
    queryKey: key,
    queryFn: () => apiFetch<T>(path),
    ...options,
  });
}
