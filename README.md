# Seed Protocol Feed

Generate RSS, Atom, and JSON feeds from Seed Protocol data with a Vite-based web application.

## Features

- 🔄 **Dynamic routing** - `/feed/:schemaName/:format` to generate feeds for any schema
- 📡 **Multiple formats** - RSS 2.0, Atom 1.0, and JSON Feed 1.0
- ⚡ **Fast development** - Built with Vite for instant HMR and optimized builds
- 🔌 **Integrated server** - Express middleware seamlessly integrated into Vite dev server

## Quick Start

### Development

```bash
# Install dependencies
npm install
# or
bun install

# Start the development server
npm run dev:vite
# or
bun run dev:vite
```

The app will be available at `http://localhost:5173`

### Building for Production

```bash
# Build the client application
npm run build:client
# or
bun run build:client
```

The built files will be in `dist/client/`

### Preview Production Build

```bash
npm run preview
# or
bun run preview
```

## Usage

### URL Pattern

```
/feed/:schemaName/:format
```

The schema name is used to query Seed Protocol data:
- `/feed/posts/rss` → RSS feed of posts
- `/feed/articles/atom` → Atom feed of articles
- `/feed/products/json` → JSON Feed of products

### Supported Formats

| Format | Content-Type | URL |
|--------|--------------|-----|
| RSS 2.0 | `application/rss+xml` | `/feed/:schemaName/rss` |
| Atom 1.0 | `application/atom+xml` | `/feed/:schemaName/atom` |
| JSON Feed 1.0 | `application/feed+json` | `/feed/:schemaName/json` |

## Architecture

This application uses:

- **Vite** - Fast build tool and dev server
- **Express** - API middleware for feed generation
- **Seed Protocol SDK** - For querying Seed Protocol data
- **feedsmith** - For generating RSS, Atom, and JSON feeds

The Express server is integrated into Vite's dev server via a custom plugin, allowing seamless development with hot module replacement.

## Development

### Project Structure

```
src/
  ├── index.ts          # Main application entry point
  ├── server.ts         # Express server setup
  ├── routes/
  │   └── feed.ts       # Feed generation routes
  └── types.ts          # TypeScript type definitions
```

### Available Scripts

- `dev:vite` - Start Vite development server
- `build:client` - Build the client application for production
- `preview` - Preview the production build
- `typecheck` - Run TypeScript type checking
- `lint` - Run ESLint
- `test` - Run tests
- `test:watch` - Run tests in watch mode

## Deployment

### Automated Deployment Script

A `deploy.sh` script is provided for automated deployment to Ubuntu servers with nginx.

**⚠️ Security Notice**: Before using the deployment script, please read [SECURITY.md](./SECURITY.md) for important security considerations, especially regarding public repositories.

#### Quick Start

You can set environment variables either via command line or a `.env` file:

**Option 1: Using environment variables**
```bash
# Set required environment variable (your domain name)
export NGINX_SITE="your-domain.com"

# Optional: Set server port (defaults to 3000)
export SERVER_PORT=3000

# Run the deployment script
./deploy.sh
```

**Option 2: Using a .env file (recommended)**
```bash
# Copy the example file and customize it
cp .env.example .env

# Edit .env with your settings
# Then run the deployment script (it will automatically load .env)
./deploy.sh
```

The `.env.example` file shows all available configuration options.

**Note**: 
- The `NGINX_SITE` environment variable is **required**. The script will not proceed without it.
- The `.env` file is automatically gitignored, so you can safely store your configuration there.
- Environment variables set via `export` take precedence over values in `.env`.

#### What the Script Does

1. Pulls latest code from the `main` branch
2. Installs dependencies
3. Builds the Vite client application
4. Builds the server code
5. Sets up PM2 for process management
6. Starts/restarts the Express server
7. Updates nginx configuration (with confirmation)
8. Optionally reloads nginx

#### Manual Deployment

If you prefer manual deployment or need more control:

1. Build the application: `npm run build:client`
2. Configure nginx to serve static files from `dist/client/`
3. Configure nginx to proxy `/feed/*` routes to your Express server
4. Use a process manager (PM2, systemd, etc.) to run the server

See [SECURITY.md](./SECURITY.md) for detailed security best practices and considerations.

## License

MIT © Seed Protocol

## Contributing

Contributions are welcome! Please open an issue or submit a PR.
