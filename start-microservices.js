#!/usr/bin/env node

/**
 * Start microservices without legacy server
 * Frontend runs on port 3000, API Gateway on 8080
 * This script uses concurrently to manage multiple services
 */

import { exec } from 'child_process';

// Use concurrently to run multiple npm scripts
const command = 'npx concurrently -n "Frontend,Gateway,Auth,DocIngest" -c "cyan,green,yellow,magenta" ' +
  '"cd apps/admin-ui && npm run dev" ' +
  '"cd services/api-gateway && npm run dev" ' +
  '"cd services/auth-svc && npm run dev" ' +
  '"cd services/doc-ingest-svc && npm run dev"';

console.log('🚀 Starting AI-KMS Microservices...\n');
console.log('📱 Frontend: http://localhost:3000');
console.log('🌐 API Gateway: http://localhost:8080');
console.log('🔐 Auth Service: http://localhost:3001');
console.log('📄 Doc Ingest: http://localhost:3002\n');

const proc = exec(command, (error, stdout, stderr) => {
  if (error) {
    console.error(`Error: ${error}`);
    return;
  }
  if (stderr) {
    console.error(`stderr: ${stderr}`);
  }
  console.log(`stdout: ${stdout}`);
});

proc.stdout.on('data', (data) => {
  console.log(data.toString());
});

proc.stderr.on('data', (data) => {
  console.error(data.toString());
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down services...');
  proc.kill();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down services...');
  proc.kill();
  process.exit(0);
});