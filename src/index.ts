import { client as seedClient, } from '@seedprotocol/sdk';
import type { FeedConfig } from './types';


let client: any;
let initializationPromise: Promise<void> | null = null;


/**
 * Initialize the Seed Protocol client
 * This should be called as soon as the app is ready
 */
export const initializeSeedClient = async (): Promise<void> => {
  // If already initializing, wait for that to complete
  if (initializationPromise) {
    return initializationPromise;
  }

  // If already initialized, return immediately
  if (client) {
    return;
  }

  initializationPromise = (async () => {
    try {
      console.log('Initializing Seed Protocol client...');

      
      await seedClient.init({ config: {
        endpoints: {
          filePaths: 'app-files',
          files: '/app-files',
        },
        arweaveDomain: 'arweave.net',
      }, addresses: [], });
      console.log('✅ Seed Protocol client initialized successfully');
      client = seedClient;
      initializationPromise = null; // Clear the promise after successful initialization
    } catch (error) {
      console.error('❌ Failed to initialize Seed Protocol client:', error);
      initializationPromise = null; // Clear the promise on error so we can retry
      throw error;
    }
  })();

  return initializationPromise;
}

/**
 * Get the Seed Protocol client, initializing it if necessary
 * This function can be called from any context (Electron main process or Vite dev server)
 */
export const getClient = async (): Promise<any> => {
  // If client is already initialized, return it
  if (client) {
    return client;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    await initializationPromise;
    return client;
  }

  // Otherwise, initialize it now
  await initializeSeedClient();
  return client;
}


/**
 * Teardown the Seed Protocol client
 * This should be called when the app is quitting
 */
export const teardownSeedClient = async (): Promise<void> => {
  try {
    console.log('Tearing down Seed Protocol client...');
    
    if (typeof seedClient.stop === 'function') {
      await seedClient.stop();
      console.log('✅ Seed Protocol client stopped');
    }
    
    if (typeof seedClient.unload === 'function') {
      await seedClient.unload();
      console.log('✅ Seed Protocol client unloaded');
    }
    
    console.log('✅ Seed Protocol client teardown complete');
  } catch (error) {
    console.error('❌ Failed to teardown Seed Protocol client:', error);
    // Don't throw - we want the app to quit even if teardown fails
  }
}

// ============================================================================
// Configuration
// ============================================================================

const SITE_CONFIG: FeedConfig = {
  title: 'Seed Protocol',
  description: 'Content published via Seed Protocol',
  siteUrl: 'https://seedprotocol.io',
  feedUrl: 'https://feed.seedprotocol.io',
  language: 'en',
  copyright: `© ${new Date().getFullYear()} All rights reserved`,
  author: {
    name: 'Seed Protocol',
    email: 'info@seedprotocol.io',
    link: 'https://seedprotocol.io',
  },
}
