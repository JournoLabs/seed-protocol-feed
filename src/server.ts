import cors from 'cors';
import express, { type Express } from 'express';
import * as feedRoutes from './routes/feed';

const publicFeedCors = cors({
  origin: '*',
  methods: ['GET', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['If-None-Match', 'Accept'],
});

/**
 * Create and configure the Express API app
 */
export function createSeedProtocolFeedServer(): Express {
  console.log('Creating Seed Protocol feed server...');
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(publicFeedCors);

  app.get('/:schemaName/archive/:year/:month/:format', feedRoutes.getArchiveFeed);
  app.get('/:schemaName/:format', feedRoutes.getFeed);

  // Add more routes here as needed
  // app.get('/api/users', userRoutes.getUsers);
  // app.post('/api/users', userRoutes.createUser);

  // Error handling middleware
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('API Error:', err);
    res.status(err.status || 500).json({
      error: 'Internal Server Error',
      message: err.message,
    });
  });

  // 404 handler for /api routes
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  return app;
}
