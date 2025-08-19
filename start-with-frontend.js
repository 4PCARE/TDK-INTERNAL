#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting AI-KMS with Frontend...');

// Start the backend services
const backend = spawn('npm', ['run', 'dev'], {
  cwd: process.cwd(),
  stdio: 'inherit'
});

// Wait a moment for backend to start, then start frontend
setTimeout(() => {
  console.log('🌐 Starting Frontend...');
  
  const frontend = spawn('npm', ['run', 'dev'], {
    cwd: path.join(process.cwd(), 'apps', 'admin-ui'),
    stdio: 'inherit'
  });

  frontend.on('close', (code) => {
    console.log(`Frontend exited with code ${code}`);
  });

}, 3000);

backend.on('close', (code) => {
  console.log(`Backend services exited with code ${code}`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  backend.kill();
  process.exit(0);
});