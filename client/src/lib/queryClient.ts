import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(method: string, url: string, data?: any) {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  };

  if (data) {
    if (data instanceof FormData) {
      delete options.headers!['Content-Type']; // Let browser set it for FormData
      options.body = data;
    } else {
      options.body = JSON.stringify(data);
    }
  }

  const response = await fetch(url, options);

  // Check if we got an HTML response (likely Vite error page)
  const contentType = response.headers.get('content-type');
  const isHtml = contentType && contentType.includes('text/html');

  if (isHtml) {
    const htmlText = await response.text();
    // If it's an HTML error page from Vite, treat it as an error regardless of status code
    if (htmlText.includes('<!DOCTYPE html') || htmlText.includes('<html')) {
      throw new Error('Server returned HTML error page instead of JSON response');
    }
  }

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

    try {
      // Try to get JSON error message if available
      if (!isHtml) {
        const errorData = await response.json();
        if (errorData.message) {
          errorMessage = errorData.message;
        }
      }
    } catch {
      // If JSON parsing fails, use the default error message
    }

    throw new Error(errorMessage);
  }

  // Ensure we only try to parse JSON for non-HTML responses
  if (isHtml) {
    throw new Error('Expected JSON response but received HTML');
  }

  return response.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 2 * 60 * 1000, // 2 minutes default instead of Infinity
      retry: (failureCount, error) => {
        // Don't retry on 401/403 errors
        if (error?.status === 401 || error?.status === 403) {
          // Check if we need to redirect to login
          if (error?.redirectToLogin) {
            window.location.href = "/api/login";
          }
          return false;
        }
        return failureCount < 3;
      },
      // Add deduplication window
      cacheTime: 10 * 60 * 1000, // 10 minutes
    },
    mutations: {
      retry: (failureCount, error) => {
        // Handle session expiration for mutations too
        if (error?.status === 401 && error?.redirectToLogin) {
          window.location.href = "/api/login";
          return false;
        }
        return failureCount < 3;
      },
    },
  },
});