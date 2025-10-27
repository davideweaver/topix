# Topix

> Personal headline aggregator with AI-powered importance filtering

Topix is a macOS application that curates important moments from your digital life into a single, consumable RSS feed. Unlike traditional RSS readers that show everything, Topix uses AI to intelligently filter and surface what truly matters to you.

## Features

- 🤖 **AI-Powered Filtering** - Uses Ollama (local) or OpenRouter (remote) to score headline importance
- 📧 **Multi-Source Aggregation** - Email, calendar, news, stocks, and more via extensible plugin system
- 📰 **Standard RSS Output** - Works with any RSS reader (NetNewsWire, Reeder, etc.)
- 🖥️ **Terminal UI** - Rich TUI for browsing and managing headlines
- 🔐 **Secure** - Credentials stored in macOS Keychain with Touch ID/Face ID support
- 💾 **Portable** - Single SQLite database, easy backup
- 🍺 **Homebrew Install** - Simple installation: `brew install topix`

## Installation

### Prerequisites

- macOS (Apple Silicon)
- Optional: [Ollama](https://ollama.ai) for local LLM (recommended)

### Install via Homebrew

```bash
# Add tap (personal tap for now)
brew tap dweaver/topix

# Install topix
brew install topix

# Run setup wizard
topix setup
```

## Quick Start

```bash
# Run interactive setup wizard
topix setup

# Start the service
topix start

# Browse headlines in TUI
topix

# View status
topix status

# Add RSS feed to your reader
http://localhost:3000/feed.xml
```

## Usage

### Service Management

```bash
topix start          # Start service as background daemon
topix start --foreground  # Start in foreground (for debugging)
topix stop           # Stop background service
topix restart        # Restart service
topix status         # Show service status
topix logs           # View service logs (last 50 lines)
topix logs -f        # Follow logs in real-time (like tail -f)
topix logs -n 100    # View last 100 lines
```

The service runs as a background daemon and logs all output to:
```
~/Library/Application Support/topix/logs/topix.log
```

### Plugin Management

```bash
topix plugin list              # List all plugins
topix plugin enable weather    # Enable a plugin
topix plugin disable weather   # Disable a plugin
topix plugin config weather    # Configure plugin (interactive)
```

### Authentication

```bash
topix auth add email           # Add OAuth2 credentials (opens browser)
topix auth add news --api-key YOUR_KEY  # Add API key
topix auth list                # List configured auth
topix auth revoke email        # Revoke credentials
```

### Configuration

```bash
topix config get llm.provider  # Get config value
topix config set llm.provider ollama  # Set config value
topix prefs show               # Show all preferences
topix prefs edit               # Edit preferences in $EDITOR
```

### Headlines

```bash
topix                    # Open TUI (default)
topix headlines          # List recent headlines (CLI)
topix fetch              # Manually fetch from all plugins
topix fetch --plugin email  # Fetch from specific plugin
```

## Configuration

Topix stores all data in `~/Library/Application Support/topix/`:

```
~/Library/Application Support/topix/
├── topix.db          # SQLite database (headlines, configs, preferences)
├── config.json       # User preferences
├── logs/             # Application and plugin logs
└── plugins/          # User-installed plugins
```

### LLM Configuration

Topix supports multiple LLM providers:

**Ollama (Local, Recommended):**
```bash
# Install Ollama
curl https://ollama.ai/install.sh | sh

# Pull model
ollama pull llama3.2:3b

# Topix will auto-detect and use it
```

**OpenRouter (Remote, Fallback):**
```bash
# Set API key
topix config set llm.provider openrouter
topix config set llm.openrouter.apiKey YOUR_KEY
topix config set llm.openrouter.model meta-llama/llama-3.1-8b-instruct
```

## Plugin System

Topix uses a plugin architecture for data sources. Built-in plugins include:

- **Weather** - Current conditions, forecasts, and severe weather alerts (Open-Meteo API)
- **Email** - Gmail, Outlook, IMAP (planned)
- **Calendar** - Google Calendar, CalDAV (planned)
- **News** - NewsAPI, RSS feeds (planned)
- **Stocks** - Alpha Vantage, Yahoo Finance (planned)
- **Bible** - Daily verses (planned)

### Weather Plugin

The Weather plugin fetches weather data from the free Open-Meteo API (no API key required).

**Features:**
- Current weather conditions
- 3-day forecast
- Severe weather alerts (thunderstorms, heavy rain/snow)
- Temperature extremes (heat warnings, freezing conditions)
- Active precipitation alerts
- Configurable location and temperature unit

**Configuration:**

```bash
# Enable the weather plugin
./dtopix plugin enable weather

# Configure location interactively
./dtopix plugin config weather
```

When you run `./dtopix plugin config weather`, you'll be prompted to configure:
- **Latitude** (e.g., 40.7128 for New York City)
- **Longitude** (e.g., -74.0060 for New York City)
- **Location name** (e.g., "New York, NY")
- **Temperature Unit** (fahrenheit or celsius)
- **Fetch Schedule** (in minutes, e.g., 15 for every 15 minutes)

The command shows your current configuration (if any) and prompts for each field with smart defaults. It validates your input before saving.

**Configuring Fetch Frequency:**
You can control how often the weather plugin fetches headlines by specifying the number of minutes between fetches (default: 15 minutes). For example:
- **15** - Fetch every 15 minutes (default)
- **30** - Fetch every 30 minutes
- **60** - Fetch every hour
- **120** - Fetch every 2 hours

Default settings (if not configured):
- **Location:** San Francisco, CA
- **Latitude:** 37.7749
- **Longitude:** -122.4194
- **Temperature Unit:** Fahrenheit

**Automatic Fetching:**

When the service is running, the Weather plugin automatically fetches headlines based on its configured schedule (default: every 15 minutes). The scheduler runs in the background and logs each execution:

```bash
# Start the service (scheduler starts automatically)
./dtopix start

# The weather plugin will fetch automatically every 15 minutes
# You'll see logs like:
# ⏰ [10/25/2025, 3:38:00 PM] Running scheduled fetch: Weather
# ✓ Fetched 2 headlines from Weather
```

**Manual Fetching:**

You can also manually fetch weather headlines at any time:

```bash
# Fetch from weather plugin
./dtopix fetch --plugin weather

# View all headlines (including non-important ones)
./dtopix headlines --all

# View only important headlines (severe weather, extremes)
./dtopix headlines
```

**Importance Scoring:**

The Weather plugin marks certain conditions as important:
- **Severe weather** (thunderstorms, heavy rain/snow) - Score: 0.9
- **Extreme temperatures** (>100°F or <10°F) - Score: 0.8-0.9
- **Active precipitation** - Score: 0.5
- **Regular updates** (current conditions, forecasts) - Score: 0.3-0.4 (not important)

### Creating Custom Plugins

See [Plugin Development Guide](docs/plugin-development.md) for details.

## Development

### Setup

```bash
# Clone repo
git clone https://github.com/dweaver/topix.git
cd topix

# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Package as binary
npm run build:pkg
```

### Development CLI Wrapper

For convenience during development, use the `dtopix` wrapper script instead of typing `node dist/index.js`:

```bash
# Build first
npm run build

# Then use the wrapper for any command
./dtopix start
./dtopix status
./dtopix plugin list
./dtopix fetch --plugin weather
./dtopix headlines --all

# The wrapper forwards all arguments to the compiled CLI
```

### Project Structure

```
topix/
├── src/
│   ├── index.ts           # Entry point
│   ├── plugins/           # Built-in plugins
│   ├── managers/          # Core managers (plugin, auth, scheduler)
│   ├── models/            # Data models
│   ├── utils/             # Utility functions
│   ├── tui/               # Terminal UI components (ink)
│   ├── api/               # REST API
│   ├── llm/               # LLM providers (Ollama, OpenRouter)
│   └── auth/              # Authentication (Keychain, OAuth2)
├── test/                  # Tests
├── scripts/               # Build and release scripts
└── docs/                  # Documentation
```

## Architecture

- **Language:** TypeScript
- **Runtime:** Node.js 20+ (embedded in binary via pkg)
- **Database:** SQLite (better-sqlite3)
- **LLM:** Ollama (local) / OpenRouter (remote) / Rule-based
- **Auth:** macOS Keychain (keytar)
- **TUI:** ink (React for terminal)
- **Distribution:** Homebrew

## Roadmap

- ✅ **v0.1 (MVP)** - Core functionality, 3 plugins, CLI
- 🚧 **v1.0** - Full TUI, 5+ plugins, setup wizard
- 📋 **v2.0** - Wails menu bar app, 10+ plugins, plugin marketplace

See [PRD](docs/PRD.md) for full roadmap.

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Author

Dave Weaver ([@dweaver](https://github.com/dweaver))

## Acknowledgments

- Inspired by RSS readers, but with AI-powered curation
- Built with TypeScript, SQLite, and Ollama
- TUI powered by [ink](https://github.com/vadimdemedes/ink)
