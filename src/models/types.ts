/**
 * Core type definitions for Topix
 */

// ============================================================================
// Plugin System
// ============================================================================

export interface TopixPlugin {
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

  // Data retention
  getRetentionPolicy(): RetentionPolicy;
}

export interface PluginConfig {
  pluginId: string;
  enabled: boolean;
  schedule: string; // Cron expression
  config: Record<string, any>; // Plugin-specific config
  importance: ImportanceConfig;
  lastRun?: Date;
  lastError?: string;
}

export interface FetchContext {
  pluginId: string;
  config: Record<string, any>;
  credentials?: AuthCredentials;
  lastRun?: Date;
  getHistory(options?: HistoryQueryOptions): Headline[];
  db: import('@/models/database').TopixDatabase; // Database access for services
}

export interface HistoryQueryOptions {
  limit?: number; // Max number of headlines to return
  since?: Date; // Only headlines published after this date
}

export interface ConfigSchema {
  type: 'object';
  properties: Record<string, SchemaProperty>;
  required?: string[];
}

export interface SchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  default?: any;
  enum?: any[];
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface HealthStatus {
  healthy: boolean;
  message?: string;
  lastChecked: Date;
}

export type RetentionPolicy =
  | { type: 'count'; value: number } // Keep last N headlines
  | { type: 'duration'; hours: number } // Keep last N hours
  | { type: 'unlimited' }; // Keep all headlines

// ============================================================================
// Headlines
// ============================================================================

export interface Headline {
  id: string; // UUID
  pluginId: string; // Source plugin
  title: string; // Headline text (required)
  description?: string; // Optional longer description
  link?: string; // Optional link to source
  pubDate: Date; // Publication/event date
  createdAt: Date; // When headline was created

  // Categorization
  category: string; // Plugin-defined category
  tags: string[]; // Searchable tags

  // Importance scoring
  importanceScore: number; // 0.0 - 1.0 (LLM-generated)
  importanceReason?: string; // Why it's important (LLM)

  // Metadata
  metadata: Record<string, any>; // Plugin-specific data

  // Status
  read: boolean; // Marked as read?
  starred: boolean; // User starred?
  archived: boolean; // Removed from feed?
}

export interface ImportanceConfig {
  llmEnabled: boolean;
  baseWeight: number; // 0.0 - 2.0 (multiplier)
  threshold: number; // 0.0 - 1.0 (min score to include)
  rules: ImportanceRule[];
}

export interface ImportanceRule {
  condition: string; // e.g., "from contains 'boss@example.com'"
  weight: number; // Multiplier (0.0 - 2.0)
}

// ============================================================================
// Authentication
// ============================================================================

export type AuthType = 'oauth2' | 'apikey' | 'basic' | 'custom';

export interface AuthRequirement {
  type: AuthType;
  description: string;
  fields?: AuthField[];
}

export interface AuthField {
  name: string;
  type: 'text' | 'password' | 'url';
  label: string;
  required: boolean;
  default?: string;
}

export interface AuthCredentials {
  type: AuthType;
  [key: string]: any;
}

export interface OAuth2Credentials extends AuthCredentials {
  type: 'oauth2';
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope?: string;
}

export interface ApiKeyCredentials extends AuthCredentials {
  type: 'apikey';
  apiKey: string;
}

export interface BasicAuthCredentials extends AuthCredentials {
  type: 'basic';
  username: string;
  password: string;
}

// ============================================================================
// LLM
// ============================================================================

export type LLMProvider = 'ollama' | 'openrouter' | 'none';

export interface LLMConfig {
  provider: LLMProvider;
  ollama?: OllamaConfig;
  openrouter?: OpenRouterConfig;
}

export interface OllamaConfig {
  endpoint: string; // e.g., "http://localhost:11434"
  model: string; // e.g., "llama3.2:3b"
  timeout: number; // milliseconds
}

export interface OpenRouterConfig {
  endpoint: string; // e.g., "https://openrouter.ai/api/v1/chat/completions"
  model: string; // e.g., "meta-llama/llama-3.1-8b-instruct"
  apiKey: string;
  timeout: number; // milliseconds
}

export interface ImportanceScoreRequest {
  headline: Headline;
  userContext: string;
  pluginContext?: Record<string, any>;
}

export interface ImportanceScoreResponse {
  score: number; // 0.0 - 1.0
  reason: string; // Brief explanation
}

// ============================================================================
// User Preferences
// ============================================================================

export interface UserPreferences {
  // Feed settings
  feed: FeedSettings;

  // Importance scoring
  importance: ImportanceSettings;

  // LLM configuration
  llm: LLMConfig;

  // Notifications (future)
  notifications?: NotificationSettings;
}

export interface FeedSettings {
  title: string;
  description: string;
  maxItems: number; // Max items in RSS feed
  ttl: number; // Time-to-live (minutes)
}

export interface ImportanceSettings {
  defaultThreshold: number; // Global threshold (0.0 - 1.0)
  llmPrompt: string; // Custom prompt template
  context: string; // User context for LLM
}

export interface NotificationSettings {
  enabled: boolean;
  urgentThreshold: number; // Send notification if score > this
}

// ============================================================================
// Database Models
// ============================================================================

export interface HeadlineRow {
  id: string;
  plugin_id: string;
  title: string;
  description: string | null;
  link: string | null;
  pub_date: string; // ISO date string
  created_at: string; // ISO date string
  category: string;
  tags: string; // JSON array
  importance_score: number | null;
  importance_reason: string | null;
  is_important: number; // 0 or 1 (boolean)
  metadata: string; // JSON object
  read: number; // 0 or 1 (boolean)
  starred: number; // 0 or 1 (boolean)
  archived: number; // 0 or 1 (boolean)
}

export interface PluginConfigRow {
  plugin_id: string;
  enabled: number; // 0 or 1 (boolean)
  schedule: string;
  config: string; // JSON object
  llm_enabled: number; // 0 or 1 (boolean)
  base_weight: number;
  threshold: number;
  importance_rules: string; // JSON array
  last_run: string | null; // ISO date string
  last_error: string | null;
}

export interface AuthRow {
  plugin_id: string;
  auth_type: string;
  credentials: string; // Encrypted JSON
  created_at: string; // ISO date string
  updated_at: string; // ISO date string
}

export interface UserPreferenceRow {
  key: string;
  value: string; // JSON value
}
