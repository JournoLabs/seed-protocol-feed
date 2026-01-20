import express, { type Express } from 'express';
import * as feedRoutes from './routes/feed';

/**
 * Create and configure the Express API app
 */
export function createSeedProtocolFeedServer(): Express {
  console.log('Creating Seed Protocol feed server...');
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Only handle /feed/* routes
  app.use('/feed', (req, res, next) => {
    // All /feed routes go through here
    next();
  });

  app.get('/feed/:schemaName/:format', feedRoutes.getFeed);

  // Add more routes here as needed
  // app.get('/api/users', userRoutes.getUsers);
  // app.post('/api/users', userRoutes.createUser);

  // Error handling middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('API Error:', err);
    res.status(err.status || 500).json({
      error: 'Internal Server Error',
      message: err.message,
    });
  });

  // 404 handler for /api routes
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  return app;
}
