#!/bin/bash

# ============================================================================
# Seed Protocol Feed - Production Deployment Script
# ============================================================================
# This script deploys the Vite app to production on Ubuntu server
# 
# REQUIRED ENVIRONMENT VARIABLES:
#   NGINX_SITE - Your domain name (e.g., "example.com")
#     Can be set via: export NGINX_SITE=yourdomain.com
#     Or in a .env file: NGINX_SITE=yourdomain.com
# 
# OPTIONAL ENVIRONMENT VARIABLES:
#   SERVER_PORT - Port for the Express server (default: 3000)
#   APP_NAME - Application name (default: seed-protocol-feed)
# 
# The script will automatically load variables from a .env file if present.
# 
# USAGE:
#   ./deploy.sh              # Interactive mode (prompts for confirmation)
#   ./deploy.sh --yes       # Non-interactive mode (auto-confirms all prompts)
#   ./deploy.sh -y          # Short form of --yes
#   ./deploy.sh --auto      # Alias for --yes
# 
# SECURITY WARNING:
# This script requires sudo privileges and modifies system files (/etc/nginx/).
# Only run this script on servers you control and trust.
# Review the script before executing: cat deploy.sh | less
# 
# For production use, consider:
# - Reviewing and customizing this script for your environment
# - Using environment variables for sensitive configuration
# - Implementing additional security measures (firewall, monitoring, etc.)
# - Keeping deployment scripts in a private repository if they contain
#   sensitive information about your infrastructure
# ============================================================================

set -e  # Exit on any error
# Note: set -u is deferred until after .env loading to allow optional variables

# Parse command line arguments
AUTO_CONFIRM=false
while [[ $# -gt 0 ]]; do
    case $1 in
        -y|--yes|--auto)
            AUTO_CONFIRM=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -y, --yes, --auto    Auto-confirm all prompts (useful for CI/CD)"
            echo "  -h, --help           Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  NGINX_SITE (required) - Your domain name"
            echo "  SERVER_PORT (optional) - Server port (default: 3000)"
            echo "  APP_NAME (optional) - App name (default: seed-protocol-feed)"
            echo ""
            echo "The script will also load variables from a .env file if present."
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            echo "Use -h or --help for usage information" >&2
            exit 1
            ;;
    esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions (defined early for use in load_env_file)
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get script directory first
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load environment variables from .env file if it exists
load_env_file() {
    local env_file="$APP_DIR/.env"
    
    if [ -f "$env_file" ]; then
        log_info "Loading environment variables from .env file..."
        
        # Read .env file line by line, ignoring comments and empty lines
        # This approach is safer than sourcing directly as it handles edge cases
        while IFS= read -r line || [ -n "$line" ]; do
            # Skip comments and empty lines
            [[ "$line" =~ ^[[:space:]]*# ]] && continue
            [[ -z "${line// }" ]] && continue
            
            # Export the variable (handles KEY=value format)
            # Remove any leading/trailing whitespace
            line=$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
            
            # Only process lines that look like KEY=value
            if [[ "$line" =~ ^[[:alpha:]_][[:alnum:]_]*= ]]; then
                # Use eval carefully - we've validated the format
                export "$line" 2>/dev/null || true
            fi
        done < "$env_file"
        
        log_info "Environment variables loaded from .env"
    else
        log_info "No .env file found (this is optional)"
    fi
}

# Load .env file before setting other variables
load_env_file

# Now enable strict mode for undefined variables
set -u

# Configuration
# These can be overridden via environment variables for security/flexibility
APP_NAME="${APP_NAME:-seed-protocol-feed}"
BUILD_DIR="$APP_DIR/dist/client"
SERVER_PORT="${SERVER_PORT:-3000}"
NODE_ENV="${NODE_ENV:-production}"
SERVER_USE_TSX="${SERVER_USE_TSX:-false}"

# NGINX_SITE is required - no default to avoid hardcoding a specific domain
# Users must set this to their own domain (via env var or .env file)
NGINX_SITE="${NGINX_SITE:-}"

# Security: Validate that we're in the expected directory
# This helps prevent accidental execution in wrong locations
if [ ! -f "$APP_DIR/package.json" ]; then
    echo "Error: package.json not found. Are you in the correct directory?" >&2
    exit 1
fi

# Validate required configuration
if [ -z "$NGINX_SITE" ]; then
    echo "Error: NGINX_SITE environment variable is required" >&2
    echo "Please set it to your domain name, e.g.:" >&2
    echo "  export NGINX_SITE=yourdomain.com" >&2
    echo "  # OR create a .env file with: NGINX_SITE=yourdomain.com" >&2
    echo "  ./deploy.sh" >&2
    exit 1
fi

# Check if running as root (we shouldn't run the app as root)
check_user() {
    if [ "$EUID" -eq 0 ]; then
        log_error "This script should not be run as root. Please run as a regular user."
        log_error "The script will use sudo for specific operations that require elevated privileges."
        exit 1
    fi
    
    # Security: Warn if running in an unexpected environment
    if [ -n "${CI:-}" ] && [ "${CI:-}" != "true" ]; then
        log_warn "Running in CI environment. Some interactive prompts may fail."
    fi
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        log_error "Node.js version 18+ is required. Current version: $(node -v)"
        exit 1
    fi
    
    # Check for bun or npm (prefer bun)
    if command -v bun &> /dev/null; then
        log_info "bun is installed"
    elif command -v npm &> /dev/null; then
        log_info "npm is installed (bun not found, using npm)"
    else
        log_error "Neither bun nor npm is installed. Please install bun (preferred) or npm."
        exit 1
    fi
    
    # Check nginx (optional check - script will work even if nginx isn't running yet)
    if command -v nginx &> /dev/null; then
        log_info "nginx is installed"
    else
        log_warn "nginx is not installed. You'll need to configure nginx separately."
    fi
    
    # Check PM2 (optional - we'll install it if needed)
    if ! command -v pm2 &> /dev/null; then
        log_warn "PM2 is not installed. Will attempt to install it globally."
    fi
    
    log_info "Prerequisites check complete"
}

# Git operations
git_pull() {
    log_info "Pulling latest changes from main branch..."
    cd "$APP_DIR"
    
    # Security: Verify we're in a git repository
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        log_error "Not a git repository. Cannot pull updates."
        exit 1
    fi
    
    # Security: Verify remote exists
    if ! git remote get-url origin > /dev/null 2>&1; then
        log_error "Git remote 'origin' not configured."
        exit 1
    fi
    
    # Fetch latest changes
    local branch="${GIT_BRANCH:-main}"
    git fetch origin "$branch" || {
        log_error "Failed to fetch from origin. Check your git configuration."
        exit 1
    }
    
    # Pull latest changes
    git pull origin "$branch" || {
        log_error "Failed to pull from $branch branch."
        exit 1
    }
    
    log_info "Git pull completed successfully"
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    cd "$APP_DIR"
    
    # Clean up any existing node_modules to avoid version conflicts
    # This helps resolve issues like esbuild version mismatches
    if [ -d "node_modules" ]; then
        log_info "Cleaning existing node_modules to avoid version conflicts..."
        rm -rf node_modules
    fi
    
    # Option to force cache clean (set CLEAN_CACHE=true to enable)
    if [ "${CLEAN_CACHE:-false}" = "true" ]; then
        if command -v bun &> /dev/null; then
            log_info "Clearing bun cache (CLEAN_CACHE=true)..."
            bun pm cache rm 2>/dev/null || true
        elif command -v npm &> /dev/null; then
            log_info "Clearing npm cache (CLEAN_CACHE=true)..."
            npm cache clean --force 2>/dev/null || true
        fi
    fi
    
    # Function to attempt installation with cleanup on failure
    attempt_install() {
        local install_cmd="$1"
        local max_retries=2
        local retry=0
        
        while [ $retry -lt $max_retries ]; do
            if [ $retry -gt 0 ]; then
                log_warn "Installation failed, cleaning and retrying (attempt $((retry + 1))/$max_retries)..."
                # Clean node_modules
                rm -rf node_modules
                # Clean cache on retry to fix binary issues
                if command -v bun &> /dev/null; then
                    log_info "Clearing bun cache to resolve binary version conflicts..."
                    bun pm cache rm 2>/dev/null || true
                elif command -v npm &> /dev/null; then
                    log_info "Clearing npm cache to resolve binary version conflicts..."
                    npm cache clean --force 2>/dev/null || true
                fi
            fi
            
            # Run the install command
            if eval "$install_cmd"; then
                return 0
            fi
            
            retry=$((retry + 1))
        done
        
        return 1
    }
    
    # Prefer bun if available, otherwise use npm
    if command -v bun &> /dev/null; then
        log_info "Using bun install..."
        if ! bun install; then
            log_error "Failed to install dependencies with bun"
            log_error "Troubleshooting: Try running manually: bun install"
            exit 1
        fi
    elif [ -f "package-lock.json" ]; then
        log_info "Using npm ci (clean install from package-lock.json)..."
        if ! attempt_install "npm ci --production=false"; then
            log_warn "npm ci failed, trying npm install as fallback..."
            rm -rf node_modules package-lock.json
            if ! attempt_install "npm install"; then
                log_error "Failed to install dependencies after retries"
                log_error ""
                log_error "Troubleshooting steps:"
                log_error "  1. Manually clean cache: npm cache clean --force"
                log_error "  2. Remove node_modules and package-lock.json, then: npm install"
                log_error "  3. Check Node.js version compatibility (current: $(node -v))"
                log_error "  4. Try setting CLEAN_CACHE=true before running deploy.sh"
                log_error "  5. Consider installing bun for faster installs: curl -fsSL https://bun.sh/install | bash"
                exit 1
            fi
        fi
    else
        log_info "Using npm install..."
        if ! attempt_install "npm install"; then
            log_error "Failed to install dependencies after retries"
            log_error "Try running manually: npm cache clean --force && npm install"
            log_error "Or install bun for faster installs: curl -fsSL https://bun.sh/install | bash"
            exit 1
        fi
    fi
    
    log_info "Dependencies installed successfully"
}

# Build the application
build_application() {
    log_info "Building application..."
    cd "$APP_DIR"
    
    # Build the Vite client (static files)
    log_info "Building Vite client..."
    if command -v bun &> /dev/null; then
        bun run build:client || {
            log_error "Failed to build Vite client"
            exit 1
        }
    else
        npm run build:client || {
            log_error "Failed to build Vite client"
            exit 1
        }
    fi
    
    # Setup server runtime
    # Check if cli.ts exists (server entry point)
    if [ -f "src/cli.ts" ]; then
        log_info "Setting up server runtime..."
        
        # Prefer using tsx to run TypeScript directly (avoids bundling issues with SDK)
        # Check if tsx is available locally first
        TSX_AVAILABLE=false
        if command -v tsx &> /dev/null; then
            log_info "tsx is installed globally"
            TSX_AVAILABLE=true
        elif [ -f "node_modules/.bin/tsx" ]; then
            log_info "tsx found in node_modules"
            TSX_AVAILABLE=true
        else
            log_info "tsx not found in node_modules, installing as dev dependency..."
            if command -v bun &> /dev/null; then
                bun add -d tsx || {
                    log_warn "Failed to install tsx with bun"
                    TSX_AVAILABLE=false
                }
            else
                npm install --save-dev tsx || {
                    log_warn "Failed to install tsx with npm"
                    TSX_AVAILABLE=false
                }
            fi
            # Check if installation succeeded
            if [ -f "node_modules/.bin/tsx" ]; then
                log_info "tsx installed successfully"
                TSX_AVAILABLE=true
            elif command -v tsx &> /dev/null; then
                log_info "tsx is now available"
                TSX_AVAILABLE=true
            fi
        fi
        
        # Verify tsx works
        if [ "$TSX_AVAILABLE" = "true" ]; then
            log_info "Using tsx to run TypeScript directly (no build needed)"
            export SERVER_USE_TSX=true
            # No build needed - tsx will run TypeScript directly
        else
            log_error "tsx is not available and cannot be installed"
            if command -v bun &> /dev/null; then
                log_error "Please install tsx manually: bun add -d tsx"
            else
                log_error "Please install tsx manually: npm install --save-dev tsx"
            fi
            exit 1
        fi
    else
        log_warn "src/cli.ts not found. Server may not be needed for this deployment."
        log_warn "If you need the server, create src/cli.ts as the entry point."
    fi
    
    # Verify build output
    if [ ! -d "$BUILD_DIR" ]; then
        log_error "Build output directory not found: $BUILD_DIR"
        exit 1
    fi
    
    if [ -z "$(ls -A "$BUILD_DIR")" ]; then
        log_error "Build output directory is empty: $BUILD_DIR"
        exit 1
    fi
    
    log_info "Build completed successfully"
    log_info "Build output: $BUILD_DIR"
}

# Setup PM2 for process management
setup_pm2() {
    log_info "Setting up PM2 process manager..."
    
    # Install PM2 globally if not present
    if ! command -v pm2 &> /dev/null; then
        log_info "Installing PM2 globally..."
        sudo npm install -g pm2 || {
            log_error "Failed to install PM2. You may need to run: sudo npm install -g pm2"
            exit 1
        }
    fi
    
    # Always regenerate PM2 ecosystem file to ensure it's up to date
    # Use .cjs extension to ensure CommonJS format (works even if package.json has "type": "module")
    PM2_CONFIG="$APP_DIR/ecosystem.config.cjs"
    PM2_CONFIG_OLD="$APP_DIR/ecosystem.config.js"
    
    # Remove old .js config if it exists (migration from previous version)
    if [ -f "$PM2_CONFIG_OLD" ]; then
        log_info "Removing old ecosystem.config.js (migrating to .cjs format)..."
        rm -f "$PM2_CONFIG_OLD"
    fi
    
    # Determine which script to use (tsx for TypeScript or built file)
    if [ "${SERVER_USE_TSX:-false}" = "true" ]; then
        # Use tsx to run TypeScript directly
        if command -v tsx &> /dev/null; then
            SERVER_SCRIPT="tsx"
            SERVER_ARGS="src/cli.ts"
        else
            SERVER_SCRIPT="npx"
            SERVER_ARGS="tsx src/cli.ts"
        fi
        log_info "PM2 will use tsx to run TypeScript directly"
    else
        # Use built file
        SERVER_SCRIPT="dist/cli.cjs"
        SERVER_ARGS=""
        log_info "PM2 will use built file: dist/cli.cjs"
    fi
    
    # Always regenerate the config to ensure it matches current setup
    log_info "Regenerating PM2 ecosystem configuration..."
    if [ -n "$SERVER_ARGS" ]; then
        # Using tsx - need to set script and args separately
        cat > "$PM2_CONFIG" << EOF
module.exports = {
  apps: [{
    name: '$APP_NAME',
    script: '$SERVER_SCRIPT',
    args: '$SERVER_ARGS',
    instances: 1,
    exec_mode: 'fork',
    cwd: '$APP_DIR',
    env: {
      NODE_ENV: 'production',
      PORT: $SERVER_PORT
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '500M',
    watch: false
  }]
};
EOF
    else
        # Using built file
        cat > "$PM2_CONFIG" << EOF
module.exports = {
  apps: [{
    name: '$APP_NAME',
    script: '$SERVER_SCRIPT',
    instances: 1,
    exec_mode: 'fork',
    cwd: '$APP_DIR',
    env: {
      NODE_ENV: 'production',
      PORT: $SERVER_PORT
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '500M',
    watch: false
  }]
};
EOF
    fi
    log_info "PM2 ecosystem file regenerated: $PM2_CONFIG"
    
    # Create logs directory
    mkdir -p "$APP_DIR/logs"
    
    log_info "PM2 setup complete"
}

# Start/restart the server with PM2
restart_server() {
    log_info "Starting/restarting server with PM2..."
    
    # Verify server setup before starting
    if [ "${SERVER_USE_TSX:-false}" = "true" ]; then
        # Verify tsx is available and source file exists
        if [ ! -f "$APP_DIR/src/cli.ts" ]; then
            log_error "Server source file not found: src/cli.ts"
            exit 1
        fi
        if ! command -v tsx &> /dev/null && ! npx tsx --version &> /dev/null 2>&1; then
            log_error "tsx is not available."
            if command -v bun &> /dev/null; then
                log_error "Please install it: bun add -d tsx"
            else
                log_error "Please install it: npm install --save-dev tsx"
            fi
            exit 1
        fi
        log_info "Using tsx to run TypeScript directly"
    else
        # Verify built file exists
        if [ ! -f "$APP_DIR/dist/cli.cjs" ]; then
            log_error "Server file not found: dist/cli.cjs"
            log_error "The server build may have failed. Check the build logs above."
            exit 1
        fi
        log_info "Using built file: dist/cli.cjs"
    fi
    
    # Verify ecosystem config exists
    if [ ! -f "$APP_DIR/ecosystem.config.cjs" ]; then
        log_error "PM2 ecosystem config not found: ecosystem.config.cjs"
        log_error "This should have been created by setup_pm2. Check the logs above."
        exit 1
    fi
    
    # Always delete existing process first to ensure fresh start with updated config
    if pm2 list | grep -q "$APP_NAME"; then
        log_info "Stopping and deleting existing PM2 process to apply new config..."
        pm2 delete "$APP_NAME" 2>/dev/null || {
            log_warn "Failed to delete existing process (may not exist), continuing..."
        }
    fi
    
    # Start fresh with the ecosystem config
    log_info "Starting PM2 process with ecosystem config..."
    cd "$APP_DIR"
    pm2 start ecosystem.config.cjs || {
        log_error "Failed to start PM2 process with ecosystem file"
        log_error "Check PM2 logs: pm2 logs $APP_NAME"
        exit 1
    }
    
    # Verify PM2 is using the correct script
    local script_path=$(pm2 jlist | grep -A 20 "\"name\":\"$APP_NAME\"" | grep '"script"' | head -1 | sed 's/.*"script":"\([^"]*\)".*/\1/')
    if [ "${SERVER_USE_TSX:-false}" = "true" ]; then
        if [[ "$script_path" == *"tsx"* ]]; then
            log_info "Verified: PM2 is using tsx to run TypeScript"
        else
            log_warn "Warning: PM2 script path may be incorrect: $script_path"
            log_warn "Expected: tsx or npx tsx"
        fi
    else
        if [[ "$script_path" == *"cli.cjs"* ]]; then
            log_info "Verified: PM2 is using the correct script (dist/cli.cjs)"
        else
            log_warn "Warning: PM2 script path may be incorrect: $script_path"
            log_warn "Expected: dist/cli.cjs"
        fi
    fi
    
    # Wait a moment for the server to start
    sleep 2
    
    # Verify the server is actually running and listening
    if pm2 list | grep -q "$APP_NAME.*online"; then
        log_info "PM2 process is online"
        
        # Check if server is listening on the port (optional verification)
        if command -v netstat &> /dev/null; then
            if netstat -tln 2>/dev/null | grep -q ":$SERVER_PORT "; then
                log_info "Verified: Server is listening on port $SERVER_PORT"
            else
                log_warn "Warning: Server may not be listening on port $SERVER_PORT yet"
                log_warn "Check PM2 logs if the server fails to respond: pm2 logs $APP_NAME"
            fi
        elif command -v ss &> /dev/null; then
            if ss -tln 2>/dev/null | grep -q ":$SERVER_PORT "; then
                log_info "Verified: Server is listening on port $SERVER_PORT"
            else
                log_warn "Warning: Server may not be listening on port $SERVER_PORT yet"
                log_warn "Check PM2 logs if the server fails to respond: pm2 logs $APP_NAME"
            fi
        fi
    else
        log_error "PM2 process is not online. Check logs: pm2 logs $APP_NAME"
        exit 1
    fi
    
    # Save PM2 process list
    pm2 save || {
        log_warn "Failed to save PM2 process list. Run 'pm2 save' manually."
    }
    
    # Setup PM2 startup script (one-time)
    if ! pm2 startup | grep -q "already"; then
        log_info "Setting up PM2 startup script..."
        pm2 startup || {
            log_warn "Failed to setup PM2 startup. You may need to run 'pm2 startup' manually."
        }
    fi
    
    log_info "Server is running on port $SERVER_PORT"
    pm2 status
}

# Find nginx configuration file for the site
find_nginx_config() {
    local config_file=""
    
    # Security: Validate NGINX_SITE to prevent path traversal
    if [[ "$NGINX_SITE" =~ \.\.|/ ]] && [[ "$NGINX_SITE" != *.* ]]; then
        log_error "Invalid NGINX_SITE value (contains path traversal): $NGINX_SITE"
        return 1
    fi
    
    # Common nginx config locations
    local search_paths=(
        "/etc/nginx/sites-available/$NGINX_SITE"
        "/etc/nginx/sites-available/${NGINX_SITE}.conf"
        "/etc/nginx/conf.d/$NGINX_SITE.conf"
        "/etc/nginx/conf.d/${NGINX_SITE}.conf"
    )
    
    # Also check enabled sites
    if [ -d "/etc/nginx/sites-enabled" ]; then
        search_paths+=(
            "/etc/nginx/sites-enabled/$NGINX_SITE"
            "/etc/nginx/sites-enabled/${NGINX_SITE}.conf"
        )
    fi
    
    # Search for config file containing the server_name
    for path in "${search_paths[@]}"; do
        if [ -f "$path" ] && sudo grep -q "server_name.*$NGINX_SITE" "$path" 2>/dev/null; then
            config_file="$path"
            log_info "Found nginx config: $config_file"
            break
        fi
    done
    
    # If not found in common locations, search all nginx config files
    if [ -z "$config_file" ] && [ -d "/etc/nginx" ]; then
        log_info "Searching for nginx config files containing $NGINX_SITE..."
        local found=$(sudo find /etc/nginx -type f -name "*.conf" 2>/dev/null | xargs sudo grep -l "server_name.*$NGINX_SITE" 2>/dev/null | head -1)
        if [ -n "$found" ]; then
            config_file="$found"
            log_info "Found nginx config: $config_file"
        fi
    fi
    
    echo "$config_file"
}

# Check if root-level static serving configuration exists in nginx config
has_feed_location() {
    local config_file="$1"
    if [ -z "$config_file" ] || [ ! -f "$config_file" ]; then
        return 1
    fi
    
    # Check if root directive and try_files are configured for this app
    # Look for root pointing to dist/client and try_files with @express
    sudo grep -q "root.*dist/client" "$config_file" 2>/dev/null && \
    sudo grep -q "try_files.*@express" "$config_file" 2>/dev/null
}

# Add root-level static serving configuration to nginx config
add_feed_location() {
    local config_file="$1"
    
    if [ -z "$config_file" ]; then
        log_error "Cannot add feed configuration: nginx config file not found"
        log_error "The nginx configuration file for $NGINX_SITE does not exist yet."
        log_error ""
        log_error "You need to create the nginx config file first. Options:"
        log_error "  1. Use the example config: nginx.example.conf"
        log_error "  2. Run certbot to create it: sudo certbot --nginx -d $NGINX_SITE"
        log_error "  3. Manually create: /etc/nginx/sites-available/$NGINX_SITE"
        return 1
    fi
    
    if [ ! -f "$config_file" ]; then
        log_error "Cannot add feed configuration: config file not accessible: $config_file"
        log_error "Please check file permissions or create the file first."
        return 1
    fi
    
    log_info "Adding root-level static serving configuration to nginx config..."
    
    # Create backup
    local backup_file="${config_file}.backup.$(date +%Y%m%d_%H%M%S)"
    sudo cp "$config_file" "$backup_file"
    log_info "Created backup: $backup_file"
    
    # Create temp file with the configuration block
    local temp_file=$(mktemp)
    local feed_block_file=$(mktemp)
    
    # Get absolute path to build directory
    local build_dir="$APP_DIR/dist/client"
    
    # Write the configuration block to a file
    cat > "$feed_block_file" << FEEDBLOCK
    # Serve static files from dist/client, proxy API routes to Express server
    root $build_dir;
    index index.html;
    
    location / {
        try_files \$uri \$uri/ @express;
    }
    
    # Proxy API routes to Express server
    location @express {
        proxy_pass http://localhost:$SERVER_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
FEEDBLOCK
    
    # Use Python for reliable parsing and insertion
    if command -v python3 &> /dev/null; then
        sudo python3 << PYTHON_SCRIPT
import re
import sys

config_file = '$config_file'
feed_block_file = '$feed_block_file'
nginx_site = '$NGINX_SITE'

# Read the config file
with open(config_file, 'r') as f:
    content = f.read()

# Read the feed block to insert
with open(feed_block_file, 'r') as f:
    feed_block = f.read()

# Find all server blocks
server_pattern = r'(server\s*\{[^}]*?server_name[^}]*?' + re.escape(nginx_site) + r'[^}]*?)(\n\s*\})'
match = re.search(server_pattern, content, re.DOTALL | re.IGNORECASE)

if not match:
    # Try finding server blocks more flexibly
    lines = content.split('\n')
    in_target_server = False
    brace_count = 0
    server_start = -1
    insert_position = -1
    
    for i, line in enumerate(lines):
        # Check if we're entering a server block
        if re.search(r'server\s*\{', line, re.IGNORECASE):
            if server_start == -1:
                server_start = i
            brace_count = line.count('{') - line.count('}')
            # Check if this server block is for our site
            if re.search(r'server_name[^;]*' + re.escape(nginx_site), line, re.IGNORECASE):
                in_target_server = True
            elif in_target_server is False:
                # Check next few lines for server_name
                for j in range(i, min(i+10, len(lines))):
                    if re.search(r'server_name[^;]*' + re.escape(nginx_site), lines[j], re.IGNORECASE):
                        in_target_server = True
                        break
        elif in_target_server:
            brace_count += line.count('{') - line.count('}')
            
            # If we find the closing brace of the server block
            if brace_count == 0 and re.match(r'^\s*\}\s*$', line):
                insert_position = i
                break
    
    if insert_position > 0:
        # Check if root-level configuration already exists
        server_content = '\n'.join(lines[server_start:insert_position+1])
        if 'root' in server_content and 'dist/client' in server_content and '@express' in server_content:
            print("Root-level static serving configuration already exists in config", file=sys.stderr)
            sys.exit(1)
        
        # Insert the configuration block before the closing brace
        lines.insert(insert_position, feed_block.rstrip())
        new_content = '\n'.join(lines)
        
        with open(config_file, 'w') as f:
            f.write(new_content)
        print("Added root-level static serving configuration")
        sys.exit(0)
    else:
        print(f"Could not find server block for {nginx_site}", file=sys.stderr)
        sys.exit(1)
else:
    server_block_start = match.group(1)
    closing_brace = match.group(2)
    
    # Check if root-level configuration already exists
    if 'root' in server_block_start and 'dist/client' in server_block_start and '@express' in server_block_start:
        print("Root-level static serving configuration already exists in config", file=sys.stderr)
        sys.exit(1)
    
    # Add the configuration block before the closing brace
    new_server_block = server_block_start + feed_block.rstrip() + '\n' + closing_brace
    new_content = content[:match.start()] + new_server_block + content[match.end():]
    
    with open(config_file, 'w') as f:
        f.write(new_content)
    print("Added root-level static serving configuration")
    sys.exit(0)
PYTHON_SCRIPT
        
        local result=$?
        rm -f "$feed_block_file" "$temp_file"
        
        if [ $result -eq 0 ]; then
            log_info "Successfully added root-level static serving configuration to nginx config"
            return 0
        else
            log_warn "Failed to automatically add configuration using Python"
        fi
    fi
    
    # Fallback: Use sed to append before the last } in the file
    # This is less reliable but works in simple cases
    log_warn "Using fallback method to add configuration..."
    if sudo sed -i.bak "\$i\\
    # Serve static files from dist/client, proxy API routes to Express server\\
    root $APP_DIR/dist/client;\\
    index index.html;\\
    \\
    location / {\\
        try_files \\\$uri \\\$uri/ @express;\\
    }\\
    \\
    # Proxy API routes to Express server\\
    location @express {\\
        proxy_pass http://localhost:$SERVER_PORT;\\
        proxy_http_version 1.1;\\
        proxy_set_header Upgrade \\\$http_upgrade;\\
        proxy_set_header Connection 'upgrade';\\
        proxy_set_header Host \\\$host;\\
        proxy_set_header X-Real-IP \\\$remote_addr;\\
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;\\
        proxy_set_header X-Forwarded-Proto \\\$scheme;\\
        proxy_cache_bypass \\\$http_upgrade;\\
        \\
        # Timeouts\\
        proxy_connect_timeout 60s;\\
        proxy_send_timeout 60s;\\
        proxy_read_timeout 60s;\\
    }\\
" "$config_file" 2>/dev/null; then
        log_warn "Added configuration using sed (please verify the config manually)"
        log_warn "The block may have been added at the end of the file instead of in the server block"
        return 0
    fi
    
    log_error "Failed to add configuration automatically"
    rm -f "$feed_block_file" "$temp_file"
    return 1
}

# Update nginx configuration
update_nginx_config() {
    if ! command -v nginx &> /dev/null; then
        log_warn "nginx is not installed. Skipping nginx config update."
        return 1
    fi
    
    log_info "Checking nginx configuration for $NGINX_SITE..."
    
    # Find the nginx config file
    local config_file=$(find_nginx_config)
    
    if [ -z "$config_file" ]; then
        log_warn "========================================="
        log_warn "nginx Configuration File Not Found"
        log_warn "========================================="
        log_warn "Could not find nginx configuration file for $NGINX_SITE"
        log_warn ""
        log_warn "The nginx config file needs to be created first. You can:"
        log_warn ""
        log_warn "Option 1: Use certbot (recommended for SSL setup):"
        log_warn "  sudo certbot --nginx -d $NGINX_SITE"
        log_warn "  (This will create the config and set up SSL automatically)"
        log_warn ""
        log_warn "Option 2: Create manually from example:"
        log_warn "  sudo cp nginx.example.conf /etc/nginx/sites-available/$NGINX_SITE"
        log_warn "  sudo ln -s /etc/nginx/sites-available/$NGINX_SITE /etc/nginx/sites-enabled/"
        log_warn "  sudo nginx -t"
        log_warn "  sudo systemctl reload nginx"
        log_warn ""
        log_warn "Option 3: Add configuration manually to existing nginx config:"
        print_nginx_location_block
        log_warn ""
        log_warn "After creating the config file, you can run this deploy script again"
        log_warn "and it will automatically add the feed configuration."
        log_warn "========================================="
        return 1
    fi
    
    # Check if root-level configuration already exists
    if has_feed_location "$config_file"; then
        log_info "Root-level static serving configuration already exists in nginx config"
        return 0
    fi
    
    # Ask for confirmation before modifying
    log_info "The root-level static serving configuration is missing from the nginx config"
    if [ "$AUTO_CONFIRM" = true ]; then
        log_info "Auto-confirm mode: adding root-level static serving configuration automatically..."
    else
        read -p "Do you want to add it automatically? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_warn "Skipping nginx config update. Please add manually:"
            print_nginx_location_block
            return 1
        fi
    fi
    
    # Add the location block
    if add_feed_location "$config_file"; then
        log_info "nginx config updated successfully"
        return 0
    else
        log_warn "Failed to automatically update nginx config"
        log_warn "Please add the location block manually:"
        print_nginx_location_block
        return 1
    fi
}

# Print just the configuration block (for manual addition)
print_nginx_location_block() {
    log_info "=== Add this configuration to your nginx server config ==="
    cat << EOF

    # Serve static files from dist/client, proxy API routes to Express server
    root $APP_DIR/dist/client;
    index index.html;
    
    location / {
        try_files \$uri \$uri/ @express;
    }
    
    # Proxy API routes to Express server
    location @express {
        proxy_pass http://localhost:$SERVER_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

EOF
    log_info "=== End of configuration block ==="
}

# Reload nginx configuration
reload_nginx() {
    log_info "Reloading nginx configuration..."
    
    if ! command -v nginx &> /dev/null; then
        log_warn "nginx is not installed. Skipping nginx reload."
        return 1
    fi
    
    # Test nginx configuration
    if sudo nginx -t &> /dev/null; then
        # Reload nginx
        sudo systemctl reload nginx 2>/dev/null || sudo service nginx reload 2>/dev/null || {
            log_warn "Failed to reload nginx. You may need to reload it manually."
            log_warn "Run: sudo systemctl reload nginx"
            return 1
        }
        log_info "nginx reloaded successfully"
        return 0
    else
        log_error "nginx configuration test failed. Please fix nginx configuration before reloading."
        log_error "Run: sudo nginx -t"
        return 1
    fi
}

# Main deployment function
main() {
    # Security: Display warning about script execution
    log_warn "========================================="
    log_warn "SECURITY NOTICE"
    log_warn "========================================="
    log_warn "This script will:"
    log_warn "  - Pull code from git"
    log_warn "  - Install dependencies"
    log_warn "  - Build the application"
    log_warn "  - Modify nginx configuration (requires sudo)"
    log_warn "  - Start/restart services"
    log_warn ""
    log_warn "Only proceed if you trust this script and the repository."
    log_warn "========================================="
    
    # Allow skipping the warning in CI environments or with --yes flag
    if [ "$AUTO_CONFIRM" = false ] && ([ -z "${CI:-}" ] || [ "${CI:-}" != "true" ]); then
        read -p "Continue with deployment? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Deployment cancelled by user"
            exit 0
        fi
    elif [ "$AUTO_CONFIRM" = true ]; then
        log_info "Auto-confirm mode: proceeding with deployment..."
    fi
    
    log_info "========================================="
    log_info "Starting deployment for $APP_NAME"
    log_info "========================================="
    log_info "Configuration:"
    log_info "  - App Name: $APP_NAME"
    log_info "  - Server Port: $SERVER_PORT"
    log_info "  - Nginx Site: $NGINX_SITE"
    log_info "  - Build Dir: $BUILD_DIR"
    log_info "========================================="
    
    # Double-check NGINX_SITE is set (shouldn't reach here if not, but be safe)
    if [ -z "$NGINX_SITE" ]; then
        log_error "NGINX_SITE is not set. This is required for deployment."
        log_error "Please set it: export NGINX_SITE=yourdomain.com"
        exit 1
    fi
    
    check_user
    check_prerequisites
    git_pull
    install_dependencies
    build_application
    setup_pm2
    restart_server
    
    log_info "========================================="
    log_info "Deployment completed successfully!"
    log_info "========================================="
    
    # Update nginx configuration (non-fatal)
    log_info "Updating nginx configuration..."
    if update_nginx_config; then
        # Ask if user wants to reload nginx
        if [ "$AUTO_CONFIRM" = true ]; then
            log_info "Auto-confirm mode: reloading nginx automatically..."
            reload_nginx || log_warn "nginx reload failed, but deployment succeeded"
        else
            read -p "Do you want to reload nginx now? (y/N) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                reload_nginx || log_warn "nginx reload failed, but deployment succeeded"
            fi
        fi
    else
        log_warn "nginx configuration was not updated automatically"
        log_warn "Please add the root-level static serving configuration manually (see above)"
    fi
    
    log_info "========================================="
    log_info "Deployment Summary"
    log_info "========================================="
    log_info "Next steps:"
    log_info "1. Verify the server is running: pm2 status"
    log_info "2. Check server logs: pm2 logs $APP_NAME"
    log_info "3. Test the API: curl http://localhost:$SERVER_PORT/posts/rss"
    log_info "4. Verify nginx is serving the app correctly"
    
    if ! has_feed_location "$(find_nginx_config)" 2>/dev/null; then
        log_warn "Remember to add the root-level static serving configuration to nginx if not done automatically"
    fi
}

# Run main function
main "$@"
