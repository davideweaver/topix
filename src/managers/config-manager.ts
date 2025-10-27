/**
 * Configuration Manager
 * Handles user preferences and application configuration from YAML file
 */

import { UserPreferences, LLMProvider } from '@/models/types';
import { loadConfig, saveConfig, type TopixConfig } from '@/utils/config-file';

export class ConfigManager {
  private config: TopixConfig | null = null;

  constructor() {
    // Load config from file on construction
    this.config = loadConfig();
  }

  /**
   * Reload configuration from file
   * Used when config file changes
   */
  reload(): void {
    this.config = loadConfig();
    console.log('✓ Configuration reloaded from file');
  }

  /**
   * Get the full config
   */
  private getConfig(): TopixConfig {
    if (!this.config) {
      this.config = loadConfig();
    }
    return this.config;
  }

  /**
   * Save the current config to file
   */
  private persist(): void {
    if (this.config) {
      saveConfig(this.config);
    }
  }

  /**
   * Get all user preferences
   */
  getPreferences(): UserPreferences {
    const cfg = this.getConfig();
    return {
      feed: cfg.feed,
      importance: cfg.importance,
      llm: cfg.llm,
      notifications: {
        enabled: false,
        urgentThreshold: 0.9,
      },
    };
  }

  /**
   * Update user preferences
   */
  setPreferences(prefs: UserPreferences): void {
    const cfg = this.getConfig();
    cfg.feed = prefs.feed;
    cfg.importance = prefs.importance;
    cfg.llm = prefs.llm;
    this.persist();
    console.log('✓ Updated user preferences');
  }

  /**
   * Get a specific preference value by path
   * Example: getPreference('feed.title') or getPreference('llm.provider')
   */
  getPreference(path: string): any {
    const prefs = this.getPreferences();
    const parts = path.split('.');
    let value: any = prefs;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Set a specific preference value by path
   * Example: setPreference('feed.title', 'My Feed')
   */
  setPreference(path: string, value: any): void {
    const prefs = this.getPreferences();
    const parts = path.split('.');
    const lastPart = parts.pop();

    if (!lastPart) {
      throw new Error('Invalid preference path');
    }

    let current: any = prefs;
    for (const part of parts) {
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part];
    }

    current[lastPart] = value;
    this.setPreferences(prefs);
  }

  /**
   * Get feed configuration
   */
  getFeedConfig(): UserPreferences['feed'] {
    return this.getPreferences().feed;
  }

  /**
   * Update feed configuration
   */
  setFeedConfig(config: Partial<UserPreferences['feed']>): void {
    const prefs = this.getPreferences();
    prefs.feed = { ...prefs.feed, ...config };
    this.setPreferences(prefs);
  }

  /**
   * Get importance configuration
   */
  getImportanceConfig(): UserPreferences['importance'] {
    return this.getPreferences().importance;
  }

  /**
   * Update importance configuration
   */
  setImportanceConfig(config: Partial<UserPreferences['importance']>): void {
    const prefs = this.getPreferences();
    prefs.importance = { ...prefs.importance, ...config };
    this.setPreferences(prefs);
  }

  /**
   * Get LLM configuration
   */
  getLLMConfig(): UserPreferences['llm'] {
    return this.getPreferences().llm;
  }

  /**
   * Update LLM configuration
   */
  setLLMConfig(config: Partial<UserPreferences['llm']>): void {
    const prefs = this.getPreferences();
    prefs.llm = { ...prefs.llm, ...config };
    this.setPreferences(prefs);
  }

  /**
   * Set LLM provider
   */
  setLLMProvider(provider: LLMProvider): void {
    const prefs = this.getPreferences();
    prefs.llm.provider = provider;
    this.setPreferences(prefs);
  }

  /**
   * Get notification configuration
   */
  getNotificationConfig(): UserPreferences['notifications'] {
    return this.getPreferences().notifications;
  }

  /**
   * Update notification configuration
   */
  setNotificationConfig(config: Partial<UserPreferences['notifications']>): void {
    const prefs = this.getPreferences();
    if (!prefs.notifications) {
      prefs.notifications = {
        enabled: false,
        urgentThreshold: 0.9,
      };
    }
    prefs.notifications = { ...prefs.notifications, ...config };
    this.setPreferences(prefs);
  }

  /**
   * Reset preferences to defaults
   */
  resetToDefaults(): void {
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

    this.setPreferences(defaults);
    console.log('✓ Reset preferences to defaults');
  }

  /**
   * Validate LLM configuration
   */
  async validateLLMConfig(): Promise<{ valid: boolean; message: string }> {
    const llmConfig = this.getLLMConfig();

    if (llmConfig.provider === 'ollama') {
      try {
        const endpoint = llmConfig.ollama?.endpoint || 'http://localhost:11434';
        const response = await fetch(`${endpoint}/api/tags`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
          return {
            valid: false,
            message: `Ollama endpoint unreachable: ${response.statusText}`,
          };
        }

        const data = (await response.json()) as { models: any[] };

        if (!data.models || data.models.length === 0) {
          return {
            valid: false,
            message: 'No models available in Ollama',
          };
        }

        return {
          valid: true,
          message: `Ollama is available with ${data.models.length} models`,
        };
      } catch (error) {
        return {
          valid: false,
          message: `Ollama connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    }

    if (llmConfig.provider === 'openrouter') {
      if (!llmConfig.openrouter?.apiKey) {
        return {
          valid: false,
          message: 'OpenRouter API key is required',
        };
      }

      return {
        valid: true,
        message: 'OpenRouter configuration is valid',
      };
    }

    return {
      valid: true,
      message: 'No LLM provider configured (using rule-based fallback)',
    };
  }

  /**
   * Export configuration as JSON
   */
  exportConfig(): string {
    const prefs = this.getPreferences();
    return JSON.stringify(prefs, null, 2);
  }

  /**
   * Import configuration from JSON
   */
  importConfig(json: string): void {
    try {
      const prefs = JSON.parse(json) as UserPreferences;
      this.setPreferences(prefs);
      console.log('✓ Imported configuration');
    } catch (error) {
      throw new Error(`Failed to import configuration: ${error instanceof Error ? error.message : 'Invalid JSON'}`);
    }
  }

  /**
   * Clear the cache (force reload from file)
   */
  clearCache(): void {
    this.config = null;
  }

  /**
   * Get configuration summary
   */
  getSummary(): {
    feedTitle: string;
    llmProvider: string;
    importanceThreshold: number;
    notificationsEnabled: boolean;
  } {
    const prefs = this.getPreferences();
    return {
      feedTitle: prefs.feed.title,
      llmProvider: prefs.llm.provider,
      importanceThreshold: prefs.importance.defaultThreshold,
      notificationsEnabled: prefs.notifications?.enabled || false,
    };
  }

  /**
   * Get the full config (including plugins)
   */
  getFullConfig(): TopixConfig {
    return this.getConfig();
  }
}

/**
 * Singleton config manager instance
 */
let configManagerInstance: ConfigManager | null = null;

/**
 * Get the singleton config manager instance
 */
export function getConfigManager(): ConfigManager {
  if (!configManagerInstance) {
    configManagerInstance = new ConfigManager();
  }
  return configManagerInstance;
}

/**
 * Reset config manager
 */
export function resetConfigManager(): void {
  configManagerInstance = null;
}
