import { validateUploadReq, validateUploadRes } from './validate';

/**
 * Health check routes for Document Ingestion Service
 */
export function registerRoutes(app: any): void {
  app.get('/healthz', (_req: any, res: any) => {
    res.status(200).json({ status: 'ok', service: 'doc-ingest-svc' });
  });

  app.get('/readyz', (_req: any, res: any) => {
    res.status(200).json({ 
      status: 'ready', 
      service: 'doc-ingest-svc',
      timestamp: new Date().toISOString()
    });
  });

  app.post('/documents', (req: any, res: any) => {
    const body = req.body ?? {};
    if (!validateUploadReq(body)) return res.status(400).json({ message: "Invalid upload payload" });
    const payload = { docId: "doc_" + Math.random().toString(36).slice(2) };
    if (!validateUploadRes(payload)) return res.status(500).json({ message: "Contract violation" });
    return res.status(200).json(payload);
  });
}