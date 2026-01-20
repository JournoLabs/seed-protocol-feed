import { defineConfig, PluginOption } from 'vite'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { seedVitePlugin } from '@seedprotocol/sdk';
import { createSeedProtocolFeedServer } from './src/server';

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/**
 * Vite plugin to add API route handlers
 */
function feedPlugin(): PluginOption {
  return {
    name: 'api-routes',
    configureServer(server) {
      const feedServer = createSeedProtocolFeedServer();
      // Express apps can be used directly as Connect middleware
      server.middlewares.use(feedServer);
    },
  };
}

export default defineConfig({
  base: '/feed',
  plugins: [
    seedVitePlugin() as PluginOption,
    feedPlugin(),
  ],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
})
