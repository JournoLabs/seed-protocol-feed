import { PluginOption } from 'vite'
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { seedVitePlugin } from '@seedprotocol/sdk/vite';
import { handleFeedRequest } from '@seedprotocol/feed';

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/**
 * Vite plugin to add feed route handlers.
 * Only handles paths like /:collection/rss, /:collection/atom, /:collection/json.
 * All other paths are passed to next() so Vite can handle them (e.g. /@vite/client, /src/index.ts).
 */
function feedPlugin(): PluginOption {
  return {
    name: 'feed-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '', `http://${req.headers.host}`)
        const pathname = url.pathname

        // Only handle paths like /posts/rss, /posts/atom, /posts/json
        const match = pathname.match(/^\/([^/]+)\/(rss|atom|json)(?:\?|$)/i)
        if (!match) {
          return next()  // Let Vite handle it
        }

        const [, collectionSegment, formatSegment] = match
        const ifNoneMatch = req.headers['if-none-match'] as string | undefined
        const cacheBust = url.searchParams.get('v') ?? undefined

        try {
          const response = await handleFeedRequest(
            collectionSegment,
            formatSegment,
            ifNoneMatch ?? null,
            cacheBust ?? undefined
          )
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(await response.text())
        } catch (err) {
          next(err)
        }
      })
    },
  };
}

export default defineConfig({
  base: '/',
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
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      '__tests__/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
    ],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'dist/',
      ],
    },
  },
})
