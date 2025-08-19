
import { useQuery, UseQueryOptions } from "@tanstack/react-query";

export interface StandardQueryOptions<T> extends Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'> {
  retry?: boolean;
}

export function useStandardQuery<T>(
  queryKey: string[],
  queryFn: () => Promise<T>,
  options: StandardQueryOptions<T> = {}
) {
  return useQuery<T, Error>({
    queryKey,
    queryFn,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options
  });
}
