# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Topix is a personal headline aggregator with AI-powered importance filtering for macOS. It uses a plugin architecture to aggregate content from multiple sources (email, calendar, news, etc.) and uses LLMs (Ollama/OpenRouter) to score importance, outputting a curated RSS feed.

**Key Technologies:**
- TypeScript 5+ with strict mode
- Node.js 20+ (embedded in binary via pkg)
- SQLite (better-sqlite3) for data storage
- Commander.js for CLI
- ink (React for terminal) for TUI
- Express for HTTP API
- Ollama (local) or OpenRouter (remote) for LLM scoring
- keytar for macOS Keychain integration

**Distribution:** Standalone binary via Homebrew tap (dweaver/topix)

## Common Commands

### Development

```bash
# Install dependencies
npm install

# Development mode (ts-node)
npm run dev

# Build TypeScript to dist/
npm run build

# Package as standalone binary (~50MB)
npm run build:pkg

# Run tests
npm test
npm run test:watch
npm run test:coverage

# Linting and formatting
npm run lint
npm run lint:fix
npm run format

# Type checking
npm run typecheck
```

### Running the Application

```bash
# Start service (after build)
npm start

# Or run directly in dev mode
npm run dev

# Run specific commands
node dist/index.js start
node dist/index.js setup
node dist/index.js plugin list
```

## Project Structure

```
src/
├── index.ts              # CLI entry point with Commander.js commands
├── plugins/              # Built-in plugins (implement TopixPlugin interface)
│   └── example-plugin.ts # Template showing plugin interface
├── managers/             # Core managers (PluginManager, AuthManager, Scheduler)
├── models/
│   └── types.ts          # All TypeScript type definitions
├── utils/                # Utility functions
├── tui/                  # Terminal UI components (ink/React)
├── api/                  # REST API routes (Express)
├── llm/                  # LLM providers (OllamaProvider, OpenRouterProvider)
└── auth/                 # Authentication (OAuth2, API keys, Keychain)

test/
├── setup.ts              # Jest configuration
├── unit/                 # Unit tests
└── integration/          # Integration tests
```

## Architecture

### Plugin System

All plugins implement the `TopixPlugin` interface (see `src/models/types.ts`):

```typescript
interface TopixPlugin {
  // Metadata
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly author: string;

  // Lifecycle
  initialize(config: PluginConfig): Promise<void>;
  shutdown(): Promise<void>;

  // Core functionality
  fetchHeadlines(context: FetchContext): Promise<Headline[]>;

  // Configuration
  getConfigSchema(): ConfigSchema;
  validateConfig(config: unknown): ValidationResult;

  // Authentication
  getAuthRequirements(): AuthRequirement | null;
  setAuthCredentials(credentials: AuthCredentials): void;

  // Health
  healthCheck(): Promise<HealthStatus>;
}
```

**Plugin Discovery:**
- Built-in plugins: Compiled into binary from `src/plugins/`
- User plugins: Loaded from `~/Library/Application Support/topix/plugins/`

**Creating a New Plugin:**
1. Copy `src/plugins/example-plugin.ts` as template
2. Implement all `TopixPlugin` interface methods
3. Export plugin instance: `export default new YourPlugin()`
4. Add tests in `test/unit/plugins/`
5. Register in plugin manager (when implemented)

### Data Storage

**SQLite Database:** `~/Library/Application Support/topix/topix.db`

**Key Tables:**
- `headlines` - All fetched headlines with importance scores
- `plugin_configs` - Plugin settings and schedules (cron)
- `auth` - Encrypted authentication credentials
- `user_preferences` - Global settings (feed config, LLM settings)

**Database Schema:** See PRD.md lines 481-559 for complete SQL schema

### Authentication

**Credential Storage:**
- **Primary:** macOS Keychain via `keytar` (Touch ID/Face ID support)
- **Fallback:** Encrypted JSON with master password

**Supported Auth Types:**
- OAuth2 (Gmail, Google Calendar, Outlook)
- API Key (NewsAPI, Alpha Vantage)
- Basic Auth (IMAP)
- Custom (plugin-defined)

**OAuth2 Flow:**
1. Plugin declares auth requirements via `getAuthRequirements()`
2. CLI opens browser to consent screen
3. Local callback server receives auth code
4. Exchange code for tokens
5. Store encrypted in Keychain/SQLite
6. Auto-refresh tokens before expiry

### LLM Integration

**Importance Scoring Pipeline:**
1. Plugin generates headline with metadata
2. Headline + user context sent to LLM
3. LLM returns score (0.0-1.0) and reasoning
4. Score multiplied by plugin's `baseWeight`
5. If score > threshold, include in RSS feed

**LLM Providers (in order of preference):**
1. **Ollama** (local, private): `llama3.2:3b` @ `http://localhost:11434`
2. **OpenRouter** (remote): `meta-llama/llama-3.1-8b-instruct`
3. **Rule-based** (fallback): Keyword matching, time-based urgency

**LLM Configuration:**
- Stored in `user_preferences` table (key: 'llm')
- Configurable via `topix config set llm.provider [ollama|openrouter|none]`
- Auto-detection: Setup wizard checks for Ollama on first run

### TypeScript Configuration

**Path Aliases (tsconfig.json):**
```typescript
import { TopixPlugin } from '@/models/types';
import EmailPlugin from '@plugins/email-plugin';
import { AuthManager } from '@managers/auth-manager';
import { formatDate } from '@utils/date';
```

**Strict Mode:** All strict checks enabled
- No implicit any
- Unused locals/parameters flagged
- Explicit return types recommended

### Binary Packaging

**pkg Configuration (package.json):**
- Target: `node20-macos-arm64` (Apple Silicon)
- Output: `dist/topix` (~50MB with Node.js embedded)
- Assets: Include `src/plugins/**/*` for user plugins
- Compression: GZip

**Homebrew Distribution:**
- Personal tap: `dweaver/homebrew-topix`
- Formula: `topix.rb`
- Install: `brew tap dweaver/topix && brew install topix`

## Testing Guidelines

**Test Structure:**
- Unit tests: Test individual classes/functions in isolation
- Integration tests: Test plugin flows end-to-end
- Mock external dependencies (APIs, LLMs, Keychain)

**Running Tests:**
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report (target: >80%)
```

**Test Environment:**
- `NODE_ENV=test`
- `TOPIX_DATA_DIR=/tmp/topix-test`
- Console methods mocked to reduce noise

## Important Implementation Notes

### Data Directory

All user data stored in: `~/Library/Application Support/topix/`
```
topix/
├── topix.db          # SQLite database
├── config.json       # User preferences
├── logs/             # Application and plugin logs
└── plugins/          # User-installed plugins
```

### Service Lifecycle

1. **Start:** Launch HTTP server (port 3000), initialize database, load plugins
2. **Scheduler:** Execute plugins based on cron schedules
3. **Fetch:** Plugin → fetchHeadlines → LLM scoring → SQLite storage
4. **RSS Feed:** Query SQLite → Generate RSS 2.0 → Serve at `/feed.xml`
5. **Stop:** Cleanup, close connections, persist state

### CLI Commands

**Service Management:**
- `topix start` - Start background service
- `topix stop` - Stop background service
- `topix status` - Show service status

**Setup:**
- `topix setup` - Interactive setup wizard
- `topix setup --reconfigure` - Re-run setup
- `topix setup --continue` - Resume incomplete setup

**Plugin Management:**
- `topix plugin list` - List all plugins
- `topix plugin enable <id>` - Enable plugin
- `topix plugin disable <id>` - Disable plugin
- `topix plugin config <id>` - Configure plugin (interactive)

**Authentication:**
- `topix auth add <plugin-id>` - Add OAuth2/credentials
- `topix auth add <plugin-id> --api-key KEY` - Add API key
- `topix auth list` - List configured auth
- `topix auth revoke <plugin-id>` - Revoke credentials

**Headlines:**
- `topix` - Open TUI (default)
- `topix headlines` - List recent headlines (CLI)
- `topix fetch` - Manually fetch from all plugins
- `topix fetch --plugin <id>` - Fetch from specific plugin

**Configuration:**
- `topix config get <key>` - Get config value
- `topix config set <key> <value>` - Set config value

### TUI (Terminal UI)

**Framework:** ink (React for terminal)

**Key Features:**
- Headline browser with keyboard navigation (j/k, arrows)
- Filter by category, plugin, date, importance
- Mark as read/starred/archived
- Plugin manager (enable/disable, trigger fetch)
- Service controls (start/stop/restart)
- Config editor

**Navigation:**
- `h` - Headlines view
- `p` - Plugins view
- `s` - Service view
- `c` - Config view
- `q` - Quit
- `/` - Search
- `?` - Help

## Development Workflow

### Adding a New Plugin

1. **Create plugin file:** `src/plugins/my-plugin.ts`
2. **Implement interface:** Extend `TopixPlugin` interface
3. **Define config schema:** Return schema in `getConfigSchema()`
4. **Implement fetchHeadlines:** Main logic to fetch data
5. **Add auth requirements:** If API requires credentials
6. **Add tests:** `test/unit/plugins/my-plugin.test.ts`
7. **Document:** Update README.md with plugin info

**Example:**
```typescript
export class MyPlugin implements TopixPlugin {
  readonly id = 'my-plugin';
  readonly name = 'My Plugin';
  readonly description = 'Fetches data from My Service';
  readonly version = '0.1.0';
  readonly author = 'Your Name';

  async initialize(config: PluginConfig): Promise<void> {
    // Setup plugin
  }

  async fetchHeadlines(context: FetchContext): Promise<Headline[]> {
    // Fetch from API
    // Return array of headlines
  }

  // ... implement other interface methods
}

export default new MyPlugin();
```

### Adding API Endpoints

1. Create route handler in `src/api/routes/`
2. Register route in Express app
3. Add request validation
4. Return JSON responses
5. Add tests

### Adding LLM Provider

1. Implement `LLMProvider` interface in `src/llm/`
2. Add provider to LLM config type
3. Update LLM gateway to route to provider
4. Add provider-specific config
5. Add tests

## Current Implementation Status

**Completed:**
- ✅ Project structure and TypeScript setup
- ✅ Type definitions (`src/models/types.ts`)
- ✅ CLI skeleton with Commander.js (`src/index.ts`)
- ✅ Example plugin template (`src/plugins/example-plugin.ts`)
- ✅ Test setup with Jest
- ✅ Package.json with all dependencies
- ✅ pkg configuration for binary packaging
- ✅ **Phase 1: Core foundation**
  - ✅ Database layer (`src/database/topix-database.ts`) - 33 tests passing
  - ✅ Plugin Manager (`src/managers/plugin-manager.ts`) - 18 tests passing
  - ✅ Auth Manager (`src/managers/auth-manager.ts`) - 14 tests passing
  - ✅ Config Manager (`src/managers/config-manager.ts`) - 14 tests passing
  - ✅ Service Manager (`src/managers/service-manager.ts`) - 14 tests passing
  - ✅ CLI commands fully implemented and wired to managers
  - ✅ Service lifecycle (start/stop/restart/status)
  - ✅ HTTP server with REST API endpoints
  - ✅ RSS 2.0 feed generation
- ✅ **First Working Plugin: Weather** (`src/plugins/weather-plugin.ts`)
  - ✅ Fetches weather data from Open-Meteo API (no auth required)
  - ✅ Generates headlines for current conditions, forecasts, severe weather
  - ✅ Importance scoring (0.3-0.9 based on severity)
  - ✅ Configurable location and temperature unit
  - ✅ 13 tests passing
  - ✅ End-to-end testing complete

**Test Coverage:**
- Total: 92 tests passing
- Database: 33 tests
- Plugin Manager: 18 tests
- Auth Manager: 14 tests
- Config Manager: 14 tests
- Service Manager: 14 tests
- Weather Plugin: 13 tests

- ✅ **Phase 8: Scheduling** (`src/managers/scheduler.ts`)
  - ✅ Automatic plugin execution based on cron schedules
  - ✅ Background scheduler runs with service
  - ✅ Per-plugin scheduling (configurable via database)
  - ✅ Logging of scheduled executions
  - ✅ Graceful start/stop with service lifecycle

**Next Steps (see PRD.md for full roadmap):**
- Phase 0: Homebrew tap and formula
- Phase 2: Authentication system (OAuth2, Keychain) - *foundation complete, need OAuth2 flows*
- Phase 3: More plugins (email, calendar, news)
- Phase 4: LLM integration (Ollama, OpenRouter)
- Phase 6: Setup wizard
- Phase 7: Terminal UI (TUI)
- Phase 10: Additional testing and docs

## Code Style

- **TypeScript:** Strict mode, explicit return types, no `any`
- **Formatting:** Prettier (run `npm run format`)
- **Linting:** ESLint (run `npm run lint`)
- **Naming:** camelCase for variables/functions, PascalCase for classes/interfaces
- **Commits:** Conventional commits (feat:, fix:, docs:, etc.)

## Key Files to Reference

- `docs/Topix PRD.md` - Complete product requirements and architecture
- `src/models/types.ts` - All TypeScript type definitions
- `src/plugins/example-plugin.ts` - Plugin template and documentation
- `CONTRIBUTING.md` - Contributing guidelines
- `README.md` - User-facing documentation
- `package.json` - Dependencies and scripts

## Security Considerations

- **Credentials:** Never log or commit credentials
- **OAuth2 Tokens:** Auto-refresh before expiry
- **Keychain:** Use keytar for secure credential storage
- **User Plugins:** Warn users about security when installing third-party plugins
- **SQL Injection:** Use parameterized queries with better-sqlite3
- **API Keys:** Store encrypted, never in plain text

## Debugging

**Logs Location:**
- Application logs: `~/Library/Application Support/topix/logs/topix.log`
- Plugin logs: `~/Library/Application Support/topix/logs/plugins/<plugin-id>.log`

**Debug Commands:**
```bash
topix logs                  # View service logs
topix logs --plugin <id>    # View plugin logs
topix debug <plugin-id>     # Debug plugin execution
topix plugin status         # Check plugin health
```

**Common Issues:**
- Ollama not detected: Check `http://localhost:11434/api/tags`
- OAuth2 fails: Check redirect URI matches `http://localhost:3000/auth/callback`
- Plugin errors: Check plugin logs and health status
- Keychain access: Ensure Terminal/VS Code has Keychain access in System Settings

## Resources

- [PRD](docs/Topix%20PRD.md) - Full product requirements document
- [Plugin Development Guide](docs/plugin-development.md) - Detailed plugin creation guide (when created)
- [SQLite Schema](docs/Topix%20PRD.md#L481-L559) - Database schema reference
- [Ollama](https://ollama.ai) - Local LLM runtime
- [OpenRouter](https://openrouter.ai) - Remote LLM API
- [ink](https://github.com/vadimdemedes/ink) - React for terminal
- [Commander.js](https://github.com/tj/commander.js) - CLI framework
