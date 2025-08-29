import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const isFormData = data instanceof FormData;

  const res = await fetch(url, {
    method,
    headers: data && !isFormData ? { "Content-Type": "application/json" } : {},
    body: isFormData ? data : data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
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

// Mock implementations for analyzeErrorResponse and debugHtmlError for demonstration
// In a real scenario, these would be imported from './errorUtils'
const analyzeErrorResponse = (res: Response, htmlContent: string) => {
  // Basic parsing of HTML for a simplified error message
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  const titleElement = doc.querySelector('title');
  const bodyElement = doc.querySelector('body');

  let errorMessage = `An unexpected HTML error occurred. Status: ${res.status}`;
  if (titleElement && titleElement.textContent) {
    errorMessage = titleElement.textContent.trim();
  } else if (bodyElement && bodyElement.textContent) {
    // Fallback to body text if no title
    errorMessage = bodyElement.textContent.trim().split('\n')[0]; // Take the first line
  }
  return { errorMessage, htmlContent };
};

const debugHtmlError = (htmlContent: string, url: string) => {
  console.log(`Opening HTML error for URL: ${url} in a new tab.`);
  const newTab = window.open('', '_blank');
  if (newTab) {
    newTab.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>HTML Error Debug</title>
        <style>
          body { font-family: sans-serif; margin: 20px; }
          pre { background-color: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
        </style>
      </head>
      <body>
        <h1>HTML Error Response</h1>
        <p><strong>URL:</strong> ${url}</p>
        <p><strong>Content:</strong></p>
        <pre><code>${htmlContent}</code></pre>
      </body>
      </html>
    `);
    newTab.document.close();
  } else {
    console.error('Failed to open new tab for debugging. Please allow pop-ups.');
  }
};


export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const res = await fetch(queryKey[0] as string, {
          credentials: "include",
        });

        if (!res.ok) {
          const contentType = res.headers.get('content-type') || '';

          if (contentType.includes('text/html')) {
            const htmlContent = await res.text();
            // Assuming analyzeErrorResponse and debugHtmlError are available in the scope or imported
            const analysis = analyzeErrorResponse(res, htmlContent);

            // Log detailed error analysis
            console.error('🚨 HTML Error Response Detected:', {
              url: queryKey[0],
              status: res.status,
              analysis
            });

            // Open debug window in development
            if (process.env.NODE_ENV === 'development') {
              debugHtmlError(htmlContent, queryKey[0] as string);
            }

            throw new Error(`${analysis.errorMessage} (Status: ${res.status})`);
          }

          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        return await res.json();
      },
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