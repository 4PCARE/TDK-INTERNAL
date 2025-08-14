import type { Request, Response } from "express";
import { proxy } from "./proxy";

const LEGACY_ENV_NAME = "LEGACY_BASE_URL"; // resolved later by real bootstrap
// Placeholder resolver: read from process.env only if present; otherwise default to localhost.
// This read is safe and cheap; no network. Keeps us runnable for local dev.
const legacyBase = process?.env?.[LEGACY_ENV_NAME] ?? "http://localhost:5000";

export function registerLegacyRoutes(app: any) {
  // POST /chat -> legacy
  app.post("/chat", async (req: Request, res: Response) => {
    try {
      const r = await proxy(req, legacyBase, "/chat");
      res.status(r.status).set(r.headers).send(r.data);
    } catch (e: any) {
      res.status(502).json({ message: "Upstream proxy error", detail: String(e?.message || e) });
    }
  });

  // POST /search -> legacy
  app.post("/search", async (req: Request, res: Response) => {
    try {
      const r = await proxy(req, legacyBase, "/search");
      res.status(r.status).set(r.headers).send(r.data);
    } catch (e: any) {
      res.status(502).json({ message: "Upstream proxy error", detail: String(e?.message || e) });
    }
  });
}