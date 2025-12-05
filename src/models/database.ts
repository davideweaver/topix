/**
 * Database layer for Topix
 * Handles SQLite database initialization, migrations, and CRUD operations
 */

import Database from 'better-sqlite3';
import { getDatabasePath, ensureDataDir } from '@/utils/paths';
import { migrations, getLatestVersion } from './migrations';
import {
  Headline,
  HeadlineRow,
  PluginConfig,
  PluginConfigRow,
  AuthRow,
  AuthCredentials,
  UserPreferences,
  UserPreferenceRow,
  ImportanceRule,
} from './types';

export class TopixDatabase {
  private db: Database.Database;

  constructor(dbPath?: string) {
    // Ensure data directory exists
    ensureDataDir();

    // Initialize database
    const path = dbPath || getDatabasePath();
    this.db = new Database(path);

    // Enable foreign keys and WAL mode for better performance
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');

    // Run migrations
    this.migrate();
  }

  /**
   * Run database migrations
   */
  private migrate(): void {
    // Get current version
    const currentVersion = this.getCurrentVersion();
    const latestVersion = getLatestVersion();

    if (currentVersion === latestVersion) {
      return; // Already up to date
    }

    console.log(`Migrating database from version ${currentVersion} to ${latestVersion}...`);

    // Run migrations in order
    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        console.log(`  Applying migration ${migration.version}: ${migration.name}`);

        // Run migration in a transaction
        const applyMigration = this.db.transaction(() => {
          this.db.exec(migration.up);
          this.db
            .prepare(
              "INSERT INTO migrations (version, name, applied_at) VALUES (?, ?, datetime('now'))"
            )
            .run(migration.version, migration.name);
        });

        applyMigration();
      }
    }

    console.log('Database migrations complete.');
  }

  /**
   * Get current database version
   */
  private getCurrentVersion(): number {
    try {
      const result = this.db
        .prepare('SELECT MAX(version) as version FROM migrations')
        .get() as { version: number | null };
      return result.version || 0;
    } catch {
      // Migrations table doesn't exist yet
      return 0;
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  // ==========================================================================
  // Headlines
  // ==========================================================================

  /**
   * Insert a new headline
   */
  insertHeadline(headline: Headline): void {
    const stmt = this.db.prepare(`
      INSERT INTO headlines (
        id, plugin_id, title, description, link, pub_date, created_at,
        category, tags, importance_score, importance_reason,
        metadata, read, starred, archived
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    stmt.run(
      headline.id,
      headline.pluginId,
      headline.title,
      headline.description || null,
      headline.link || null,
      headline.pubDate.toISOString(),
      headline.createdAt.toISOString(),
      headline.category,
      JSON.stringify(headline.tags),
      headline.importanceScore || null,
      headline.importanceReason || null,
      JSON.stringify(headline.metadata),
      headline.read ? 1 : 0,
      headline.starred ? 1 : 0,
      headline.archived ? 1 : 0
    );
  }

  /**
   * Get headlines with optional filters
   */
  getHeadlines(options: {
    limit?: number;
    offset?: number;
    category?: string;
    pluginId?: string;
    minImportanceScore?: number;
    archived?: boolean;
  } = {}): Headline[] {
    const {
      limit = 50,
      offset = 0,
      category,
      pluginId,
      minImportanceScore,
      archived = false,
    } = options;

    let sql = 'SELECT * FROM headlines WHERE archived = ?';
    const params: any[] = [archived ? 1 : 0];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    if (pluginId) {
      sql += ' AND plugin_id = ?';
      params.push(pluginId);
    }

    if (minImportanceScore !== undefined) {
      sql += ' AND importance_score >= ?';
      params.push(minImportanceScore);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = this.db.prepare(sql).all(...params) as HeadlineRow[];
    return rows.map(this.rowToHeadline);
  }

  /**
   * Get a single headline by ID
   */
  getHeadlineById(id: string): Headline | null {
    const row = this.db
      .prepare('SELECT * FROM headlines WHERE id = ?')
      .get(id) as HeadlineRow | undefined;

    return row ? this.rowToHeadline(row) : null;
  }

  /**
   * Update headline status (read, starred, archived)
   */
  updateHeadlineStatus(
    id: string,
    updates: { read?: boolean; starred?: boolean; archived?: boolean }
  ): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.read !== undefined) {
      fields.push('read = ?');
      values.push(updates.read ? 1 : 0);
    }

    if (updates.starred !== undefined) {
      fields.push('starred = ?');
      values.push(updates.starred ? 1 : 0);
    }

    if (updates.archived !== undefined) {
      fields.push('archived = ?');
      values.push(updates.archived ? 1 : 0);
    }

    if (fields.length === 0) return;

    values.push(id);
    const sql = `UPDATE headlines SET ${fields.join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...values);
  }

  /**
   * Get headlines for a specific plugin with optional filters
   */
  getPluginHeadlines(
    pluginId: string,
    options: {
      limit?: number;
      since?: Date;
    } = {}
  ): Headline[] {
    const { limit, since } = options;

    let sql = 'SELECT * FROM headlines WHERE plugin_id = ?';
    const params: any[] = [pluginId];

    if (since) {
      sql += ' AND pub_date >= ?';
      params.push(since.toISOString());
    }

    sql += ' ORDER BY pub_date DESC';

    if (limit) {
      sql += ' LIMIT ?';
      params.push(limit);
    }

    const rows = this.db.prepare(sql).all(...params) as HeadlineRow[];
    return rows.map(this.rowToHeadline);
  }

  /**
   * Delete old headlines for a plugin, keeping only the N most recent
   */
  deleteOldHeadlinesByCount(pluginId: string, keepCount: number): number {
    // Get IDs of headlines to keep (most recent N)
    const keepIds = this.db
      .prepare(
        'SELECT id FROM headlines WHERE plugin_id = ? ORDER BY pub_date DESC LIMIT ?'
      )
      .all(pluginId, keepCount) as { id: string }[];

    if (keepIds.length === 0) {
      // No headlines to keep, delete all for this plugin
      const result = this.db
        .prepare('DELETE FROM headlines WHERE plugin_id = ?')
        .run(pluginId);
      return result.changes;
    }

    // Delete all except the ones we want to keep
    const placeholders = keepIds.map(() => '?').join(',');
    const sql = `DELETE FROM headlines WHERE plugin_id = ? AND id NOT IN (${placeholders})`;
    const params = [pluginId, ...keepIds.map((row) => row.id)];

    const result = this.db.prepare(sql).run(...params);
    return result.changes;
  }

  /**
   * Delete headlines for a plugin older than N hours
   */
  deleteOldHeadlinesByDuration(pluginId: string, hours: number): number {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hours);

    const result = this.db
      .prepare('DELETE FROM headlines WHERE plugin_id = ? AND pub_date < ?')
      .run(pluginId, cutoffDate.toISOString());

    return result.changes;
  }

  /**
   * Delete old headlines (cleanup)
   */
  deleteOldHeadlines(daysOld: number): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = this.db
      .prepare('DELETE FROM headlines WHERE created_at < ?')
      .run(cutoffDate.toISOString());

    return result.changes;
  }

  // ==========================================================================
  // Plugin Configs
  // ==========================================================================

  /**
   * Insert or update plugin configuration
   */
  upsertPluginConfig(config: PluginConfig): void {
    const stmt = this.db.prepare(`
      INSERT INTO plugin_configs (
        plugin_id, enabled, schedule, config, llm_enabled, base_weight,
        threshold, importance_rules, last_run, last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(plugin_id) DO UPDATE SET
        enabled = excluded.enabled,
        schedule = excluded.schedule,
        config = excluded.config,
        llm_enabled = excluded.llm_enabled,
        base_weight = excluded.base_weight,
        threshold = excluded.threshold,
        importance_rules = excluded.importance_rules,
        last_run = excluded.last_run,
        last_error = excluded.last_error
    `);

    stmt.run(
      config.pluginId,
      config.enabled ? 1 : 0,
      config.schedule,
      JSON.stringify(config.config),
      config.importance.llmEnabled ? 1 : 0,
      config.importance.baseWeight,
      config.importance.threshold,
      JSON.stringify(config.importance.rules),
      config.lastRun?.toISOString() || null,
      config.lastError || null
    );
  }

  /**
   * Get plugin configuration by ID
   */
  getPluginConfig(pluginId: string): PluginConfig | null {
    const row = this.db
      .prepare('SELECT * FROM plugin_configs WHERE plugin_id = ?')
      .get(pluginId) as PluginConfigRow | undefined;

    return row ? this.rowToPluginConfig(row) : null;
  }

  /**
   * Get all plugin configurations
   */
  getAllPluginConfigs(): PluginConfig[] {
    const rows = this.db.prepare('SELECT * FROM plugin_configs').all() as PluginConfigRow[];
    return rows.map(this.rowToPluginConfig);
  }

  /**
   * Get enabled plugin configurations
   */
  getEnabledPluginConfigs(): PluginConfig[] {
    const rows = this.db
      .prepare('SELECT * FROM plugin_configs WHERE enabled = 1')
      .all() as PluginConfigRow[];
    return rows.map(this.rowToPluginConfig);
  }

  /**
   * Update plugin last run time and error
   */
  updatePluginRun(pluginId: string, error?: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE plugin_configs SET last_run = ?, last_error = ? WHERE plugin_id = ?')
      .run(now, error || null, pluginId);
  }

  /**
   * Delete plugin configuration
   */
  deletePluginConfig(pluginId: string): void {
    this.db.prepare('DELETE FROM plugin_configs WHERE plugin_id = ?').run(pluginId);
  }

  // ==========================================================================
  // Authentication
  // ==========================================================================

  /**
   * Store authentication credentials
   */
  upsertAuth(pluginId: string, authType: string, credentials: AuthCredentials): void {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `
      INSERT INTO auth (plugin_id, auth_type, credentials, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(plugin_id) DO UPDATE SET
        auth_type = excluded.auth_type,
        credentials = excluded.credentials,
        updated_at = excluded.updated_at
    `
      )
      .run(pluginId, authType, JSON.stringify(credentials), now, now);
  }

  /**
   * Get authentication credentials for a plugin
   */
  getAuth(pluginId: string): AuthCredentials | null {
    const row = this.db
      .prepare('SELECT * FROM auth WHERE plugin_id = ?')
      .get(pluginId) as AuthRow | undefined;

    if (!row) return null;

    return JSON.parse(row.credentials) as AuthCredentials;
  }

  /**
   * Delete authentication credentials
   */
  deleteAuth(pluginId: string): void {
    this.db.prepare('DELETE FROM auth WHERE plugin_id = ?').run(pluginId);
  }

  /**
   * Get all authentication entries
   */
  getAllAuth(): Array<{ pluginId: string; authType: string }> {
    const rows = this.db.prepare('SELECT plugin_id, auth_type FROM auth').all() as Array<{
      plugin_id: string;
      auth_type: string;
    }>;

    return rows.map((row) => ({
      pluginId: row.plugin_id,
      authType: row.auth_type,
    }));
  }

  // ==========================================================================
  // User Preferences
  // ==========================================================================

  /**
   * Set a user preference
   */
  setPreference(key: string, value: any): void {
    this.db
      .prepare(
        `
      INSERT INTO user_preferences (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `
      )
      .run(key, JSON.stringify(value));
  }

  /**
   * Get a user preference
   */
  getPreference(key: string): any | null {
    const row = this.db
      .prepare('SELECT value FROM user_preferences WHERE key = ?')
      .get(key) as UserPreferenceRow | undefined;

    return row ? JSON.parse(row.value) : null;
  }

  /**
   * Get all user preferences
   */
  getAllPreferences(): Record<string, any> {
    const rows = this.db.prepare('SELECT key, value FROM user_preferences').all() as UserPreferenceRow[];

    const prefs: Record<string, any> = {};
    for (const row of rows) {
      prefs[row.key] = JSON.parse(row.value);
    }

    return prefs;
  }

  /**
   * Get full user preferences object with defaults
   */
  getUserPreferences(): UserPreferences {
    const defaults: UserPreferences = {
      feed: {
        title: 'Topix - Your Personal Headlines',
        description: 'Curated headlines from your digital life',
        maxItems: 50,
        ttl: 30,
      },
      importance: {
        defaultThreshold: 0.6,
        llmPrompt: `You are an AI assistant helping to determine if a headline is important to the user.

User Context:
{userContext}

Headline:
Title: {headline.title}
Description: {headline.description}
Category: {headline.category}
Tags: {headline.tags}

Determine if this headline is important to the user. Respond with:
1. A score from 0.0 (not important) to 1.0 (very important)
2. A brief reason for your score (1-2 sentences)

Response format (JSON):
{
  "score": 0.75,
  "reason": "Brief explanation here"
}`,
        context: '',
      },
      llm: {
        provider: 'ollama',
        ollama: {
          endpoint: 'http://localhost:11434',
          model: 'llama3.2:3b',
          timeout: 10000,
        },
        openrouter: {
          endpoint: 'https://openrouter.ai/api/v1/chat/completions',
          model: 'meta-llama/llama-3.1-8b-instruct',
          apiKey: '',
          timeout: 10000,
        },
      },
      notifications: {
        enabled: false,
        urgentThreshold: 0.9,
      },
    };

    // Override with stored preferences
    const feed = this.getPreference('feed');
    const importance = this.getPreference('importance');
    const llm = this.getPreference('llm');
    const notifications = this.getPreference('notifications');

    return {
      feed: feed || defaults.feed,
      importance: importance || defaults.importance,
      llm: llm || defaults.llm,
      notifications: notifications || defaults.notifications,
    };
  }

  /**
   * Set full user preferences object
   */
  setUserPreferences(prefs: UserPreferences): void {
    this.setPreference('feed', prefs.feed);
    this.setPreference('importance', prefs.importance);
    this.setPreference('llm', prefs.llm);
    if (prefs.notifications) {
      this.setPreference('notifications', prefs.notifications);
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Convert database row to Headline object
   */
  private rowToHeadline(row: HeadlineRow): Headline {
    return {
      id: row.id,
      pluginId: row.plugin_id,
      title: row.title,
      description: row.description || undefined,
      link: row.link || undefined,
      pubDate: new Date(row.pub_date),
      createdAt: new Date(row.created_at),
      category: row.category,
      tags: JSON.parse(row.tags) as string[],
      importanceScore: row.importance_score || 0,
      importanceReason: row.importance_reason || undefined,
      metadata: JSON.parse(row.metadata) as Record<string, any>,
      read: row.read === 1,
      starred: row.starred === 1,
      archived: row.archived === 1,
    };
  }

  /**
   * Convert database row to PluginConfig object
   */
  private rowToPluginConfig(row: PluginConfigRow): PluginConfig {
    return {
      pluginId: row.plugin_id,
      enabled: row.enabled === 1,
      schedule: row.schedule,
      config: JSON.parse(row.config) as Record<string, any>,
      importance: {
        llmEnabled: row.llm_enabled === 1,
        baseWeight: row.base_weight,
        threshold: row.threshold,
        rules: JSON.parse(row.importance_rules || '[]') as ImportanceRule[],
      },
      lastRun: row.last_run ? new Date(row.last_run) : undefined,
      lastError: row.last_error || undefined,
    };
  }
}

/**
 * Create and return a database instance
 */
export function createDatabase(dbPath?: string): TopixDatabase {
  return new TopixDatabase(dbPath);
}

/**
 * Singleton database instance
 */
let dbInstance: TopixDatabase | null = null;

/**
 * Get the singleton database instance
 */
export function getDatabase(): TopixDatabase {
  if (!dbInstance) {
    dbInstance = new TopixDatabase();
  }
  return dbInstance;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
