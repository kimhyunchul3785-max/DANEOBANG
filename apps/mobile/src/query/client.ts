import { QueryClient } from "@tanstack/react-query";
import { DaneobangApiError } from "@daneobang/api-client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (count, err) => (err instanceof DaneobangApiError && !err.retryable && err.status !== 0 ? false : count < 2),
      refetchOnWindowFocus: false,
    },
  },
});
