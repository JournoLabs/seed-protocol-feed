#!/usr/bin/env node

/**
 * Production server entry point
 * This starts the Express server for handling feed API routes
 */

import { createSeedProtocolFeedServer } from './server.js';

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    const app = createSeedProtocolFeedServer();
    
    app.listen(PORT, () => {
      console.log(`🚀 Seed Protocol Feed Server running on port ${PORT}`);
      console.log(`📡 Feed endpoints available at: http://localhost:${PORT}/:schemaName/:format`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

startServer();
