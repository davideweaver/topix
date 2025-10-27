/**
 * Plugin Manager
 * Handles plugin discovery, loading, lifecycle, and execution
 */

import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getPluginsDir } from '@/utils/paths';
import { TopixDatabase } from '@/models/database';
import {
  TopixPlugin,
  PluginConfig,
  Headline,
  FetchContext,
  HealthStatus,
} from '@/models/types';
import { getConfigManager } from './config-manager';
import { yamlPluginToDbPlugin } from '@/utils/config-file';

export interface PluginManagerOptions {
  verbose?: boolean;
}

export class PluginManager {
  private plugins: Map<string, TopixPlugin> = new Map();
  private db: TopixDatabase;
  private verbose: boolean;

  constructor(db: TopixDatabase, options: PluginManagerOptions = {}) {
    this.db = db;
    this.verbose = options.verbose ?? true; // Default to verbose for backward compatibility
  }

  /**
   * Initialize the plugin manager
   * Discovers and loads all plugins (built-in and user plugins)
   */
  async initialize(options: { initializePlugins?: boolean } = {}): Promise<void> {
    const { initializePlugins = true } = options;

    if (this.verbose) {
      console.log('🔌 Initializing Plugin Manager...');
    }

    // Load built-in plugins
    await this.loadBuiltInPlugins();

    // Load user plugins
    await this.loadUserPlugins();

    // Initialize enabled plugins with their configs (only if requested)
    if (initializePlugins) {
      await this.initializeEnabledPlugins();
    }

    if (this.verbose) {
      console.log(`✅ Plugin Manager initialized with ${this.plugins.size} plugins`);
    }
  }

  /**
   * Shutdown all plugins
   */
  async shutdown(): Promise<void> {
    if (this.verbose) {
      console.log('🔌 Shutting down plugins...');
    }

    for (const [pluginId, plugin] of this.plugins) {
      try {
        await plugin.shutdown();
        if (this.verbose) {
          console.log(`  ✓ ${pluginId} shut down`);
        }
      } catch (error) {
        console.error(`  ✗ Error shutting down ${pluginId}:`, error);
      }
    }

    this.plugins.clear();
  }

  /**
   * Load built-in plugins from src/plugins/
   */
  private async loadBuiltInPlugins(): Promise<void> {
    const pluginsDir = join(__dirname, '..', 'plugins');

    if (!existsSync(pluginsDir)) {
      if (this.verbose) {
        console.warn('  ⚠️  Built-in plugins directory not found');
      }
      return;
    }

    const files = readdirSync(pluginsDir);

    for (const file of files) {
      // Skip non-TypeScript/JavaScript files, declaration files, and example plugin
      if (
        (!file.endsWith('.ts') && !file.endsWith('.js')) ||
        file.endsWith('.d.ts') ||
        file.includes('example') ||
        file.includes('.test.') ||
        file.includes('.spec.')
      ) {
        continue;
      }

      try {
        const pluginPath = join(pluginsDir, file);
        const pluginModule = await import(pluginPath);
        const plugin: TopixPlugin = pluginModule.default;

        if (!this.isValidPlugin(plugin)) {
          if (this.verbose) {
            console.warn(`  ⚠️  Invalid plugin in ${file}`);
          }
          continue;
        }

        this.plugins.set(plugin.id, plugin);
        if (this.verbose) {
          console.log(`  ✓ Loaded built-in plugin: ${plugin.name} (${plugin.id})`);
        }
      } catch (error) {
        console.error(`  ✗ Error loading plugin ${file}:`, error);
      }
    }
  }

  /**
   * Load user plugins from ~/Library/Application Support/topix/plugins/
   */
  private async loadUserPlugins(): Promise<void> {
    const userPluginsDir = getPluginsDir();

    if (!existsSync(userPluginsDir)) {
      // User plugins directory doesn't exist yet, skip
      return;
    }

    const files = readdirSync(userPluginsDir);

    for (const file of files) {
      // Only load .js files (user plugins must be compiled)
      if (!file.endsWith('.js')) {
        continue;
      }

      try {
        const pluginPath = join(userPluginsDir, file);
        const pluginModule = await import(pluginPath);
        const plugin: TopixPlugin = pluginModule.default;

        if (!this.isValidPlugin(plugin)) {
          if (this.verbose) {
            console.warn(`  ⚠️  Invalid user plugin in ${file}`);
          }
          continue;
        }

        // Don't override built-in plugins
        if (this.plugins.has(plugin.id)) {
          if (this.verbose) {
            console.warn(`  ⚠️  User plugin ${plugin.id} conflicts with built-in plugin, skipping`);
          }
          continue;
        }

        this.plugins.set(plugin.id, plugin);
        if (this.verbose) {
          console.log(`  ✓ Loaded user plugin: ${plugin.name} (${plugin.id})`);
        }
      } catch (error) {
        console.error(`  ✗ Error loading user plugin ${file}:`, error);
      }
    }
  }

  /**
   * Get plugin configs from ConfigManager
   */
  private getPluginConfigs(): Record<string, PluginConfig> {
    const configManager = getConfigManager();
    const fullConfig = configManager.getFullConfig();
    const pluginConfigs: Record<string, PluginConfig> = {};

    for (const [pluginId, yamlConfig] of Object.entries(fullConfig.plugins)) {
      pluginConfigs[pluginId] = yamlPluginToDbPlugin(pluginId, yamlConfig);
    }

    return pluginConfigs;
  }

  /**
   * Get a specific plugin config from ConfigManager
   */
  private getPluginConfig(pluginId: string): PluginConfig | null {
    const configs = this.getPluginConfigs();
    return configs[pluginId] || null;
  }

  /**
   * Initialize enabled plugins with their configurations
   */
  private async initializeEnabledPlugins(): Promise<void> {
    const pluginConfigs = this.getPluginConfigs();
    const enabledConfigs = Object.values(pluginConfigs).filter((c) => c.enabled);

    for (const config of enabledConfigs) {
      const plugin = this.plugins.get(config.pluginId);

      if (!plugin) {
        if (this.verbose) {
          console.warn(`  ⚠️  Plugin ${config.pluginId} is enabled but not loaded`);
        }
        continue;
      }

      try {
        await plugin.initialize(config);
        if (this.verbose) {
          console.log(`  ✓ Initialized plugin: ${plugin.name}`);
        }
      } catch (error) {
        console.error(`  ✗ Error initializing ${plugin.name}:`, error);
        this.db.updatePluginRun(
          config.pluginId,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }
  }

  /**
   * Handle config reload from file watcher
   * Reinitializes plugins whose configs changed
   */
  async handleConfigReload(): Promise<void> {
    console.log('🔄 Reloading plugin configurations...');

    const pluginConfigs = this.getPluginConfigs();

    for (const [pluginId, config] of Object.entries(pluginConfigs)) {
      const plugin = this.plugins.get(pluginId);

      if (!plugin) {
        continue; // Plugin not loaded
      }

      if (config.enabled) {
        // Plugin is enabled - reinitialize it
        try {
          await plugin.shutdown();
          await plugin.initialize(config);
          console.log(`  ✓ Reloaded plugin: ${plugin.name}`);
        } catch (error) {
          console.error(`  ✗ Error reloading ${plugin.name}:`, error);
        }
      } else {
        // Plugin is disabled - shut it down
        try {
          await plugin.shutdown();
          console.log(`  ✓ Disabled plugin: ${plugin.name}`);
        } catch (error) {
          console.error(`  ✗ Error disabling ${plugin.name}:`, error);
        }
      }
    }

    console.log('✅ Plugin configuration reload complete');
  }

  /**
   * Validate that an object implements the TopixPlugin interface
   */
  private isValidPlugin(plugin: any): plugin is TopixPlugin {
    return (
      plugin &&
      typeof plugin === 'object' &&
      typeof plugin.id === 'string' &&
      typeof plugin.name === 'string' &&
      typeof plugin.description === 'string' &&
      typeof plugin.version === 'string' &&
      typeof plugin.initialize === 'function' &&
      typeof plugin.fetchHeadlines === 'function' &&
      typeof plugin.getConfigSchema === 'function'
    );
  }

  /**
   * Get a plugin by ID
   */
  getPlugin(pluginId: string): TopixPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Get all loaded plugins
   */
  getAllPlugins(): TopixPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get enabled plugins
   */
  getEnabledPlugins(): TopixPlugin[] {
    const pluginConfigs = this.getPluginConfigs();
    const enabledIds = Object.values(pluginConfigs)
      .filter((c) => c.enabled)
      .map((c) => c.pluginId);

    return Array.from(this.plugins.values()).filter((plugin) => enabledIds.includes(plugin.id));
  }

  /**
   * Enable a plugin (deprecated - edit config file instead)
   */
  async enablePlugin(pluginId: string): Promise<void> {
    console.warn('⚠️  enablePlugin is deprecated - edit config.yaml instead');
    const plugin = this.plugins.get(pluginId);

    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    // We can't easily modify the config file from here
    // This method is kept for backwards compatibility but should not be used
    throw new Error('Please enable the plugin by editing config.yaml');
  }

  /**
   * Disable a plugin (deprecated - edit config file instead)
   */
  async disablePlugin(pluginId: string): Promise<void> {
    console.warn('⚠️  disablePlugin is deprecated - edit config.yaml instead');
    const plugin = this.plugins.get(pluginId);

    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    // We can't easily modify the config file from here
    // This method is kept for backwards compatibility but should not be used
    throw new Error('Please disable the plugin by editing config.yaml');
  }

  /**
   * Reinitialize a plugin with updated configuration
   * Used when config changes while service is running
   */
  async reinitializePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);

    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    const config = this.getPluginConfig(pluginId);

    if (!config) {
      throw new Error(`Plugin ${pluginId} has no configuration`);
    }

    // Shutdown plugin first
    await plugin.shutdown();

    // Reinitialize with updated config
    await plugin.initialize(config);

    if (this.verbose) {
      console.log(`✓ Reinitialized plugin: ${plugin.name}`);
    }
  }

  /**
   * Enforce retention policy for a plugin
   * Deletes old headlines according to plugin's retention policy
   */
  private enforceRetentionPolicy(pluginId: string, pluginName: string, policy: import('@/models/types').RetentionPolicy): void {
    switch (policy.type) {
      case 'count':
        const deletedByCount = this.db.deleteOldHeadlinesByCount(pluginId, policy.value);
        if (deletedByCount > 0 && this.verbose) {
          console.log(`  ✓ Deleted ${deletedByCount} old headlines from ${pluginName} (keeping last ${policy.value})`);
        }
        break;

      case 'duration':
        const deletedByDuration = this.db.deleteOldHeadlinesByDuration(pluginId, policy.hours);
        if (deletedByDuration > 0 && this.verbose) {
          console.log(`  ✓ Deleted ${deletedByDuration} old headlines from ${pluginName} (keeping last ${policy.hours}h)`);
        }
        break;

      case 'unlimited':
        // Keep all headlines, no cleanup
        break;
    }
  }

  /**
   * Fetch headlines from a specific plugin
   */
  async fetchFromPlugin(pluginId: string): Promise<Headline[]> {
    const plugin = this.plugins.get(pluginId);

    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    const config = this.getPluginConfig(pluginId);

    if (!config || !config.enabled) {
      throw new Error(`Plugin ${pluginId} is not enabled`);
    }

    try {
      const context: FetchContext = {
        pluginId,
        config: config.config,
        lastRun: config.lastRun,
        getHistory: (options) => this.db.getPluginHeadlines(pluginId, options),
        db: this.db,
      };

      const headlines = await plugin.fetchHeadlines(context);

      // Store headlines in database
      for (const headline of headlines) {
        this.db.insertHeadline(headline);
      }

      // Enforce retention policy
      const policy = plugin.getRetentionPolicy();
      this.enforceRetentionPolicy(pluginId, plugin.name, policy);

      // Update last run
      this.db.updatePluginRun(pluginId);

      console.log(`✓ Fetched ${headlines.length} headlines from ${plugin.name}`);

      return headlines;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`✗ Error fetching from ${plugin.name}:`, errorMessage);

      // Update last error
      this.db.updatePluginRun(pluginId, errorMessage);

      throw error;
    }
  }

  /**
   * Fetch headlines from all enabled plugins
   */
  async fetchFromAllPlugins(): Promise<Map<string, Headline[]>> {
    const results = new Map<string, Headline[]>();
    const enabledPlugins = this.getEnabledPlugins();

    console.log(`🔄 Fetching from ${enabledPlugins.length} enabled plugins...`);

    for (const plugin of enabledPlugins) {
      try {
        const headlines = await this.fetchFromPlugin(plugin.id);
        results.set(plugin.id, headlines);
      } catch (error) {
        console.error(`  ✗ Failed to fetch from ${plugin.name}`);
        results.set(plugin.id, []);
      }
    }

    const totalHeadlines = Array.from(results.values()).reduce(
      (sum, headlines) => sum + headlines.length,
      0
    );

    console.log(`✅ Fetched ${totalHeadlines} total headlines from ${enabledPlugins.length} plugins`);

    return results;
  }

  /**
   * Check health of a plugin
   */
  async checkPluginHealth(pluginId: string): Promise<HealthStatus> {
    const plugin = this.plugins.get(pluginId);

    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    return await plugin.healthCheck();
  }

  /**
   * Check health of all plugins
   */
  async checkAllPluginHealth(): Promise<Map<string, HealthStatus>> {
    const results = new Map<string, HealthStatus>();

    for (const plugin of this.plugins.values()) {
      try {
        const health = await plugin.healthCheck();
        results.set(plugin.id, health);
      } catch (error) {
        results.set(plugin.id, {
          healthy: false,
          message: error instanceof Error ? error.message : 'Health check failed',
          lastChecked: new Date(),
        });
      }
    }

    return results;
  }

  /**
   * Update plugin configuration (deprecated - edit config file instead)
   */
  updatePluginConfig(_pluginId: string, _updates: Partial<PluginConfig>): void {
    console.warn('⚠️  updatePluginConfig is deprecated - edit config.yaml instead');
    throw new Error('Please update the plugin configuration by editing config.yaml');
  }

  /**
   * Get plugin statistics
   */
  getPluginStats(): {
    total: number;
    enabled: number;
    disabled: number;
  } {
    const pluginConfigs = this.getPluginConfigs();
    const enabled = Object.values(pluginConfigs).filter((c) => c.enabled).length;

    return {
      total: this.plugins.size,
      enabled,
      disabled: this.plugins.size - enabled,
    };
  }
}

/**
 * Singleton plugin manager instance
 */
let pluginManagerInstance: PluginManager | null = null;

/**
 * Get the singleton plugin manager instance
 */
export function getPluginManager(db: TopixDatabase): PluginManager {
  if (!pluginManagerInstance) {
    pluginManagerInstance = new PluginManager(db);
  }
  return pluginManagerInstance;
}

/**
 * Shutdown and reset plugin manager
 */
export async function resetPluginManager(): Promise<void> {
  if (pluginManagerInstance) {
    await pluginManagerInstance.shutdown();
    pluginManagerInstance = null;
  }
}
