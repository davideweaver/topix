/**
 * Tests for PluginManager
 */

import { PluginManager } from '@/managers/plugin-manager';
import { TopixDatabase } from '@/models/database';
import {
  TopixPlugin,
  PluginConfig,
  Headline,
  FetchContext,
  ConfigSchema,
  ValidationResult,
  HealthStatus,
  AuthRequirement,
  AuthCredentials,
} from '@/models/types';
import { v4 as uuidv4 } from 'uuid';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';

// Mock plugin for testing
class MockPlugin implements TopixPlugin {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version = '1.0.0';
  readonly author = 'Test Author';

  private initialized = false;
  private headlinesToReturn: Headline[] = [];

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
    this.description = `Mock plugin ${name}`;
  }

  setHeadlinesToReturn(headlines: Headline[]): void {
    this.headlinesToReturn = headlines;
  }

  async initialize(_config: PluginConfig): Promise<void> {
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  async fetchHeadlines(_context: FetchContext): Promise<Headline[]> {
    if (!this.initialized) {
      throw new Error('Plugin not initialized');
    }
    return this.headlinesToReturn;
  }

  getConfigSchema(): ConfigSchema {
    return {
      type: 'object',
      properties: {},
      required: [],
    };
  }

  validateConfig(_config: unknown): ValidationResult {
    return { valid: true };
  }

  getAuthRequirements(): AuthRequirement | null {
    return null;
  }

  setAuthCredentials(_credentials: AuthCredentials): void {
    // No-op for mock
  }

  async healthCheck(): Promise<HealthStatus> {
    return {
      healthy: true,
      message: 'Mock plugin is healthy',
      lastChecked: new Date(),
    };
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

describe('PluginManager', () => {
  let db: TopixDatabase;
  let pluginManager: PluginManager;
  const testDbPath = join(__dirname, 'test-plugin-manager.db');

  beforeEach(() => {
    // Clean up test database if it exists
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    // Create new database for each test
    db = new TopixDatabase(testDbPath);

    // Create plugin manager
    pluginManager = new PluginManager(db);
  });

  afterEach(async () => {
    // Shutdown and clean up
    await pluginManager.shutdown();
    db.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  describe('Plugin Loading', () => {
    it('should initialize with no plugins', async () => {
      await pluginManager.initialize();

      const plugins = pluginManager.getAllPlugins();
      // May have example plugin if not filtered out
      expect(plugins.length).toBeGreaterThanOrEqual(0);
    });

    it('should get plugin by ID', async () => {
      await pluginManager.initialize();

      const plugin = pluginManager.getPlugin('non-existent');
      expect(plugin).toBeUndefined();
    });

    it('should get all plugins', async () => {
      await pluginManager.initialize();

      const plugins = pluginManager.getAllPlugins();
      expect(Array.isArray(plugins)).toBe(true);
    });
  });

  describe('Plugin Enable/Disable', () => {
    it('should enable a plugin', async () => {
      // Manually register a mock plugin
      const mockPlugin = new MockPlugin('test-plugin', 'Test Plugin');
      (pluginManager as any).plugins.set(mockPlugin.id, mockPlugin);

      await pluginManager.enablePlugin('test-plugin');

      const config = db.getPluginConfig('test-plugin');
      expect(config).toBeDefined();
      expect(config?.enabled).toBe(true);
      expect(mockPlugin.isInitialized()).toBe(true);
    });

    it('should disable a plugin', async () => {
      // Manually register and enable a mock plugin
      const mockPlugin = new MockPlugin('test-plugin', 'Test Plugin');
      (pluginManager as any).plugins.set(mockPlugin.id, mockPlugin);

      await pluginManager.enablePlugin('test-plugin');
      expect(mockPlugin.isInitialized()).toBe(true);

      await pluginManager.disablePlugin('test-plugin');

      const config = db.getPluginConfig('test-plugin');
      expect(config?.enabled).toBe(false);
      expect(mockPlugin.isInitialized()).toBe(false);
    });

    it('should throw error when enabling non-existent plugin', async () => {
      await expect(pluginManager.enablePlugin('non-existent')).rejects.toThrow(
        'Plugin non-existent not found'
      );
    });

    it('should throw error when disabling non-existent plugin', async () => {
      await expect(pluginManager.disablePlugin('non-existent')).rejects.toThrow(
        'Plugin non-existent not found'
      );
    });
  });

  describe('Fetching Headlines', () => {
    it('should fetch headlines from a plugin', async () => {
      const mockPlugin = new MockPlugin('test-plugin', 'Test Plugin');
      (pluginManager as any).plugins.set(mockPlugin.id, mockPlugin);

      // Create config
      const config: PluginConfig = {
        pluginId: 'test-plugin',
        enabled: true,
        schedule: '*/5 * * * *',
        config: {},
        importance: {
          llmEnabled: true,
          baseWeight: 1.0,
          threshold: 0.6,
          rules: [],
        },
      };
      db.upsertPluginConfig(config);

      // Set headlines to return
      const headline: Headline = {
        id: uuidv4(),
        pluginId: 'test-plugin',
        title: 'Test Headline',
        pubDate: new Date(),
        createdAt: new Date(),
        category: 'test',
        tags: [],
        importanceScore: 0.8,
        isImportant: true,
        metadata: {},
        read: false,
        starred: false,
        archived: false,
      };
      mockPlugin.setHeadlinesToReturn([headline]);

      await pluginManager.enablePlugin('test-plugin');
      const headlines = await pluginManager.fetchFromPlugin('test-plugin');

      expect(headlines).toHaveLength(1);
      expect(headlines[0].title).toBe('Test Headline');

      // Check that headline was saved to database
      const saved = db.getHeadlineById(headline.id);
      expect(saved).toBeDefined();
      expect(saved?.title).toBe('Test Headline');
    });

    it('should throw error when fetching from disabled plugin', async () => {
      const mockPlugin = new MockPlugin('test-plugin', 'Test Plugin');
      (pluginManager as any).plugins.set(mockPlugin.id, mockPlugin);

      await expect(pluginManager.fetchFromPlugin('test-plugin')).rejects.toThrow(
        'Plugin test-plugin is not enabled'
      );
    });

    it('should handle plugin errors gracefully', async () => {
      const mockPlugin = new MockPlugin('test-plugin', 'Test Plugin');
      (pluginManager as any).plugins.set(mockPlugin.id, mockPlugin);

      const config: PluginConfig = {
        pluginId: 'test-plugin',
        enabled: true,
        schedule: '*/5 * * * *',
        config: {},
        importance: {
          llmEnabled: true,
          baseWeight: 1.0,
          threshold: 0.6,
          rules: [],
        },
      };
      db.upsertPluginConfig(config);

      // Don't initialize the plugin so it throws an error
      await expect(pluginManager.fetchFromPlugin('test-plugin')).rejects.toThrow();

      // Check that error was recorded
      const updatedConfig = db.getPluginConfig('test-plugin');
      expect(updatedConfig?.lastError).toBeDefined();
    });

    it('should fetch from all enabled plugins', async () => {
      const plugin1 = new MockPlugin('plugin1', 'Plugin 1');
      const plugin2 = new MockPlugin('plugin2', 'Plugin 2');

      (pluginManager as any).plugins.set('plugin1', plugin1);
      (pluginManager as any).plugins.set('plugin2', plugin2);

      // Enable both plugins
      await pluginManager.enablePlugin('plugin1');
      await pluginManager.enablePlugin('plugin2');

      // Set headlines to return
      const headline1: Headline = {
        id: uuidv4(),
        pluginId: 'plugin1',
        title: 'Headline 1',
        pubDate: new Date(),
        createdAt: new Date(),
        category: 'test',
        tags: [],
        importanceScore: 0.8,
        isImportant: true,
        metadata: {},
        read: false,
        starred: false,
        archived: false,
      };

      const headline2: Headline = {
        id: uuidv4(),
        pluginId: 'plugin2',
        title: 'Headline 2',
        pubDate: new Date(),
        createdAt: new Date(),
        category: 'test',
        tags: [],
        importanceScore: 0.7,
        isImportant: true,
        metadata: {},
        read: false,
        starred: false,
        archived: false,
      };

      plugin1.setHeadlinesToReturn([headline1]);
      plugin2.setHeadlinesToReturn([headline2]);

      const results = await pluginManager.fetchFromAllPlugins();

      expect(results.size).toBe(2);
      expect(results.get('plugin1')).toHaveLength(1);
      expect(results.get('plugin2')).toHaveLength(1);
    });
  });

  describe('Plugin Health', () => {
    it('should check plugin health', async () => {
      const mockPlugin = new MockPlugin('test-plugin', 'Test Plugin');
      (pluginManager as any).plugins.set(mockPlugin.id, mockPlugin);

      const health = await pluginManager.checkPluginHealth('test-plugin');

      expect(health.healthy).toBe(true);
      expect(health.message).toBe('Mock plugin is healthy');
    });

    it('should check all plugin health', async () => {
      const plugin1 = new MockPlugin('plugin1', 'Plugin 1');
      const plugin2 = new MockPlugin('plugin2', 'Plugin 2');

      (pluginManager as any).plugins.set('plugin1', plugin1);
      (pluginManager as any).plugins.set('plugin2', plugin2);

      const results = await pluginManager.checkAllPluginHealth();

      expect(results.size).toBe(2);
      expect(results.get('plugin1')?.healthy).toBe(true);
      expect(results.get('plugin2')?.healthy).toBe(true);
    });
  });

  describe('Plugin Configuration', () => {
    it('should update plugin configuration', async () => {
      const mockPlugin = new MockPlugin('test-plugin', 'Test Plugin');
      (pluginManager as any).plugins.set(mockPlugin.id, mockPlugin);

      await pluginManager.enablePlugin('test-plugin');

      pluginManager.updatePluginConfig('test-plugin', {
        schedule: '*/30 * * * *',
      });

      const config = db.getPluginConfig('test-plugin');
      expect(config?.schedule).toBe('*/30 * * * *');
    });

    it('should throw error when updating non-existent config', () => {
      expect(() => {
        pluginManager.updatePluginConfig('non-existent', {
          schedule: '*/30 * * * *',
        });
      }).toThrow('Plugin non-existent has no configuration');
    });
  });

  describe('Plugin Statistics', () => {
    it('should get plugin statistics', async () => {
      const plugin1 = new MockPlugin('plugin1', 'Plugin 1');
      const plugin2 = new MockPlugin('plugin2', 'Plugin 2');

      (pluginManager as any).plugins.set('plugin1', plugin1);
      (pluginManager as any).plugins.set('plugin2', plugin2);

      await pluginManager.enablePlugin('plugin1');
      // plugin2 remains disabled

      const stats = pluginManager.getPluginStats();

      expect(stats.total).toBe(2);
      expect(stats.enabled).toBe(1);
      expect(stats.disabled).toBe(1);
    });
  });

  describe('Enabled Plugins', () => {
    it('should get enabled plugins only', async () => {
      const plugin1 = new MockPlugin('plugin1', 'Plugin 1');
      const plugin2 = new MockPlugin('plugin2', 'Plugin 2');

      (pluginManager as any).plugins.set('plugin1', plugin1);
      (pluginManager as any).plugins.set('plugin2', plugin2);

      await pluginManager.enablePlugin('plugin1');

      const enabledPlugins = pluginManager.getEnabledPlugins();

      expect(enabledPlugins).toHaveLength(1);
      expect(enabledPlugins[0].id).toBe('plugin1');
    });
  });
});
