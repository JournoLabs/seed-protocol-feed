#!/usr/bin/env node

/**
 * Production server entry point
 * This starts the Express server for handling feed API routes
 */

import { initializeSeedClient, teardownSeedClient } from '@seedprotocol/feed';
import { createSeedProtocolFeedServer } from './server.js';

const parsedPort = Number.parseInt(process.env.PORT ?? '', 10);
const PORT = Number.isFinite(parsedPort) ? parsedPort : 3000;

async function startServer() {
  try {
    await initializeSeedClient();
    const app = createSeedProtocolFeedServer();

    app.listen(PORT, '127.0.0.1', () => {
      console.log(`🚀 Seed Protocol Feed Server running on port ${PORT}`);
      console.log(`📡 Feed endpoints available at: http://localhost:${PORT}/:schemaName/:format`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down gracefully...`);
  await teardownSeedClient();
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

startServer();
