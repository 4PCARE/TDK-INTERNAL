import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Test the connection and provide better error messages
try {
  console.log('Attempting to connect to database...');
} catch (error) {
  console.error('Database connection failed:', error);
  throw new Error('Database connection failed. Check if your Neon database is active.');
}

export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum number of connections in the pool
  connectionTimeoutMillis: 10000, // 10 seconds
  idleTimeoutMillis: 30000, // 30 seconds
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('💥 Database pool error:', err);
});

export const db = drizzle({ client: pool, schema });