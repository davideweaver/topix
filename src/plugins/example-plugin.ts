/**
 * Example plugin demonstrating the TopixPlugin interface
 * This serves as a template for creating new plugins
 */

/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/require-await */

import {
  TopixPlugin,
  PluginConfig,
  FetchContext,
  Headline,
  ConfigSchema,
  ValidationResult,
  AuthRequirement,
  AuthCredentials,
  HealthStatus,
  RetentionPolicy,
} from '@/models/types';
import { v4 as uuidv4 } from 'uuid';

export class ExamplePlugin implements TopixPlugin {
  readonly id = 'example';
  readonly name = 'Example Plugin';
  readonly description = 'A simple example plugin demonstrating the plugin interface';
  readonly version = '0.1.0';
  readonly author = 'Dave Weaver';

  private config: Record<string, any> = {};

  /**
   * Initialize the plugin with configuration
   */
  async initialize(config: PluginConfig): Promise<void> {
    this.config = config.config;
    console.log(`[${this.id}] Initialized with config:`, this.config);
  }

  /**
   * Clean up resources on shutdown
   */
  async shutdown(): Promise<void> {
    console.log(`[${this.id}] Shutting down...`);
    // Clean up any resources (close connections, etc.)
  }

  /**
   * Fetch headlines from the data source
   * This is the main method that plugins implement
   */
  async fetchHeadlines(context: FetchContext): Promise<Headline[]> {
    console.log(`[${this.id}] Fetching headlines...`);

    // EXAMPLE: Query plugin's own history
    // This allows plugins to avoid duplicates, track trends, etc.

    // Get last 5 headlines
    const recentHeadlines = context.getHistory({ limit: 5 });
    console.log(`[${this.id}] Found ${recentHeadlines.length} recent headlines`);

    // Get headlines from last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last24Hours = context.getHistory({ since: yesterday });
    console.log(`[${this.id}] Found ${last24Hours.length} headlines from last 24 hours`);

    // Use history to avoid duplicates
    // const existingTitles = new Set(recentHeadlines.map(h => h.title));
    // if (existingTitles.has('New Title')) {
    //   console.log('Skipping duplicate headline');
    //   return [];
    // }

    // Example: Generate a sample headline
    const headline: Headline = {
      id: uuidv4(),
      pluginId: this.id,
      title: 'Example Headline',
      description: 'This is an example headline from the example plugin',
      link: 'https://example.com',
      pubDate: new Date(),
      createdAt: new Date(),
      category: 'example',
      tags: ['example', 'sample'],
      importanceScore: 0.5,
      importanceReason: 'Example headline',
      metadata: {
        source: 'example-plugin',
      },
      read: false,
      starred: false,
      archived: false,
    };

    return [headline];
  }

  /**
   * Return the configuration schema for this plugin
   * This is used by the setup wizard and config UI
   */
  getConfigSchema(): ConfigSchema {
    return {
      type: 'object',
      properties: {
        exampleSetting: {
          type: 'string',
          description: 'An example configuration setting',
          default: 'default value',
        },
        checkInterval: {
          type: 'number',
          description: 'How often to check for new headlines (minutes)',
          default: 5,
        },
        enabled: {
          type: 'boolean',
          description: 'Enable this example feature',
          default: true,
        },
      },
      required: ['exampleSetting'],
    };
  }

  /**
   * Validate plugin configuration
   */
  validateConfig(config: unknown): ValidationResult {
    const errors: string[] = [];

    if (typeof config !== 'object' || config === null) {
      return { valid: false, errors: ['Config must be an object'] };
    }

    const cfg = config as Record<string, any>;

    if (!cfg.exampleSetting || typeof cfg.exampleSetting !== 'string') {
      errors.push('exampleSetting must be a string');
    }

    if (cfg.checkInterval && typeof cfg.checkInterval !== 'number') {
      errors.push('checkInterval must be a number');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Specify authentication requirements (if any)
   * Return null if no authentication needed
   */
  getAuthRequirements(): AuthRequirement | null {
    // Example: Require an API key
    return {
      type: 'apikey',
      description: 'API key for the example service',
      fields: [
        {
          name: 'apiKey',
          type: 'password',
          label: 'API Key',
          required: true,
        },
      ],
    };

    // For no auth:
    // return null;
  }

  /**
   * Set authentication credentials
   * Called by the auth manager after user provides credentials
   */
  setAuthCredentials(_credentials: AuthCredentials): void {
    // Store credentials as needed by the plugin
    console.log(`[${this.id}] Credentials set`);
  }

  /**
   * Check if the plugin is healthy and can fetch headlines
   */
  async healthCheck(): Promise<HealthStatus> {
    try {
      // Example: Check if we can reach the API
      // const response = await fetch('https://api.example.com/health');
      // if (!response.ok) throw new Error('API not reachable');

      return {
        healthy: true,
        message: 'Plugin is healthy',
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: new Date(),
      };
    }
  }

  /**
   * Specify how many headlines to retain for this plugin
   * Controls automatic cleanup after each fetch
   */
  getRetentionPolicy(): RetentionPolicy {
    // OPTION 1: Keep last N headlines (count-based)
    // Good for plugins where you want to maintain a rolling window of recent items
    return { type: 'count', value: 10 };

    // OPTION 2: Keep headlines from last N hours (time-based)
    // Good for time-sensitive content like news or stock prices
    // return { type: 'duration', hours: 24 }; // Keep last 24 hours

    // OPTION 3: Keep all headlines (no automatic cleanup)
    // Good for historical data you want to preserve indefinitely
    // return { type: 'unlimited' };
  }
}

// Export plugin instance
export default new ExamplePlugin();
