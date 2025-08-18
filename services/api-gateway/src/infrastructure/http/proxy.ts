
import { Request, Response } from 'express';
import fetch from 'node-fetch';

export async function proxyRequest(req: Request, res: Response, targetUrl: string) {
  try {
    console.log(`🔀 Proxying ${req.method} ${req.path} -> ${targetUrl}`);

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'AI-KMS-Gateway/1.0'
    };

    // Forward auth header if present
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }

    // Add user context from auth middleware
    if ((req as any).user?.id) {
      headers['x-user-id'] = (req as any).user.id;
    }

    // Forward other relevant headers
    const forwardHeaders = ['content-type', 'accept', 'user-agent'];
    forwardHeaders.forEach(header => {
      if (req.headers[header]) {
        headers[header] = req.headers[header] as string;
      }
    });

    // Prepare request options
    const requestOptions: any = {
      method: req.method,
      headers
    };

    // Add body for POST/PUT/PATCH requests
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      if (req.headers['content-type']?.includes('multipart/form-data')) {
        // For file uploads, we need special handling
        requestOptions.body = req.body;
      } else {
        requestOptions.body = JSON.stringify(req.body);
      }
    }

    // Add query parameters
    const url = new URL(targetUrl);
    Object.keys(req.query).forEach(key => {
      url.searchParams.append(key, req.query[key] as string);
    });

    // Make the request
    const response = await fetch(url.toString(), requestOptions);
    
    // Forward response headers
    response.headers.forEach((value, key) => {
      if (!['transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    // Set status code
    res.status(response.status);

    // Stream response body
    const responseText = await response.text();
    
    try {
      // Try to parse as JSON
      const jsonResponse = JSON.parse(responseText);
      res.json(jsonResponse);
    } catch {
      // If not JSON, send as text
      res.send(responseText);
    }

  } catch (error) {
    console.error(`❌ Proxy error for ${req.method} ${req.path}:`, error);
    
    if (!res.headersSent) {
      res.status(502).json({
        error: 'Service unavailable',
        message: 'The requested service is currently unavailable',
        service: targetUrl.split('//')[1]?.split('/')[0] || 'unknown'
      });
    }
  }
}
