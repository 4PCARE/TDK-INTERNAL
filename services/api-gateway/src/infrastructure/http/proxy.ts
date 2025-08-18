import { Request, Response } from 'express';
import http from 'http';
import express from 'express';

export function createProxyHandler(targetUrl: string) {
  return (req: express.Request, res: express.Response) => {
    console.log(`🔀 Proxying ${req.method} ${req.path} to ${targetUrl}`);
    console.log(`📦 Request body:`, req.body);
    console.log(`📋 Content-Type:`, req.get('Content-Type'));

    const url = new URL(targetUrl);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + (url.search || ''),
      method: req.method,
      headers: {
        ...req.headers,
        host: url.host,
        // Ensure content-type is properly forwarded
        'content-type': req.get('Content-Type') || 'application/json'
      },
      timeout: 30000
    };

    const proxyReq = http.request(options, (proxyRes) => {
      // Forward status and headers
      res.status(proxyRes.statusCode || 500);
      Object.entries(proxyRes.headers).forEach(([key, value]) => {
        if (value) res.setHeader(key, value);
      });

      // Forward response body
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error(`❌ Proxy error for ${req.method} ${req.path}:`, err.message);
      if (!res.headersSent) {
        res.status(504).json({ 
          error: 'Gateway Timeout',
          target: targetUrl + req.path
        });
      }
    });

    proxyReq.on('timeout', () => {
      console.error(`⏱️ Proxy timeout for ${req.method} ${req.path}`);
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ 
          error: 'Gateway Timeout',
          target: targetUrl + req.path
        });
      }
    });

    // Forward request body for POST/PUT/PATCH
    if (req.body && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
      const bodyData = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      console.log(`📤 Forwarding body:`, bodyData);
      proxyReq.write(bodyData);
    }

    proxyReq.end();
  };
}