/**
 * Development server for microservices architecture
 * Runs frontend + microservices without legacy server
 */

import { exec } from 'child_process';
import path from 'path';

const services = [
  'cd apps/admin-ui && npm run dev',
  'cd services/api-gateway && npm run dev', 
  'cd services/auth-svc && npm run dev',
  'cd services/doc-ingest-svc && npm run dev'
];

console.log('🚀 Starting AI-KMS Microservices Architecture');
console.log('📱 Frontend (React): http://localhost:3000');
console.log('🌐 API Gateway: http://localhost:8080');
console.log('🔐 Auth Service: http://localhost:3001');
console.log('📄 Doc Ingest: http://localhost:3002');
console.log('');

// Use concurrently to manage all services
const concurrentlyCmd = `npx concurrently -n "Frontend,Gateway,Auth,DocIngest" -c "cyan,green,yellow,magenta" "${services.join('" "')}"`; 

const child = exec(concurrentlyCmd, { 
  cwd: process.cwd(),
  env: { ...process.env, FORCE_COLOR: '1' }
});

child.stdout?.on('data', (data) => {
  console.log(data.toString());
});

child.stderr?.on('data', (data) => {
  console.error(data.toString()); 
});

child.on('exit', (code) => {
  console.log(`Services exited with code: ${code}`);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down microservices...');
  child.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down microservices...');
  child.kill('SIGTERM');  
  process.exit(0);
});