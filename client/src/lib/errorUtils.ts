
export interface ErrorAnalysis {
  isHtmlError: boolean;
  title?: string;
  errorMessage?: string;
  statusCode?: number;
  suggestions: string[];
}

export function analyzeErrorResponse(response: Response, data: any): ErrorAnalysis {
  const contentType = response.headers.get('content-type') || '';
  const isHtmlError = contentType.includes('text/html') && !response.ok;
  
  if (!isHtmlError) {
    return {
      isHtmlError: false,
      suggestions: []
    };
  }

  // Parse HTML error page
  const parser = new DOMParser();
  const doc = parser.parseFromString(data, 'text/html');
  
  const title = doc.querySelector('title')?.textContent || 'Unknown Error';
  const h1 = doc.querySelector('h1')?.textContent;
  const errorDivs = Array.from(doc.querySelectorAll('p, div, .error, .message'))
    .map(el => el.textContent?.trim())
    .filter(text => text && text.length > 10);
  
  const errorMessage = h1 || errorDivs[0] || 'HTML error page received';
  
  // Generate suggestions based on common patterns
  const suggestions: string[] = [];
  
  if (title.toLowerCase().includes('unauthorized') || response.status === 401) {
    suggestions.push('Check if user is properly authenticated');
    suggestions.push('Verify authentication tokens are valid');
  }
  
  if (title.toLowerCase().includes('forbidden') || response.status === 403) {
    suggestions.push('Check user permissions');
    suggestions.push('Verify user has access to this resource');
  }
  
  if (response.status === 404) {
    suggestions.push('Check if the API endpoint exists');
    suggestions.push('Verify the URL path is correct');
  }
  
  if (response.status >= 500) {
    suggestions.push('Check server logs for internal errors');
    suggestions.push('Verify database connections');
    suggestions.push('Check if all required services are running');
  }
  
  if (errorMessage.toLowerCase().includes('middleware')) {
    suggestions.push('Check authentication middleware configuration');
    suggestions.push('Verify middleware is properly mounted');
  }

  return {
    isHtmlError: true,
    title,
    errorMessage,
    statusCode: response.status,
    suggestions
  };
}

// Helper function to open HTML error in new tab for debugging
export function debugHtmlError(htmlContent: string, url: string) {
  const newWindow = window.open('', '_blank');
  if (newWindow) {
    newWindow.document.write(`
      <html>
        <head><title>Debug: ${url}</title></head>
        <body>
          <h2>🔍 Debugging HTML Error from: ${url}</h2>
          <hr>
          ${htmlContent}
        </body>
      </html>
    `);
  }
}
