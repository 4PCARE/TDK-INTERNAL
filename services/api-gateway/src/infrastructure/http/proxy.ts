import { createProxyMiddleware } from 'http-proxy-middleware';

export const proxyToLegacy = createProxyMiddleware({
  target: process.env.LEGACY_BASE_URL || 'http://localhost:5000',
  changeOrigin: true,
  logLevel: 'debug'
});

export function proxyToService(serviceName: string, port: number) {
  return createProxyMiddleware({
    target: `http://localhost:${port}`,
    changeOrigin: true,
    pathRewrite: {
      [`^/api/${serviceName.replace('-svc', '')}`]: ''
    },
    logLevel: 'debug'
  });
}

export async function proxy(req: any, baseUrl: string, path: string) {
  const url = new URL(path, baseUrl).toString();
  const method = (req.method || "GET").toUpperCase();

  // Copy headers except hop-by-hop and host-specific ones
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers || {})) {
    const key = String(k).toLowerCase();
    if (["host", "connection", "content-length"].includes(key)) continue;
    if (Array.isArray(v)) headers[key] = v.join(", ");
    else if (typeof v === "string") headers[key] = v;
  }

  // Body: only forward if method usually has a body
  const hasBody = !["GET", "HEAD"].includes(method);
  const body = hasBody ? (typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {})) : undefined;
  if (hasBody && !headers["content-type"]) headers["content-type"] = "application/json";

  // Use global fetch (Node 18+). Do not add polyfills.
  const resp = await fetch(url, { method, headers, body });
  const contentType = resp.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await resp.json() : await resp.text();
  return { status: resp.status, data, headers: { "content-type": contentType } };
}