import { PluginOption } from 'vite'
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { seedVitePlugin } from '@seedprotocol/sdk/vite';
import { handleFeedRequest, initializeSeedClient } from '@seedprotocol/feed';

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

        // Handle archive paths: /posts/archive/2024/03/rss
        const archiveMatch = pathname.match(/^\/([^/]+)\/archive\/(\d{4})\/(1[0-2]|0?[1-9])\/(rss|atom|json)(?:\?|$)/i)
        if (archiveMatch) {
          const [, collectionSegment, year, month, formatSegment] = archiveMatch
          const ifNoneMatch = req.headers['if-none-match'] as string | undefined
          const cacheBust = url.searchParams.get('v') ?? undefined
          try {
            await initializeSeedClient()
            const feedModule = await import('@seedprotocol/feed') as {
              handleArchiveFeedRequest?: (a: string, b: number, c: number, d: string, e?: string | null, f?: string) => Promise<Response>;
            }
            const handleArchiveFeedRequest = feedModule.handleArchiveFeedRequest
            if (typeof handleArchiveFeedRequest !== 'function') {
              res.statusCode = 501
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Archive feeds not yet supported - requires @seedprotocol/feed update' }))
              return
            }
            const response = await handleArchiveFeedRequest(
              collectionSegment,
              parseInt(year, 10),
              parseInt(month, 10),
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
          return
        }

        // Handle main feed paths: /posts/rss, /posts/atom, /posts/json
        const match = pathname.match(/^\/([^/]+)\/(rss|atom|json)(?:\?|$)/i)
        if (!match) {
          return next()  // Let Vite handle it
        }

        const [, collectionSegment, formatSegment] = match
        const ifNoneMatch = req.headers['if-none-match'] as string | undefined
        const cacheBust = url.searchParams.get('v') ?? undefined
        const pageParam = url.searchParams.get('page')
        const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1

        try {
          await initializeSeedClient()
          const response = await (handleFeedRequest as (a: string, b: string, c?: string | null, d?: string, e?: number) => Promise<Response>)(
            collectionSegment,
            formatSegment,
            ifNoneMatch ?? null,
            cacheBust ?? undefined,
            page
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
    port: 5183,
    strictPort: false,
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      '__tests__/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
    ],
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache',
      // Orphaned: reference removed local src/cache; exercise @seedprotocol/feed via app routes instead
      '**/*.integration.test.ts',
    ],
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
