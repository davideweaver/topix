/**
 * Database migrations for Topix
 * Each migration is a SQL statement that creates or alters tables
 */

export interface Migration {
  version: number;
  name: string;
  up: string;
  down: string;
}

/**
 * All database migrations in order
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: `
      -- Create headlines table
      CREATE TABLE IF NOT EXISTS headlines (
        id TEXT PRIMARY KEY,
        plugin_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        link TEXT,
        pub_date DATETIME NOT NULL,
        created_at DATETIME NOT NULL,
        category TEXT NOT NULL,
        tags TEXT,
        importance_score REAL,
        importance_reason TEXT,
        is_important BOOLEAN NOT NULL DEFAULT 0,
        metadata TEXT,
        read BOOLEAN NOT NULL DEFAULT 0,
        starred BOOLEAN NOT NULL DEFAULT 0,
        archived BOOLEAN NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_headlines_plugin_id ON headlines(plugin_id);
      CREATE INDEX IF NOT EXISTS idx_headlines_pub_date ON headlines(pub_date);
      CREATE INDEX IF NOT EXISTS idx_headlines_created_at ON headlines(created_at);
      CREATE INDEX IF NOT EXISTS idx_headlines_is_important ON headlines(is_important);
      CREATE INDEX IF NOT EXISTS idx_headlines_archived ON headlines(archived);

      -- Create plugin_configs table
      CREATE TABLE IF NOT EXISTS plugin_configs (
        plugin_id TEXT PRIMARY KEY,
        enabled BOOLEAN NOT NULL DEFAULT 1,
        schedule TEXT NOT NULL,
        config TEXT NOT NULL,
        llm_enabled BOOLEAN NOT NULL DEFAULT 1,
        base_weight REAL NOT NULL DEFAULT 1.0,
        threshold REAL NOT NULL DEFAULT 0.5,
        importance_rules TEXT,
        last_run DATETIME,
        last_error TEXT
      );

      -- Create auth table
      CREATE TABLE IF NOT EXISTS auth (
        plugin_id TEXT PRIMARY KEY,
        auth_type TEXT NOT NULL,
        credentials TEXT NOT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
      );

      -- Create user_preferences table
      CREATE TABLE IF NOT EXISTS user_preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- Create migrations table to track schema version
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at DATETIME NOT NULL
      );
    `,
    down: `
      DROP TABLE IF EXISTS headlines;
      DROP TABLE IF EXISTS plugin_configs;
      DROP TABLE IF EXISTS auth;
      DROP TABLE IF EXISTS user_preferences;
      DROP TABLE IF EXISTS migrations;
    `,
  },
];

/**
 * Get the latest migration version
 */
export function getLatestVersion(): number {
  return migrations[migrations.length - 1].version;
}
