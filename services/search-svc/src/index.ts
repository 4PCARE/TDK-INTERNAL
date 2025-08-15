
import express from 'express';

export function createApp() {
  const app = express();
  
  app.use(express.json());

  app.get('/healthz', (req, res) => {
    res.json({ status: 'healthy', service: 'search-svc' });
  });

  app.post('/search', (req, res) => {
    res.json({ results: [], query: req.body.query });
  });

  return app;
}
