**Created:** October 23, 2025
**Updated:** October 23, 2025
**Project:** Topix - Personal Headline Aggregator
**Status:** Draft
**Target Platform:** macOS (single-user)
**Tech Stack:** TypeScript, Node.js, SQLite, pkg (standalone binary)
**Distribution:** Homebrew (personal tap → official)
**LLM:** Ollama (local) / OpenRouter (remote) / Rule-based (fallback)

---

## Project Vision

Topix is a personal headline aggregation service that curates important moments from your digital life into a single, consumable RSS feed. Unlike traditional RSS readers that show everything, Topix uses AI to intelligently filter and surface what truly matters to you - whether that's an urgent email, an upcoming meeting, a market movement, or a moment of inspiration.

**Core Philosophy:** Your attention is precious. Topix helps you stay informed about what matters without drowning in noise.

## Problem Statement

Modern life generates hundreds of notifications, emails, calendar events, and data points daily. Current solutions either:
- Show everything (information overload)
- Use rigid rules (miss important context)
- Require manual curation (time-consuming)

**Topix solves this by:**
- Using LLMs to understand context and importance
- Providing extensible plugin architecture for any data source
- Delivering a single, curated feed via standard RSS

## Goals & Success Metrics

### Primary Goals

1. **Reduce noise:** Only surface genuinely important headlines (< 20 per day)
2. **Stay extensible:** Easy to add new data sources via plugins
3. **Maintain privacy:** All processing local (SQLite + Ollama/OpenRouter)
4. **Universal consumption:** Standard RSS feed works with any reader
5. **Simple installation:** `brew install topix` - no external dependencies
6. **Native macOS experience:** Full TUI, future menu bar app integration

### Success Metrics

- **Precision:** > 90% of headlines marked as "important" by user
- **Coverage:** Capture all user-defined important events
- **Performance:** Headline generation < 5 seconds per source
- **Reliability:** 99.9% uptime for RSS endpoint

## Technical Architecture

### Stack

- **Language:** TypeScript 5+
- **Runtime:** Node.js 20+ (embedded in binary)
- **Database:** SQLite 3 (better-sqlite3)
- **LLM:** Ollama (local) / OpenRouter (remote) / Rule-based
- **Packaging:** pkg (standalone binary, ~50MB)
- **Distribution:** Homebrew (tap: dweaver/topix)
- **CLI Framework:** Commander.js
- **TUI Framework:** ink (React for terminal)
- **Package Manager:** npm/pnpm
- **Testing:** Jest + Supertest
- **Linting:** ESLint + Prettier

### Installation

```bash
# Personal tap (initial distribution)
brew tap dweaver/topix
brew install topix

# Future: Official Homebrew (once stable)
brew install topix
```

**What gets installed:**
- Single binary: `/usr/local/bin/topix` (~50MB, Node.js embedded)
- No external dependencies (Node.js not required)
- Data directory created on first run: `~/Library/Application Support/topix/`

### Data Directory Structure

```
~/Library/Application Support/topix/
├── topix.db                 # SQLite database (headlines, configs, preferences)
├── config.json              # User preferences and global config
├── credentials.json         # Encrypted authentication credentials
├── logs/
│   ├── topix.log           # Application logs
│   └── plugins/            # Per-plugin logs
│       ├── email.log
│       └── calendar.log
└── plugins/                 # User-installed plugins
    └── my-custom-plugin.js
```

### System Components

```
┌─────────────────────────────────────────────────────┐
│               RSS Reader / TUI Interface            │
│       (NetNewsWire, Reeder, or topix TUI)          │
└─────────────────────────────────────────────────────┘
                         │
                         │ HTTP GET /feed.xml
                         │ or topix headlines
                         │
┌─────────────────────────────────────────────────────┐
│              Topix Service (topix binary)           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │ HTTP Server  │  │ TUI          │  │ Plugin   │  │
│  │ (RSS Feed)   │  │ (ink)        │  │ Manager  │  │
│  └──────────────┘  └──────────────┘  └──────────┘  │
│         │                  │                │        │
│         └──────────────────┴────────────────┘        │
│                            │                         │
│  ┌─────────────────────────────────────────────┐    │
│  │   SQLite Database (topix.db)                │    │
│  │   - headlines  - plugin_configs             │    │
│  │   - auth       - user_preferences           │    │
│  └─────────────────────────────────────────────┘    │
│                            │                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │ LLM Gateway  │◄─┤ Ollama       │  │OpenRouter│  │
│  │              │  │ (local)      │  │ (remote) │  │
│  └──────────────┘  └──────────────┘  └──────────┘  │
└─────────────────────────────────────────────────────┘
                         │
                         │ Plugin API
                         │
┌─────────────────────────────────────────────────────┐
│                  Plugin Ecosystem                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │  Email   │  │ Calendar │  │  News    │          │
│  └──────────┘  └──────────┘  └──────────┘          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │  Stock   │  │  Bible   │  │ Weather  │  ...     │
│  └──────────┘  └──────────┘  └──────────┘          │
└─────────────────────────────────────────────────────┘
                         │
                         │ Auth APIs (OAuth2/API Keys)
                         │
┌─────────────────────────────────────────────────────┐
│              External Services                      │
│  (Gmail, Outlook, Calendar, News APIs, etc.)        │
└─────────────────────────────────────────────────────┘
```

### Data Flow

1. **Service Startup:** `topix start` launches HTTP server and scheduler
2. **Plugin Execution:** Scheduler triggers plugins based on their configured intervals
3. **Data Fetching:** Plugins fetch data from external sources (with auth)
4. **Headline Generation:** Plugins create headline objects with metadata
5. **LLM Filtering:** Ollama/OpenRouter evaluates importance based on user preferences
6. **Storage:** Headlines stored in SQLite with importance scores
7. **RSS Generation:** Headlines formatted as RSS feed items
8. **Consumption:** User's RSS reader polls `/feed.xml` or browses via `topix` TUI

## Plugin System Design

### Plugin Interface

Every plugin implements the `TopixPlugin` interface:

```typescript
interface TopixPlugin {
  // Plugin metadata
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly author: string;

  // Lifecycle hooks
  initialize(config: PluginConfig): Promise<void>;
  shutdown(): Promise<void>;

  // Core functionality
  fetchHeadlines(context: FetchContext): Promise<Headline[]>;

  // Configuration
  getConfigSchema(): ConfigSchema;
  validateConfig(config: unknown): ValidationResult;

  // Authentication (if needed)
  getAuthRequirements(): AuthRequirement | null;
  setAuthCredentials(credentials: AuthCredentials): void;

  // Health check
  healthCheck(): Promise<HealthStatus>;
}
```

### Plugin Configuration

Plugins are configured via JSON:

```json
{
  "pluginId": "email-plugin",
  "enabled": true,
  "schedule": "*/5 * * * *",
  "config": {
    "account": "work@example.com",
    "folders": ["INBOX"],
    "lookbackMinutes": 60,
    "markAsRead": false
  },
  "auth": {
    "type": "oauth2",
    "credentials": {
      "accessToken": "...",
      "refreshToken": "...",
      "expiresAt": "2025-10-24T00:00:00Z"
    }
  },
  "importance": {
    "llmEnabled": true,
    "baseWeight": 1.0,
    "rules": [
      {
        "condition": "from contains 'boss@example.com'",
        "weight": 2.0
      }
    ]
  }
}
```

### Plugin Discovery

Plugins are loaded from:
- Built-in plugins (compiled into binary)
- `~/Library/Application Support/topix/plugins/` (user-installed plugins)

Plugin discovery happens at startup:

```typescript
class PluginManager {
  async loadPlugins(): Promise<void> {
    // Load built-in plugins from binary
    // Scan user plugin directory
    // Validate plugin exports (implements TopixPlugin interface)
    // Initialize each plugin with config from SQLite
    // Register with scheduler based on cron schedule
  }
}
```

### Plugin Types

**By Data Source:**
- **API Plugins:** Fetch from REST/GraphQL APIs (news, stocks, weather)
- **Local Plugins:** Read from local system (calendar, files, databases)
- **Email Plugins:** Connect to email providers (Gmail, Outlook, IMAP)
- **Database Plugins:** Query databases (PostgreSQL, MySQL, MongoDB)
- **File Plugins:** Monitor files/directories (logs, downloads)

**By Authentication:**
- **No Auth:** Public APIs, local data
- **API Key:** Simple token-based auth
- **OAuth2:** Gmail, GitHub, Twitter, etc.
- **Username/Password:** IMAP, databases
- **Custom:** Proprietary auth schemes

## Authentication Strategy

### Challenge: Per-Plugin Authentication

Each plugin may require different auth mechanisms:
- Email: OAuth2 (Gmail), OAuth2 (Outlook), IMAP (generic)
- Calendar: CalDAV, OAuth2 (Google Calendar)
- News: API keys (NewsAPI, Alpha Vantage)
- GitHub: Personal Access Token
- Weather: API key (OpenWeatherMap)

### Solution: Auth Provider System

**Architecture:**

```typescript
interface AuthProvider {
  readonly type: 'oauth2' | 'apikey' | 'basic' | 'custom';

  // Initiate auth flow (for interactive auth)
  initiateAuth(): Promise<AuthInitiation>;

  // Handle callback (for OAuth2)
  handleCallback(code: string, state: string): Promise<AuthCredentials>;

  // Validate credentials
  validateCredentials(credentials: AuthCredentials): Promise<boolean>;

  // Refresh credentials (for OAuth2)
  refreshCredentials(credentials: AuthCredentials): Promise<AuthCredentials>;

  // Encrypt/decrypt credentials
  encrypt(credentials: AuthCredentials): Promise<string>;
  decrypt(encrypted: string): Promise<AuthCredentials>;
}
```

**OAuth2 Flow:**

1. **Configuration Phase:**
   - User provides client_id/client_secret (from Google/Microsoft/etc.)
   - Stored in SQLite `auth` table (encrypted)

2. **Authorization Phase:**
   - CLI command: `topix auth add email-plugin`
   - Opens browser to consent screen
   - User authorizes access
   - Callback to local server (http://localhost:3000/auth/callback)
   - Exchange code for tokens
   - Store encrypted tokens in SQLite

3. **Usage Phase:**
   - Plugin requests credentials from auth manager
   - Auth manager queries SQLite, decrypts and returns tokens
   - Plugin uses tokens for API calls
   - Auth manager handles token refresh automatically

**API Key Flow:**

1. User runs: `topix auth add news-plugin --api-key YOUR_KEY`
2. Key encrypted and stored in SQLite `auth` table
3. Plugin retrieves decrypted key at runtime

**IMAP/Basic Auth Flow:**

1. User runs: `topix auth add email-plugin --username user --password pass`
2. Credentials encrypted and stored in SQLite
3. Plugin retrieves decrypted credentials at runtime

### Security Considerations

- **Encryption at rest:** All credentials encrypted with user-provided master password
- **Memory protection:** Credentials cleared from memory after use
- **Token refresh:** OAuth2 tokens auto-refreshed before expiry
- **Scoped access:** Request minimal OAuth2 scopes (read-only when possible)
- **Local storage:** All credentials stored locally (never transmitted)

### Auth Manager Implementation

```typescript
import Database from 'better-sqlite3';

class AuthManager {
  constructor(
    private encryptionKey: string,
    private db: Database.Database
  ) {}

  async addCredentials(
    pluginId: string,
    authType: AuthType,
    credentials: AuthCredentials
  ): Promise<void> {
    // Encrypt credentials
    const encrypted = this.encrypt(credentials);
    // Store in SQLite auth table
    this.db.prepare(
      'INSERT OR REPLACE INTO auth (plugin_id, auth_type, credentials) VALUES (?, ?, ?)'
    ).run(pluginId, authType, encrypted);
  }

  async getCredentials(pluginId: string): Promise<AuthCredentials | null> {
    // Fetch from SQLite
    const row = this.db.prepare(
      'SELECT credentials FROM auth WHERE plugin_id = ?'
    ).get(pluginId);
    if (!row) return null;
    // Decrypt and return
    return this.decrypt(row.credentials);
  }

  async refreshCredentials(pluginId: string): Promise<void> {
    // Get current credentials
    const creds = await this.getCredentials(pluginId);
    // Use refresh token to get new access token
    const newCreds = await this.oauth2Provider.refresh(creds);
    // Update in SQLite
    await this.addCredentials(pluginId, 'oauth2', newCreds);
  }

  async revokeCredentials(pluginId: string): Promise<void> {
    // Delete from SQLite
    this.db.prepare('DELETE FROM auth WHERE plugin_id = ?').run(pluginId);
    // Optionally revoke with provider
  }
}
```

## Data Models

### Headline

```typescript
interface Headline {
  id: string;                    // UUID
  pluginId: string;              // Source plugin
  title: string;                 // Headline text (required)
  description?: string;          // Optional longer description
  link?: string;                 // Optional link to source
  pubDate: Date;                 // Publication/event date
  createdAt: Date;               // When headline was created

  // Categorization
  category: string;              // Plugin-defined category
  tags: string[];                // Searchable tags

  // Importance scoring
  importanceScore: number;       // 0.0 - 1.0 (LLM-generated)
  importanceReason?: string;     // Why it's important (LLM)
  isImportant: boolean;          // Above threshold?

  // Metadata
  metadata: Record<string, any>; // Plugin-specific data

  // Status
  read: boolean;                 // Marked as read?
  starred: boolean;              // User starred?
  archived: boolean;             // Removed from feed?
}
```

### Plugin Config

```typescript
interface PluginConfig {
  pluginId: string;
  enabled: boolean;
  schedule: string;              // Cron expression
  config: Record<string, any>;   // Plugin-specific config
  auth?: {
    type: AuthType;
    credentials: EncryptedString;
  };
  importance: {
    llmEnabled: boolean;
    baseWeight: number;          // 0.0 - 2.0 (multiplier)
    threshold: number;           // 0.0 - 1.0 (min score to include)
    rules: ImportanceRule[];
  };
  lastRun?: Date;
  lastError?: string;
}
```

### User Preferences

```typescript
interface UserPreferences {
  // Feed settings
  feed: {
    title: string;
    description: string;
    maxItems: number;            // Max items in RSS feed
    ttl: number;                 // Time-to-live (minutes)
  };

  // Importance scoring
  importance: {
    defaultThreshold: number;    // Global threshold (0.0 - 1.0)
    llmModel: string;            // Ollama model name
    llmPrompt: string;           // Custom prompt template
    context: string;             // User context for LLM
  };

  // Notifications (future)
  notifications: {
    enabled: boolean;
    urgentThreshold: number;     // Send notification if score > this
  };
}
```

### SQLite Schema

**headlines**
```sql
CREATE TABLE headlines (
  id TEXT PRIMARY KEY,              -- UUID
  plugin_id TEXT NOT NULL,          -- Source plugin
  title TEXT NOT NULL,              -- Headline text
  description TEXT,                 -- Optional longer description
  link TEXT,                        -- Optional link to source
  pub_date DATETIME NOT NULL,       -- Publication/event date
  created_at DATETIME NOT NULL,     -- When headline was created

  -- Categorization
  category TEXT NOT NULL,           -- Plugin-defined category
  tags TEXT,                        -- JSON array of tags

  -- Importance scoring
  importance_score REAL,            -- 0.0 - 1.0 (LLM-generated)
  importance_reason TEXT,           -- Why it's important (LLM)
  is_important BOOLEAN NOT NULL,    -- Above threshold?

  -- Metadata
  metadata TEXT,                    -- JSON object, plugin-specific data

  -- Status
  read BOOLEAN DEFAULT 0,           -- Marked as read?
  starred BOOLEAN DEFAULT 0,        -- User starred?
  archived BOOLEAN DEFAULT 0        -- Removed from feed?
);

CREATE INDEX idx_plugin_id ON headlines(plugin_id);
CREATE INDEX idx_pub_date ON headlines(pub_date);
CREATE INDEX idx_created_at ON headlines(created_at);
CREATE INDEX idx_is_important ON headlines(is_important);
CREATE INDEX idx_archived ON headlines(archived);
```

**plugin_configs**
```sql
CREATE TABLE plugin_configs (
  plugin_id TEXT PRIMARY KEY,       -- Unique plugin identifier
  enabled BOOLEAN NOT NULL,         -- Is plugin enabled?
  schedule TEXT NOT NULL,           -- Cron expression
  config TEXT NOT NULL,             -- JSON object, plugin-specific config

  -- Importance settings
  llm_enabled BOOLEAN DEFAULT 1,
  base_weight REAL DEFAULT 1.0,     -- 0.0 - 2.0 (multiplier)
  threshold REAL DEFAULT 0.5,       -- 0.0 - 1.0 (min score to include)
  importance_rules TEXT,            -- JSON array of ImportanceRule objects

  -- Status tracking
  last_run DATETIME,
  last_error TEXT
);
```

**auth**
```sql
CREATE TABLE auth (
  plugin_id TEXT PRIMARY KEY,       -- Plugin this auth is for
  auth_type TEXT NOT NULL,          -- 'oauth2', 'apikey', 'basic', 'custom'
  credentials TEXT NOT NULL,        -- Encrypted credentials JSON
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
```

**user_preferences**
```sql
CREATE TABLE user_preferences (
  key TEXT PRIMARY KEY,             -- Preference key
  value TEXT NOT NULL               -- JSON value
);

-- Stored preferences:
-- 'feed' -> { title, description, maxItems, ttl }
-- 'importance' -> { defaultThreshold, llmModel, llmPrompt, context }
-- 'llm' -> { provider: 'ollama'|'openrouter', model, endpoint, apiKey }
-- 'notifications' -> { enabled, urgentThreshold }
```

## Core Features

### 1. Plugin Management

**Features:**
- List available plugins
- Enable/disable plugins
- Configure plugin settings
- View plugin status and health
- Install user-defined plugins

**CLI Commands:**
```bash
topix plugin list                          # List all plugins
topix plugin enable email-plugin           # Enable plugin
topix plugin disable email-plugin          # Disable plugin
topix plugin config email-plugin           # Configure plugin
topix plugin status                        # Show all plugin statuses
topix plugin install ~/my-plugin.js        # Install custom plugin
```

### 2. Authentication Management

**Features:**
- Add credentials for plugins
- List configured auth
- Revoke credentials
- Refresh OAuth tokens
- Test authentication

**CLI Commands:**
```bash
topix auth add email-plugin                # Start OAuth2 flow
topix auth add news-plugin --api-key KEY   # Add API key
topix auth list                            # List configured auth
topix auth revoke email-plugin             # Revoke credentials
topix auth test email-plugin               # Test authentication
topix auth refresh email-plugin            # Force token refresh
```

### 3. Headline Generation

**Features:**
- Fetch headlines from all enabled plugins
- Score importance with LLM
- Filter by threshold
- Deduplicate similar headlines
- Category and tag assignment

**CLI Commands:**
```bash
topix fetch                                # Fetch from all plugins
topix fetch --plugin email-plugin          # Fetch from one plugin
topix fetch --force                        # Ignore schedule, fetch now
```

### 4. RSS Feed

**Features:**
- Standard RSS 2.0 format
- Configurable feed metadata
- Item limit (e.g., last 50 headlines)
- TTL for feed freshness
- Proper encoding and escaping

**Endpoint:**
```
GET http://localhost:3000/feed.xml
```

**Sample Output:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Topix - Your Personal Headlines</title>
    <link>http://localhost:3000</link>
    <description>Curated headlines from your digital life</description>
    <ttl>30</ttl>
    <item>
      <guid>550e8400-e29b-41d4-a716-446655440000</guid>
      <title>📧 Urgent: Q4 Budget Review Meeting Tomorrow</title>
      <description>Email from boss@example.com about Q4 budget review. Meeting tomorrow at 10am.</description>
      <link>https://mail.google.com/mail/u/0/#inbox/abc123</link>
      <pubDate>Wed, 23 Oct 2025 15:30:00 GMT</pubDate>
      <category>email</category>
    </item>
    <!-- More items... -->
  </channel>
</rss>
```

### 5. LLM Importance Scoring

**Features:**
- Use Ollama for local LLM inference
- Customizable prompt templates
- User context for personalization
- Importance reasoning (explainability)
- Configurable per plugin

**Scoring Process:**
1. Plugin generates headline with metadata
2. Headline sent to LLM with user context
3. LLM returns importance score (0.0 - 1.0) and reasoning
4. Score multiplied by plugin's baseWeight
5. If score > threshold, headline included in feed

**Example Prompt:**
```
You are an AI assistant helping to determine if a headline is important to the user.

User Context:
{userContext}

Headline:
Title: {headline.title}
Description: {headline.description}
Category: {headline.category}
Tags: {headline.tags}
Metadata: {headline.metadata}

Determine if this headline is important to the user. Respond with:
1. A score from 0.0 (not important) to 1.0 (very important)
2. A brief reason for your score (1-2 sentences)

Response format (JSON):
{
  "score": 0.85,
  "reason": "This is urgent because..."
}
```

### 6. Web Dashboard (Future)

**Features:**
- View all headlines (important and filtered)
- Mark as read/starred/archived
- Configure plugins and preferences
- View importance scores and reasons
- Manual fetch triggers
- Auth management UI

## Example Plugins

### Email Plugin

**Purpose:** Surface important emails from configured accounts

**Features:**
- Supports Gmail (OAuth2), Outlook (OAuth2), IMAP (basic auth)
- Filters by folder (INBOX, work, etc.)
- Configurable lookback period
- Importance scoring based on:
  - Sender (VIP detection)
  - Subject keywords (urgent, action required)
  - Time sensitivity (meeting invites, deadlines)
  - Email body content analysis

**Config:**
```json
{
  "account": "work@example.com",
  "provider": "gmail",
  "folders": ["INBOX"],
  "lookbackMinutes": 60,
  "markAsRead": false,
  "vipSenders": ["boss@example.com", "ceo@example.com"]
}
```

**Sample Headline:**
```
Title: "📧 Urgent: Q4 Budget Review Meeting Tomorrow"
Description: "Email from boss@example.com about Q4 budget review"
Link: "https://mail.google.com/mail/u/0/#inbox/abc123"
Category: "email"
Tags: ["work", "urgent", "meeting"]
ImportanceScore: 0.92
```

### Calendar Plugin

**Purpose:** Alert about upcoming meetings and events

**Features:**
- Supports Google Calendar (OAuth2), CalDAV, local calendars
- Configurable time windows (next 2 hours, today, this week)
- Filters by calendar (work, personal)
- Importance scoring based on:
  - Time until event (urgent if < 1 hour)
  - Event type (meeting vs all-day event)
  - Attendees (important people)
  - Keywords in title/description

**Config:**
```json
{
  "calendar": "work@example.com",
  "provider": "google-calendar",
  "lookAheadHours": 2,
  "includeAllDay": false,
  "importantKeywords": ["sprint planning", "1:1", "review"]
}
```

**Sample Headline:**
```
Title: "📅 Sprint Planning in 30 minutes"
Description: "Team meeting with Sarah, John, Mike at 2:00 PM"
Link: "https://calendar.google.com/event?eid=abc123"
Category: "calendar"
Tags: ["work", "meeting", "urgent"]
ImportanceScore: 0.88
```

### News Plugin

**Purpose:** Surface important news headlines

**Features:**
- Supports NewsAPI, RSS feeds, custom sources
- Configurable topics/keywords
- Importance scoring based on:
  - Topic relevance
  - Source credibility
  - Freshness
  - User-defined interests

**Config:**
```json
{
  "provider": "newsapi",
  "topics": ["technology", "artificial intelligence", "web development"],
  "sources": ["techcrunch", "hacker-news"],
  "maxHeadlines": 5
}
```

**Sample Headline:**
```
Title: "🗞️ OpenAI Releases GPT-5 with Major Performance Improvements"
Description: "The new model shows 40% improvement in reasoning tasks..."
Link: "https://techcrunch.com/article/gpt5-release"
Category: "news"
Tags: ["ai", "technology", "openai"]
ImportanceScore: 0.75
```

### Stock Plugin

**Purpose:** Alert on significant market movements

**Features:**
- Supports Alpha Vantage, Yahoo Finance, IEX Cloud
- Configurable watchlist
- Importance scoring based on:
  - Price movement % (> 5% up/down)
  - Volume anomalies
  - News sentiment
  - User-defined thresholds

**Config:**
```json
{
  "provider": "alpha-vantage",
  "watchlist": ["AAPL", "GOOGL", "MSFT", "TSLA"],
  "alertOnChange": 3.0,
  "includeAfterHours": true
}
```

**Sample Headline:**
```
Title: "📈 TSLA up 7.2% - Now $285.40"
Description: "Tesla stock surged on new factory announcement"
Link: "https://finance.yahoo.com/quote/TSLA"
Category: "stocks"
Tags: ["finance", "stocks", "tesla"]
ImportanceScore: 0.82
```

### Bible Verse Plugin

**Purpose:** Daily inspirational verses

**Features:**
- Verse of the day from various APIs
- Configurable translation (NIV, ESV, KJV, etc.)
- Thematic verses (hope, strength, wisdom)
- Importance scoring:
  - Always moderate (baseline 0.5)
  - Higher for specific themes if user requests

**Config:**
```json
{
  "provider": "bible-api",
  "translation": "NIV",
  "frequency": "daily",
  "themes": ["hope", "strength"]
}
```

**Sample Headline:**
```
Title: "✝️ Verse of the Day: Philippians 4:13"
Description: "I can do all things through Christ who strengthens me."
Link: "https://www.biblegateway.com/passage/?search=Philippians+4:13"
Category: "inspiration"
Tags: ["bible", "daily", "inspiration"]
ImportanceScore: 0.50
```

### Weather Plugin

**Purpose:** Alert on significant weather events

**Features:**
- Supports OpenWeatherMap, WeatherAPI, NOAA
- Configurable locations
- Importance scoring based on:
  - Severe weather alerts
  - Temperature extremes
  - Precipitation probability
  - User-defined preferences (e.g., "alert if < 32°F")

**Config:**
```json
{
  "provider": "openweathermap",
  "locations": ["Los Angeles, CA", "New York, NY"],
  "alertOnSevereWeather": true,
  "alertOnRain": true,
  "tempThreshold": 90
}
```

**Sample Headline:**
```
Title: "🌧️ Rain expected this afternoon (80% chance)"
Description: "Heavy rain starting at 3 PM, bring an umbrella"
Link: "https://openweathermap.org/city/5368361"
Category: "weather"
Tags: ["weather", "rain", "today"]
ImportanceScore: 0.65
```

### GitHub Plugin

**Purpose:** Alert on repository activity

**Features:**
- Supports GitHub API (Personal Access Token)
- Monitors specific repos or organizations
- Importance scoring based on:
  - PR reviews requested
  - Issues assigned
  - Mentions in comments
  - CI/CD failures
  - Security alerts

**Config:**
```json
{
  "token": "ghp_xxxxx",
  "repos": ["myorg/myrepo", "myorg/other-repo"],
  "alerts": ["pr-review-requested", "issue-assigned", "ci-failure"]
}
```

**Sample Headline:**
```
Title: "🔔 PR Review Requested: Add user authentication"
Description: "@johndoe requested your review on PR #123"
Link: "https://github.com/myorg/myrepo/pull/123"
Category: "github"
Tags: ["development", "pull-request", "review"]
ImportanceScore: 0.78
```

### RSS Feed Plugin

**Purpose:** Monitor existing RSS feeds

**Features:**
- Subscribe to any RSS/Atom feed
- Configurable keywords for filtering
- Importance scoring based on:
  - Keyword matches
  - Source priority
  - Freshness

**Config:**
```json
{
  "feeds": [
    {
      "url": "https://blog.example.com/feed.xml",
      "keywords": ["announcement", "release", "security"]
    }
  ]
}
```

**Sample Headline:**
```
Title: "📰 New Security Update Available for Product X"
Description: "Critical security patch released for all users"
Link: "https://blog.example.com/security-update"
Category: "rss"
Tags: ["security", "update", "important"]
ImportanceScore: 0.89
```

### Health Metrics Plugin

**Purpose:** Track health and fitness goals

**Features:**
- Supports Apple Health, Google Fit, Fitbit, Oura
- Monitors steps, sleep, heart rate, activity
- Importance scoring based on:
  - Goal achievement (hit 10k steps)
  - Anomalies (unusual heart rate, poor sleep)
  - Streaks (7 days in a row)

**Config:**
```json
{
  "provider": "apple-health",
  "metrics": ["steps", "sleep", "heart-rate"],
  "goals": {
    "steps": 10000,
    "sleep": 8
  }
}
```

**Sample Headline:**
```
Title: "🏃 Goal Achieved: 10,000 steps today!"
Description: "You hit your daily step goal. Keep it up!"
Link: null
Category: "health"
Tags: ["fitness", "goals", "achievement"]
ImportanceScore: 0.55
```

### Social Media Plugin

**Purpose:** Monitor mentions and engagement

**Features:**
- Supports Twitter/X, LinkedIn, Mastodon
- Monitors mentions, DMs, replies
- Importance scoring based on:
  - Direct mentions
  - Engagement (likes, retweets)
  - Sender influence

**Config:**
```json
{
  "provider": "twitter",
  "alerts": ["mentions", "dms", "replies-to-threads"]
}
```

**Sample Headline:**
```
Title: "💬 New mention from @influencer"
Description: "@influencer mentioned you: 'Great article on...'"
Link: "https://twitter.com/influencer/status/123456"
Category: "social"
Tags: ["twitter", "mention", "engagement"]
ImportanceScore: 0.72
```

### Package Updates Plugin

**Purpose:** Alert on dependency updates

**Features:**
- Monitors npm, pip, cargo, etc.
- Checks for security vulnerabilities
- Importance scoring based on:
  - Security severity
  - Breaking changes
  - Dependency criticality

**Config:**
```json
{
  "packageManager": "npm",
  "projectPath": "/Users/dweaver/Projects/myapp",
  "alertOnSecurity": true,
  "alertOnMajor": true
}
```

**Sample Headline:**
```
Title: "⚠️ Security: lodash has critical vulnerability"
Description: "CVE-2024-12345 affects lodash 4.17.20. Update to 4.17.21"
Link: "https://nvd.nist.gov/vuln/detail/CVE-2024-12345"
Category: "development"
Tags: ["security", "dependencies", "npm"]
ImportanceScore: 0.95
```

### Habit Tracker Plugin

**Purpose:** Remind about daily habits

**Features:**
- User-defined habits (meditation, exercise, reading)
- Configurable frequency and time
- Importance scoring:
  - Higher early in day (reminders)
  - Higher for missed streaks
  - Moderate for completed habits (reinforcement)

**Config:**
```json
{
  "habits": [
    {
      "name": "Morning meditation",
      "frequency": "daily",
      "time": "08:00",
      "streak": 12
    }
  ]
}
```

**Sample Headline:**
```
Title: "🧘 Time for morning meditation (12-day streak!)"
Description: "Keep your streak going with 10 minutes of meditation"
Link: null
Category: "habits"
Tags: ["health", "meditation", "routine"]
ImportanceScore: 0.60
```

## API Design

### REST API Endpoints

**Feed Endpoint:**
```
GET /feed.xml
Returns: RSS 2.0 XML feed

Query params:
- limit: number (max items, default: 50)
- category: string (filter by category)
- since: ISO date (headlines after this date)
```

**Plugin Management:**
```
GET /api/plugins
Returns: List of all plugins

GET /api/plugins/:id
Returns: Plugin details and status

POST /api/plugins/:id/enable
Enable a plugin

POST /api/plugins/:id/disable
Disable a plugin

PUT /api/plugins/:id/config
Update plugin configuration

POST /api/plugins/:id/fetch
Manually trigger plugin fetch
```

**Headline Management:**
```
GET /api/headlines
Returns: All headlines (paginated)

Query params:
- page: number (default: 1)
- limit: number (default: 50)
- category: string (filter)
- important: boolean (filter)
- unread: boolean (filter)

GET /api/headlines/:id
Returns: Single headline

PUT /api/headlines/:id
Update headline (mark read, starred, etc.)

DELETE /api/headlines/:id
Archive headline
```

**Authentication:**
```
POST /api/auth/:pluginId
Initiate auth flow (returns auth URL for OAuth2)

GET /api/auth/callback
OAuth2 callback endpoint

DELETE /api/auth/:pluginId
Revoke plugin authentication
```

**Preferences:**
```
GET /api/preferences
Returns: User preferences

PUT /api/preferences
Update user preferences
```

**Health Check:**
```
GET /api/health
Returns: Service health status
```

### CLI Commands

```bash
# Service management
topix start                    # Start the service
topix stop                     # Stop the service
topix restart                  # Restart the service
topix status                   # Show service status

# Plugin management
topix plugin list              # List all plugins
topix plugin enable <id>       # Enable plugin
topix plugin disable <id>      # Disable plugin
topix plugin config <id>       # Configure plugin (interactive)
topix plugin status            # Show plugin health
topix plugin install <path>    # Install custom plugin

# Authentication
topix auth add <plugin-id>     # Add authentication
topix auth list                # List configured auth
topix auth revoke <plugin-id>  # Revoke authentication
topix auth test <plugin-id>    # Test authentication

# Headline management
topix fetch                    # Fetch from all plugins
topix fetch --plugin <id>      # Fetch from specific plugin
topix headlines                # List recent headlines
topix headlines --all          # List all (including filtered)

# Configuration
topix config get <key>         # Get config value
topix config set <key> <val>   # Set config value
topix config reset             # Reset to defaults

# Preferences
topix prefs show               # Show preferences
topix prefs edit               # Edit preferences (opens editor)

# Debugging
topix logs                     # View service logs
topix logs --plugin <id>       # View plugin-specific logs
topix debug <plugin-id>        # Debug plugin execution
```

## LLM Integration

### LLM Provider Strategy

Top ix supports multiple LLM providers in order of preference:

1. **Ollama (Local)** - Preferred for privacy and speed
2. **OpenRouter (Remote)** - Fallback for users without Ollama
3. **Rule-based** - Last resort if no LLM available

**Auto-Detection Flow:**

1. On first run, `topix setup` checks if Ollama is installed
2. If Ollama found: Configure to use Ollama with suggested model (llama3.2:3b)
3. If Ollama not found: Prompt user to configure OpenRouter or skip LLM
4. User can switch providers anytime with `topix config set llm.provider ollama|openrouter|none`

### Ollama Setup (Local LLM)

**Installation:**
```bash
# Install Ollama
curl https://ollama.ai/install.sh | sh

# Pull recommended model
ollama pull llama3.2:3b
```

**Configuration:**
```json
{
  "llm": {
    "provider": "ollama",
    "endpoint": "http://localhost:11434",
    "model": "llama3.2:3b",
    "timeout": 10000
  },
  "importance": {
    "defaultThreshold": 0.6,
    "llmPrompt": "You are an AI assistant helping to determine if a headline is important...",
    "context": "I work as a software engineer at ServiceTitan..."
  }
}
```

### OpenRouter Setup (Remote LLM)

**Sign up:** https://openrouter.ai

**Configuration:**
```bash
# Add OpenRouter API key
topix config set llm.provider openrouter
topix config set llm.apiKey YOUR_OPENROUTER_KEY
topix config set llm.model anthropic/claude-3-haiku
```

**Stored in SQLite:**
```json
{
  "llm": {
    "provider": "openrouter",
    "apiKey": "sk-or-xxx...",
    "model": "anthropic/claude-3-haiku",
    "endpoint": "https://openrouter.ai/api/v1/chat/completions",
    "timeout": 10000
  }
}
```

**Supported models:**
- `anthropic/claude-3-haiku` (fast, cost-effective)
- `meta-llama/llama-3.1-8b-instruct` (balanced)
- `openai/gpt-4o-mini` (high quality)
- Any OpenRouter-supported model

### Rule-Based Scoring (No LLM)

If no LLM is configured, Topix falls back to rule-based scoring:

```typescript
function calculateImportance(headline: Headline, rules: ImportanceRule[]): number {
  let score = 0.5; // Base score

  // Check keywords in title/description
  for (const rule of rules) {
    if (matchesCondition(headline, rule.condition)) {
      score *= rule.weight;
    }
  }

  // Time-based urgency (for calendar events)
  if (headline.category === 'calendar') {
    const minutesUntil = getMinutesUntil(headline.metadata.startTime);
    if (minutesUntil < 60) score = Math.max(score, 0.9); // Very urgent
    else if (minutesUntil < 120) score = Math.max(score, 0.7); // Urgent
  }

  // Sender-based (for emails)
  if (headline.metadata.sender && isVIP(headline.metadata.sender)) {
    score = Math.max(score, 0.8);
  }

  return Math.min(score, 1.0); // Cap at 1.0
}
```

### Importance Scoring Flow

1. **Headline Created:** Plugin generates headline with metadata
2. **Context Building:** System builds context from user preferences and plugin config
3. **LLM Prompt:** Headline + context sent to Ollama
4. **LLM Response:** JSON with score (0.0-1.0) and reasoning
5. **Score Adjustment:** Multiply by plugin's baseWeight
6. **Threshold Check:** Compare to plugin/global threshold
7. **Storage:** Save headline with importance data

### Example LLM Request

**Prompt:**
```
You are an AI assistant helping to determine if a headline is important to the user.

User Context:
I work as a software engineer at ServiceTitan. I care about urgent emails from my manager, upcoming meetings in the next 2 hours, significant stock movements (>5%), and technology news related to AI and web development.

Headline:
Title: "Email: Sprint Planning Tomorrow at 10am"
Description: "Email from sarah@servicetitan.com (Engineering Manager) about sprint planning meeting tomorrow"
Category: email
Tags: work, meeting, team

Determine if this headline is important to the user. Respond with:
1. A score from 0.0 (not important) to 1.0 (very important)
2. A brief reason for your score (1-2 sentences)

Response format (JSON):
{
  "score": 0.75,
  "reason": "This is a work email from your manager about an upcoming meeting, which is relevant to your job."
}
```

**Response:**
```json
{
  "score": 0.75,
  "reason": "This is a work email from your manager about an upcoming meeting, which is relevant to your job."
}
```

### Fallback Strategy

If LLM fails (timeout, error, etc.):
1. Use rule-based scoring (keywords, sender, time)
2. Log error for debugging
3. Continue processing (don't block feed generation)

## Interactive Setup Wizard

On first run, `topix setup` launches an interactive wizard to configure the system.

### Setup Flow

```bash
$ topix setup

┌─────────────────────────────────────────────┐
│  Welcome to Topix! Let's get you set up.   │
└─────────────────────────────────────────────┘

[Step 1/4] LLM Configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Topix uses AI to determine which headlines are important.

✓ Checking for Ollama... Found! (localhost:11434)

Recommended: Use Ollama (local, private, free)
  Model: llama3.2:3b (already pulled)

? Configure LLM provider: (Use arrow keys)
❯ Use Ollama (local)
  Use OpenRouter (remote, requires API key)
  Skip (use rule-based scoring only)

[Selection: Ollama]

✓ Configured to use Ollama with llama3.2:3b

[Step 2/4] User Context
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Help the AI understand what's important to you.

? Describe your work and interests (optional):
│ I'm a software engineer at ServiceTitan. I care about urgent
│ emails from my manager, upcoming meetings, tech news related
│ to AI and web development, and stock movements over 5%.

[Step 3/4] First Plugin
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Let's configure your first data source.

? Choose a plugin to configure:
❯ Email (Gmail, Outlook, IMAP)
  Calendar (Google Calendar, CalDAV)
  News (NewsAPI, RSS feeds)
  Skip (configure later)

[Selection: Email]

✓ Email plugin selected

? Email provider:
❯ Gmail (OAuth2)
  Outlook (OAuth2)
  IMAP (username/password)

[Selection: Gmail]

? Ready to authorize Gmail? This will open your browser.
  Press Enter to continue...

[Opens browser, user authorizes]

✓ Gmail authorized for work@example.com

? Folders to monitor:
❯ [x] INBOX
  [ ] Sent
  [ ] Work

? Check email every:
❯ 5 minutes
  15 minutes
  30 minutes
  1 hour

✓ Email plugin configured

[Step 4/4] Feed Settings
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

? RSS feed title: (default: "Topix - Your Personal Headlines")
? Max headlines in feed: (default: 50)
? Importance threshold (0.0-1.0): (default: 0.6)

✓ Setup complete!

Next steps:
  • Start the service:  topix start
  • View headlines:     topix headlines
  • Add more plugins:   topix plugin list
  • Open in browser:    http://localhost:3000/feed.xml

```

### Setup Wizard Features

- **Auto-detection:** Checks for Ollama installation automatically
- **Progressive disclosure:** Only shows relevant options based on choices
- **Smart defaults:** Suggests sensible defaults for all settings
- **Validation:** Validates inputs (API keys, cron schedules, etc.)
- **Resumable:** Can quit and resume later (`topix setup --continue`)
- **Reconfigurable:** Can re-run to change settings (`topix setup --reconfigure`)

## Terminal UI (TUI)

Topix includes a full Terminal User Interface for browsing and managing headlines.

### TUI Features

**Headline Browser:**
- List view of recent headlines (important and filtered)
- Keyboard navigation (vim-style: j/k or arrow keys)
- Filter by category, plugin, date range, importance
- Mark as read/starred/archived
- View full details (press Enter)
- Search headlines (press /)
- Export to various formats

**Plugin Manager:**
- View all plugins and their status
- Enable/disable plugins
- View plugin configuration
- Trigger manual fetch
- View plugin logs

**Service Controls:**
- Start/stop/restart service
- View service status and uptime
- View recent activity log
- Force fetch from all plugins

### TUI Navigation

```bash
$ topix

┌─────────────────────────────────────────────────────────────────┐
│ Topix                                         [Service: Running] │
├─────────────────────────────────────────────────────────────────┤
│ [h] Headlines  [p] Plugins  [s] Service  [c] Config  [q] Quit   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Headlines (23 unread, 15 important)                Filter: [All]│
│                                                                  │
│ ❗ 📧 Urgent: Q4 Budget Review Meeting Tomorrow                 │
│    Email • work@example.com • 5 minutes ago                     │
│    Importance: 0.92 • "From your manager about critical meeting"│
│                                                                  │
│   📅 Sprint Planning in 30 minutes                              │
│    Calendar • Engineering Team • Now                             │
│    Importance: 0.88 • "Important recurring team meeting"        │
│                                                                  │
│   📈 TSLA up 7.2% - Now $285.40                                 │
│    Stocks • Alpha Vantage • 1 hour ago                          │
│    Importance: 0.82 • "Significant price movement in watchlist" │
│                                                                  │
│   🗞️ OpenAI Releases GPT-5 with Performance Improvements       │
│    News • TechCrunch • 2 hours ago                              │
│    Importance: 0.75 • "Relevant to your AI interests"           │
│                                                                  │
│ [More: 19 headlines]                                             │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ ↑/k: Up  ↓/j: Down  Enter: Details  /: Search  r: Refresh      │
│ f: Filter  s: Star  d: Archive  m: Mark read  ?: Help          │
└─────────────────────────────────────────────────────────────────┘
```

### TUI Implementation

**Library:** ink (React for terminal)
- Component-based UI
- Familiar React patterns (hooks, state, effects)
- Easy to maintain and extend
- Excellent keyboard input handling

**Key Components:**
```typescript
// Main app component
function TopixTUI() {
  return (
    <Box flexDirection="column">
      <Header />
      <Navigation />
      <Router>
        <HeadlinesBrowser />
        <PluginManager />
        <ServiceControls />
        <ConfigEditor />
      </Router>
      <Footer />
    </Box>
  );
}
```

## Future: Wails Menu Bar App

**Phase 10** will introduce a native macOS menu bar app built with Wails.

### Wails Architecture

- **Backend:** Go (wraps topix service)
- **Frontend:** React/Vue/Svelte
- **Bridge:** Native Go ↔ JS communication
- **Bundle:** Single app bundle (~15MB)

### Menu Bar Features

**Menu Bar Icon:**
- Shows unread count badge
- Click to open dropdown or full app

**Quick Dropdown:**
- Preview of last 5 important headlines
- Mark as read/star
- Click to open full app
- Service status indicator
- Quick actions (fetch now, open feed in browser)

**Full App Window:**
- Modern web UI (React-based)
- Full headline browser with search/filters
- Plugin management UI
- Settings and configuration
- Service controls (start/stop/restart)
- Real-time updates (WebSocket)

**Service Integration:**
- Automatically starts topix service if not running
- Shows service status in menu bar
- Logs viewer
- Quick access to data directory

### TUI vs Wails

| Feature | TUI (ink) | Wails App |
|---------|-----------|-----------|
| **Access** | Terminal only | Menu bar + GUI |
| **Performance** | Very fast | Fast (web view) |
| **Aesthetics** | Terminal-style | Modern, polished |
| **Installation** | Included in binary | Separate app (Phase 10) |
| **Use Case** | Power users, CLI lovers | General users, visual preference |

**Both can coexist:** Users can use TUI for quick CLI access and Wails app for visual management.

## Implementation Phases

### Phase 0: Homebrew Packaging & Distribution (Week 1)

**Goals:**
- Set up Homebrew tap infrastructure
- Configure pkg for standalone binary creation
- Create Homebrew formula

**Deliverables:**
- [ ] Homebrew tap repository created (dweaver/homebrew-topix)
- [ ] pkg configuration for binary packaging
- [ ] Homebrew formula (topix.rb)
- [ ] Build and release script
- [ ] Testing on clean macOS installation

**Tech Tasks:**
- Create GitHub repo: `dweaver/homebrew-topix`
- Configure pkg.json for binary creation (target: node20-macos-arm64)
- Write Homebrew formula with proper dependencies and install steps
- Create release workflow (GitHub Actions)
- Test installation: `brew tap dweaver/topix && brew install topix`

### Phase 1: Core Foundation (Week 1-2)

**Goals:**
- Project setup with TypeScript/Node.js
- SQLite database and schemas
- Plugin system architecture
- Basic plugin interface

**Deliverables:**
- [ ] Project structure initialized
- [ ] TypeScript configured
- [ ] SQLite schemas defined
- [ ] Plugin interface defined
- [ ] Plugin manager (load, enable, disable)
- [ ] Basic CLI commands (start, stop, status)

**Tech Tasks:**
- Initialize npm project with TypeScript
- Set up ESLint + Prettier
- Configure tsconfig.json
- Install dependencies (better-sqlite3, express, commander, ink)
- Create src/ structure (plugins/, managers/, models/, utils/, tui/)
- Implement PluginManager class
- Create SQLite schema and migrations
- Implement database models (Headline, PluginConfig, Auth, Preferences)

### Phase 2: Authentication System (Week 2-3)

**Goals:**
- OAuth2 flow implementation
- API key management
- Credential encryption
- Auth CLI commands

**Deliverables:**
- [ ] AuthManager class
- [ ] OAuth2Provider implementation
- [ ] API key provider
- [ ] Basic auth provider
- [ ] Credential encryption/decryption
- [ ] Auth CLI commands (add, list, revoke, test)
- [ ] Local callback server for OAuth2

**Tech Tasks:**
- Implement AuthProvider interface
- Create OAuth2Provider with auth code flow
- Create ApiKeyProvider
- Create BasicAuthProvider
- Implement encryption using crypto module
- Build local callback server (Express)
- Add auth management to CLI

### Phase 3: Example Plugins (Week 3-4)

**Goals:**
- Build 3-5 working plugins
- Test plugin system
- Validate authentication flows

**Deliverables:**
- [ ] Email plugin (Gmail OAuth2)
- [ ] Calendar plugin (Google Calendar OAuth2)
- [ ] News plugin (NewsAPI with API key)
- [ ] Stock plugin (Alpha Vantage with API key)
- [ ] Bible verse plugin (no auth)
- [ ] Plugin documentation

**Tech Tasks:**
- Implement each plugin with TopixPlugin interface
- Add OAuth2 integration for Gmail/Google Calendar
- Add API key integration for NewsAPI/Alpha Vantage
- Test authentication flows end-to-end
- Document plugin configuration schemas

### Phase 4: LLM Integration (Week 4-5)

**Goals:**
- Multi-provider LLM support (Ollama + OpenRouter)
- Importance scoring with AI
- Prompt engineering
- Threshold filtering
- Rule-based fallback

**Deliverables:**
- [ ] LLMProvider interface
- [ ] OllamaProvider implementation
- [ ] OpenRouterProvider implementation
- [ ] Rule-based scorer (fallback)
- [ ] Importance scoring logic
- [ ] Prompt templates
- [ ] User context management
- [ ] Score threshold filtering

**Tech Tasks:**
- Create LLMProvider interface (abstract base)
- Implement OllamaProvider (connects to localhost:11434)
- Implement OpenRouterProvider (HTTP client to openrouter.ai)
- Create RuleBasedScorer for fallback
- Implement LLM auto-detection (check Ollama availability)
- Build scoring flow (prompt building, API call, parsing)
- Add importance scoring to headline generation pipeline
- Add LLM config to user preferences (provider, model, API key)
- Test scoring with various headline types and all providers

### Phase 5: RSS Feed Generation (Week 5)

**Goals:**
- RSS 2.0 feed generation
- HTTP endpoint
- Feed configuration

**Deliverables:**
- [ ] RSSGenerator class
- [ ] Express HTTP server
- [ ] /feed.xml endpoint
- [ ] Feed customization (title, description, TTL)

**Tech Tasks:**
- Implement RSS 2.0 XML generation
- Create Express server with /feed.xml route
- Query MongoDB for important headlines
- Sort and limit results
- Add feed metadata (title, description, link, TTL)
- Test with RSS readers (Feedly, NetNewsWire, etc.)

### Phase 6: Interactive Setup Wizard (Week 5-6)

**Goals:**
- User-friendly onboarding experience
- Auto-detect and configure LLM provider
- First plugin configuration
- Feed customization

**Deliverables:**
- [ ] Setup wizard command (`topix setup`)
- [ ] LLM auto-detection (check for Ollama)
- [ ] Interactive prompts (inquirer.js)
- [ ] OAuth2 flow integration for first plugin
- [ ] Progress indicators and validation
- [ ] Resume capability

**Tech Tasks:**
- Install inquirer.js or prompts for interactive CLI
- Implement multi-step wizard flow
- Add Ollama detection (check localhost:11434/api/tags)
- Build LLM configuration step (Ollama/OpenRouter/skip)
- Add user context input (freeform text)
- Create first plugin selection and configuration
- Integrate OAuth2 flow into wizard
- Add feed settings configuration
- Test wizard flow end-to-end
- Add `--continue` and `--reconfigure` flags

### Phase 7: Terminal UI (TUI) (Week 6-7)

**Goals:**
- Rich terminal interface for browsing headlines
- Plugin management UI
- Service controls
- Keyboard navigation

**Deliverables:**
- [ ] TUI framework with ink
- [ ] Headline browser component
- [ ] Plugin manager component
- [ ] Service controls component
- [ ] Config editor component
- [ ] Navigation and routing
- [ ] Keyboard shortcuts

**Tech Tasks:**
- Set up ink project structure
- Create main TUI app component with routing
- Build HeadlinesBrowser component (list, details, filters)
- Build PluginManager component (list, enable/disable, trigger fetch)
- Build ServiceControls component (start/stop/restart, logs)
- Build ConfigEditor component (preferences editor)
- Implement keyboard navigation (j/k, arrows, Enter, /, etc.)
- Add search functionality (/)
- Add filtering (category, plugin, date, importance)
- Test TUI on various terminal sizes
- Add help screen (?)

### Phase 8: Scheduling & Background Jobs (Week 7)

**Goals:**
- Automated plugin execution
- Cron-based scheduling
- Error handling and retries

**Deliverables:**
- [ ] Scheduler class
- [ ] Background job runner
- [ ] Configurable cron schedules per plugin
- [ ] Error logging and retry logic

**Tech Tasks:**
- Install node-cron or similar
- Implement Scheduler class
- Add schedule configuration to plugin configs
- Execute plugins on schedule
- Handle errors gracefully (log, retry with backoff)
- Add scheduler start/stop to service lifecycle

### Phase 9: REST API (Week 8)

**Goals:**
- Full REST API for management
- Plugin control endpoints
- Headline management
- Auth management

**Deliverables:**
- [ ] REST API with Express
- [ ] Plugin endpoints
- [ ] Headline endpoints
- [ ] Auth endpoints
- [ ] Preferences endpoints
- [ ] Health check endpoint

**Tech Tasks:**
- Expand Express server with REST routes
- Implement controllers for plugins, headlines, auth, prefs
- Add request validation (express-validator)
- Add error handling middleware
- Document API with examples
- Test with curl/Postman

### Phase 10: Testing & Documentation (Week 9)

**Goals:**
- Unit tests for core components
- Integration tests for plugins
- User documentation
- Developer documentation

**Deliverables:**
- [ ] Unit tests (Jest)
- [ ] Integration tests
- [ ] User guide (README.md)
- [ ] Plugin development guide
- [ ] API documentation
- [ ] Deployment guide

**Tech Tasks:**
- Write unit tests for managers, models, utilities
- Write integration tests for plugins and auth flows
- Create comprehensive README with setup instructions
- Document plugin development (template, interface, examples)
- Document API endpoints with examples
- Add deployment instructions (Docker, systemd, etc.)

### Phase 11: Polish & Optimization (Week 10)

**Goals:**
- Performance optimization
- Error handling improvements
- User experience polish
- Security audit
- pkg binary optimization

**Deliverables:**
- [ ] Performance optimizations
- [ ] Better error messages
- [ ] Improved logging
- [ ] Security review
- [ ] CLI/TUI improvements (colors, animations, progress)
- [ ] Optimized binary size

**Tech Tasks:**
- Profile and optimize database queries (add indexes if needed)
- Improve error messages (user-friendly, actionable)
- Add structured logging (winston or pino)
- Enhance CLI/TUI UX (chalk, ora, spinners, animations)
- Security audit (dependency check, credential handling, SQLite injection)
- Add rate limiting to API endpoints
- Optimize pkg binary (tree-shaking, exclude dev dependencies)
- Test binary on various macOS versions (Ventura, Sonoma)

### Phase 12: Wails Menu Bar App (Week 11-13)

**Goals:**
- Native macOS menu bar application
- Quick headline preview
- Service controls
- Visual UI for configuration

**Deliverables:**
- [ ] Wails app project structure
- [ ] Go backend (wraps topix service)
- [ ] React frontend (UI components)
- [ ] Menu bar integration
- [ ] Quick dropdown preview
- [ ] Full app window
- [ ] Real-time updates (WebSocket)
- [ ] macOS app bundle

**Tech Tasks:**
- Install Wails CLI and initialize project
- Create Go backend that communicates with topix service
- Build React frontend with modern UI
- Implement menu bar icon with badge (unread count)
- Create dropdown component (last 5 headlines)
- Build full app window (headline browser, plugins, settings)
- Add WebSocket for real-time headline updates
- Integrate service controls (start/stop/restart)
- Package as .app bundle for macOS
- Test on various macOS versions
- Add auto-updater (optional)

### Phase 13: Advanced Features (Week 14+)

**Goals:**
- Additional plugins
- Advanced LLM features
- Plugin marketplace (optional)
- Multi-language support (optional)

**Deliverables:**
- [ ] 10+ total plugins (5+ new)
- [ ] Advanced LLM features (categorization, summarization, deduplication)
- [ ] Plugin marketplace/directory (GitHub-based)
- [ ] Plugin development toolkit
- [ ] Example plugins and templates

**Tech Tasks:**
- Implement 5+ new plugins:
  - GitHub notifications
  - Weather alerts
  - Health metrics (Apple Health integration)
  - Social media mentions
  - Package update checker
- Add LLM-powered headline categorization
- Add LLM-powered headline summarization
- Implement headline deduplication (same event from multiple sources)
- Create plugin marketplace (GitHub repo with registry JSON)
- Build plugin development toolkit (CLI for scaffolding)
- Create plugin templates and examples
- Document plugin development guide

## Open Questions

### Technical

1. **Plugin Discovery:**
   - How should users install third-party plugins? (npm packages, git repos, local files, GitHub URLs?)
   - Should plugins be sandboxed for security? (VM2, isolated context, permissions system?)
   - Should there be plugin signatures or verification?

2. **Authentication:**
   - Should OAuth2 redirect URI be configurable?
   - How to handle OAuth2 for plugins that need different scopes?
   - Should we support macOS Keychain for credential storage instead of encrypted JSON?

3. **LLM:**
   - Default Ollama model: llama3.2:3b (better) vs llama3.2:1b (faster)?
   - Should importance scoring be cached/memoized to avoid redundant LLM calls?
   - Default OpenRouter model: claude-3-haiku vs llama-3.1-8b vs gpt-4o-mini?

4. **Performance:**
   - How many plugins can run concurrently without performance issues?
   - Should plugin execution be rate-limited to avoid API throttling?
   - Should headlines expire/archive automatically? (7 days, 30 days, forever?)

5. **Data Storage:**
   - How long should headlines be retained by default?
   - Should we implement headline deduplication across plugins (same event, different sources)?
   - Should SQLite database be backed up automatically?

6. **Binary Packaging:**
   - Should we support Intel Macs (x64) in addition to Apple Silicon (arm64)?
   - How to handle binary updates? (Homebrew upgrade sufficient or add self-updater?)
   - Should pkg binary include all dependencies or rely on system Node.js fallback?

### Product

1. **User Experience:**
   - Should the TUI be the default command (`topix` → TUI, `topix start` → service)?
   - How should users discover new plugins? (built-in marketplace browser in TUI?)
   - Should the RSS feed include filtered-out headlines as separate category (for transparency)?

2. **Importance Scoring:**
   - Should users be able to provide feedback on scores? (thumbs up/down for training)
   - Should the system learn from user feedback over time? (fine-tune local model?)
   - How granular should importance configuration be? (global, per-plugin, per-headline-type?)

3. **Notifications:**
   - Should the system support push notifications for ultra-important headlines?
   - What notification channels make sense? (macOS notifications, email, SMS, webhook?)
   - Should Wails menu bar app handle notifications natively?

4. **Plugin Ecosystem:**
   - Should there be an official plugin marketplace? (GitHub-based registry?)
   - How should plugin quality/security be ensured? (code review, sandboxing, permissions?)
   - Should plugins be versioned and updatable? (semantic versioning, auto-updates?)
   - Should there be plugin categories/tags for discovery?

5. **Menu Bar App:**
   - Should the Wails app be a separate install or bundled with topix binary?
   - Should it replace TUI as the primary interface, or coexist?
   - Should it support custom themes/appearance?

### Security

1. **Credential Storage:**
   - Is local encryption with master password sufficient, or use macOS Keychain?
   - Should we support Touch ID/Face ID for unlocking credentials?
   - How to handle master password recovery? (recovery key, security questions, or none?)

2. **OAuth2:**
   - Should OAuth2 tokens be auto-refreshed in background? (yes, with expiry checks)
   - How to handle OAuth2 scope creep from plugin updates? (prompt user to re-authorize?)
   - Should users be alerted when tokens are about to expire? (7 days before?)

3. **Plugin Security:**
   - Should plugins run in isolated environment? (VM2, Web Workers, or separate process?)
   - Should plugins declare required permissions upfront? (access to credentials, network, filesystem?)
   - How to prevent malicious plugins from accessing credentials? (permission system, code signing?)
   - Should user plugins be code-reviewed or require approval?

4. **Binary Security:**
   - Should the pkg binary be code-signed for macOS Gatekeeper?
   - Should we notarize the binary for macOS distribution?
   - How to handle updates securely? (verify signatures, HTTPS only)

## Decisions Made

The following key technical decisions have been finalized (Oct 23, 2025):

### LLM Models

**Ollama (Local):**
- **Model:** `llama3.2:3b`
- **Rationale:** Good balance of accuracy (~95%) and speed (~2s per headline), 2GB download
- **Fallback:** If model not pulled, setup wizard prompts to pull it

**OpenRouter (Remote):**
- **Model:** `meta-llama/llama-3.1-8b-instruct`
- **Rationale:** Cost-effective ($0.055/1M tokens), good quality, open source
- **Alternative:** Users can configure any OpenRouter model via `topix config set llm.openrouter.model`

### Credential Storage

**Method:** macOS Keychain (via `keytar` npm package)
- **Rationale:** Native macOS integration, supports Touch ID/Face ID, secure by default
- **Implementation:** Use `keytar` package (used by VS Code, Atom, etc.)
- **Service Name:** `topix` (credentials stored as `topix/plugin-id`)
- **Fallback:** If Keychain access denied, fall back to encrypted JSON with master password

**Security:**
- OAuth2 tokens stored in Keychain
- API keys stored in Keychain
- Encryption keys for JSON fallback derived from master password (PBKDF2)

### Mac Architecture Support

**Target:** Apple Silicon only (arm64)
- **Binary:** `node20-macos-arm64` via pkg
- **Intel Macs:** Run via Rosetta 2 (transparent, slight performance hit)
- **Rationale:** Simpler build, smaller binary (~50MB vs ~100MB universal)
- **Future:** Can add x64 target if demand warrants

### Plugin Security (MVP)

**Approach:** Trust by default (no sandboxing in MVP)
- **Built-in plugins:** Trusted, compiled into binary
- **User-installed plugins:** Run with full access, no isolation
- **Warning:** Setup wizard warns users about security when installing third-party plugins
- **Future (Phase 11):** Add permission system and optional sandboxing

**Plugin Installation:**
- Built-in: Loaded from binary
- User: Copy JS file to `~/Library/Application Support/topix/plugins/`
- Validation: Check exports `TopixPlugin` interface, load and initialize

## Success Criteria

### MVP (Phase 0-5)

**Goal:** Installable via Homebrew with core functionality

- [ ] Installable via `brew tap dweaver/topix && brew install topix`
- [ ] 3+ working plugins (email, calendar, news)
- [ ] OAuth2 authentication working for Gmail/Google Calendar
- [ ] Multi-provider LLM support (Ollama + OpenRouter + rule-based)
- [ ] RSS feed generated and consumable in standard RSS reader
- [ ] CLI commands for service management (start, stop, status)
- [ ] Headlines stored in SQLite
- [ ] Service runs on demand (manual start/stop)
- [ ] Standalone binary (~50MB, no external dependencies)

### V1.0 (Phase 0-10)

**Goal:** Feature-complete CLI/TUI application

- [ ] 5+ plugins working (email, calendar, news, stocks, bible verse)
- [ ] Interactive setup wizard (`topix setup`)
- [ ] Full Terminal UI (TUI) for browsing headlines
- [ ] Full REST API implemented
- [ ] Scheduled background execution (cron)
- [ ] Comprehensive documentation (user guide, plugin development guide)
- [ ] Unit and integration tests (>80% coverage)
- [ ] Performance: < 5 seconds per plugin fetch
- [ ] Stability: No crashes over 7-day continuous run
- [ ] Binary size < 60MB

### V2.0 (Phase 0-13)

**Goal:** Native macOS experience with menu bar app

- [ ] 10+ plugins available
- [ ] Wails menu bar app for headline preview and management
- [ ] Quick dropdown preview (last 5 headlines)
- [ ] Full visual UI for configuration
- [ ] Real-time headline updates (WebSocket)
- [ ] Advanced LLM features (categorization, summarization, deduplication)
- [ ] macOS notifications for urgent headlines
- [ ] Plugin marketplace/directory (GitHub-based)
- [ ] Plugin development toolkit
- [ ] Code-signed and notarized binaries
- [ ] Eligible for official Homebrew (homebrew-core)

## Next Steps

1. ✅ **Key Decisions Made** (Oct 23, 2025)
   - LLM: Ollama (llama3.2:3b) + OpenRouter (llama-3.1-8b)
   - Credentials: macOS Keychain (keytar)
   - Architecture: Apple Silicon (arm64) only
   - Plugin security: Trust by default (MVP)

2. **Set Up Development Environment:**
   - ✅ Create project structure in `/projects/topix/`
   - Initialize TypeScript project with pkg configuration
   - Set up SQLite with better-sqlite3
   - Install keytar for Keychain integration
   - Create Homebrew tap repository (dweaver/homebrew-topix)
   - Configure testing framework (Jest)

3. **Begin Implementation:** Start with Phase 0 (Homebrew Packaging) + Phase 1 (Core Foundation)
   - Write Homebrew formula
   - Implement SQLite database layer
   - Create plugin interface and manager
   - Build basic CLI commands (start, stop, status)

---

**Key Changes in This Update (Oct 23, 2025):**
- Changed from MongoDB → SQLite (single-file database)
- Added pkg for standalone binary packaging (~50MB)
- Added Homebrew distribution (personal tap → official)
- Added interactive setup wizard with LLM auto-detection
- Added full Terminal UI (TUI) with ink
- Added multi-provider LLM (Ollama + OpenRouter + rule-based)
- Added future Wails menu bar app (Phase 12)
- Scoped to single-user macOS application
- Data location: `~/Library/Application Support/topix/`
- Removed multi-user and cloud deployment features

_PRD will be updated as requirements evolve and questions are answered._