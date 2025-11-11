#!/usr/bin/env node

/**
 * Production startup script
 * Runs migrations then starts the server
 * Continues even if migrations fail (in case they were already applied)
 */

const { spawn } = require('child_process');

console.log('[Startup] 🚀 Starting production server...');

// Run migrations first
console.log('[Startup] Running database migrations...');
const migrate = spawn('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: true
});

migrate.on('close', (code) => {
  if (code === 0) {
    console.log('[Startup] ✅ Migrations completed successfully');
  } else {
    console.log('[Startup] ⚠️  Migration process exited with code', code);
    console.log('[Startup] This is OK if migrations were already applied');
  }

  // Start the server regardless of migration status
  console.log('[Startup] Starting API server...');
  const server = spawn('node', ['dist/apps/api/src/server.js'], {
    stdio: 'inherit',
    shell: true
  });

  server.on('close', (code) => {
    console.log('[Startup] Server exited with code', code);
    process.exit(code);
  });

  server.on('error', (err) => {
    console.error('[Startup] Failed to start server:', err);
    process.exit(1);
  });
});

migrate.on('error', (err) => {
  console.error('[Startup] ⚠️  Migration failed:', err.message);
  console.log('[Startup] Continuing to start server anyway...');

  // Start the server even if migration failed
  console.log('[Startup] Starting API server...');
  const server = spawn('node', ['dist/apps/api/src/server.js'], {
    stdio: 'inherit',
    shell: true
  });

  server.on('close', (code) => {
    console.log('[Startup] Server exited with code', code);
    process.exit(code);
  });

  server.on('error', (err) => {
    console.error('[Startup] Failed to start server:', err);
    process.exit(1);
  });
});
