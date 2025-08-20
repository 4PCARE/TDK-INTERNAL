import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './infrastructure/http/routes.js';

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

// Use auth routes
app.use('/', authRoutes);

export function createApp() {
  return app;
}