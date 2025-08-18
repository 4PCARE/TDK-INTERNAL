import { Request, Response } from 'express';
import http from 'http';

export function proxyRequest(req: Request, res: Response, targetUrl: string): void {
  console.log(`Proxying ${req.method} ${req.originalUrl} to ${targetUrl}`);

  const url = new URL(targetUrl);

  const options = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: url.host,
      'content-type': req.headers['content-type'] || 'application/json'
    },
    timeout: 5000
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // Forward status code and headers
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`Proxy error for ${targetUrl}:`, err.message);
    if (!res.headersSent) {
      res.status(502).json({ 
        error: 'Bad Gateway', 
        target: targetUrl,
        message: err.message 
      });
    }
  });

  proxyReq.on('timeout', () => {
    console.error(`Proxy timeout for ${targetUrl}`);
    if (!res.headersSent) {
      res.status(504).json({ 
        error: 'Gateway Timeout', 
        target: targetUrl 
      });
    }
    proxyReq.destroy();
  });

  // Handle request body
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}