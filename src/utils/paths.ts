/**
 * Path utilities for Topix data directory
 * All data stored in ~/Library/Application Support/topix/
 */

import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

/**
 * Get the Topix data directory path
 * @returns ~/Library/Application Support/topix/
 */
export function getDataDir(): string {
  // Allow override via environment variable (useful for testing)
  if (process.env.TOPIX_DATA_DIR) {
    return process.env.TOPIX_DATA_DIR;
  }

  const home = homedir();
  return join(home, 'Library', 'Application Support', 'topix');
}

/**
 * Ensure data directory exists, create if needed
 */
export function ensureDataDir(): void {
  const dataDir = getDataDir();

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  // Create subdirectories
  const subdirs = ['logs', 'logs/plugins', 'plugins'];
  for (const subdir of subdirs) {
    const path = join(dataDir, subdir);
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
  }
}

/**
 * Get path to database file
 * @returns ~/Library/Application Support/topix/topix.db
 */
export function getDatabasePath(): string {
  return join(getDataDir(), 'topix.db');
}

/**
 * Get path to config file
 * @returns ~/Library/Application Support/topix/config.yaml
 */
export function getConfigPath(): string {
  return join(getDataDir(), 'config.yaml');
}

/**
 * Get path to credentials file (fallback if Keychain not available)
 * @returns ~/Library/Application Support/topix/credentials.json
 */
export function getCredentialsPath(): string {
  return join(getDataDir(), 'credentials.json');
}

/**
 * Get path to logs directory
 * @returns ~/Library/Application Support/topix/logs/
 */
export function getLogsDir(): string {
  return join(getDataDir(), 'logs');
}

/**
 * Get path to main log file
 * @returns ~/Library/Application Support/topix/logs/topix.log
 */
export function getLogPath(): string {
  return join(getLogsDir(), 'topix.log');
}

/**
 * Get path to plugin log file
 * @param pluginId Plugin identifier
 * @returns ~/Library/Application Support/topix/logs/plugins/{pluginId}.log
 */
export function getPluginLogPath(pluginId: string): string {
  return join(getLogsDir(), 'plugins', `${pluginId}.log`);
}

/**
 * Get path to user plugins directory
 * @returns ~/Library/Application Support/topix/plugins/
 */
export function getPluginsDir(): string {
  return join(getDataDir(), 'plugins');
}
