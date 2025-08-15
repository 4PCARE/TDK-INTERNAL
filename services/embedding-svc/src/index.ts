
import express from 'express';

export function createApp() {
  const app = express();
  
  app.use(express.json());

  app.get('/healthz', (req, res) => {
    res.json({ status: 'healthy', service: 'embedding-svc' });
  });

  app.post('/embed', (req, res) => {
    res.json({ embeddings: [], text: req.body.text });
  });

  return app;
}
