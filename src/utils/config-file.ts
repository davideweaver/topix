/**
 * Config File Handler
 * Loads and saves configuration from YAML file
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dump, load } from 'js-yaml';
import { getConfigPath } from './paths';
import type { UserPreferences, PluginConfig, LLMConfig } from '@/models/types';

/**
 * Complete configuration structure from YAML file
 */
export interface TopixConfig {
  feed: UserPreferences['feed'];
  importance: UserPreferences['importance'];
  llm: LLMConfig;
  plugins: Record<string, PluginConfigYAML>;
}

/**
 * Plugin configuration in YAML (slightly different from database structure)
 */
export interface PluginConfigYAML {
  enabled: boolean;
  schedule: string; // Cron expression
  config: Record<string, any>; // Plugin-specific config
  importance?: {
    llmEnabled?: boolean;
    baseWeight?: number;
    threshold?: number;
    rules?: Array<{ condition: string; weight: number }>;
  };
}

/**
 * Default configuration
 */
export function getDefaultConfig(): TopixConfig {
  return {
    feed: {
      title: 'My Personal Feed',
      description: 'Curated headlines from multiple sources',
      maxItems: 100,
      ttl: 60,
    },
    importance: {
      defaultThreshold: 0.5,
      context: 'Your personal context for importance scoring',
      llmPrompt: `Rate the importance of this headline from 0.0 to 1.0.

Headline: {title}
Description: {description}
Source: {plugin}

Context: {context}

Return only a number between 0.0 and 1.0:`,
    },
    llm: {
      provider: 'ollama',
      ollama: {
        endpoint: 'http://localhost:11434',
        model: 'llama3.2:3b',
        timeout: 30000,
      },
    },
    plugins: {},
  };
}

/**
 * Load configuration from YAML file
 * @returns Parsed configuration object
 */
export function loadConfig(): TopixConfig {
  const configPath = getConfigPath();

  // If file doesn't exist, return defaults
  if (!existsSync(configPath)) {
    return getDefaultConfig();
  }

  try {
    const fileContents = readFileSync(configPath, 'utf8');
    const parsed = load(fileContents) as TopixConfig;

    // Merge with defaults to handle missing keys
    return {
      ...getDefaultConfig(),
      ...parsed,
      feed: { ...getDefaultConfig().feed, ...parsed.feed },
      importance: { ...getDefaultConfig().importance, ...parsed.importance },
      llm: { ...getDefaultConfig().llm, ...parsed.llm },
      plugins: parsed.plugins || {},
    };
  } catch (error) {
    console.error('Failed to parse config file:', error);
    console.error('Using default configuration');
    return getDefaultConfig();
  }
}

/**
 * Save configuration to YAML file
 * @param config Configuration object to save
 */
export function saveConfig(config: TopixConfig): void {
  const configPath = getConfigPath();

  try {
    const yaml = dump(config, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
    });

    // Add header comment
    const header = `# Topix Configuration
# This file is automatically reloaded when changed while the service is running
# Edit this file to configure plugins and preferences

`;

    writeFileSync(configPath, header + yaml, 'utf8');
  } catch (error) {
    console.error('Failed to save config file:', error);
    throw error;
  }
}

/**
 * Validate configuration structure
 * @param config Configuration to validate
 * @returns Validation result with errors if invalid
 */
export function validateConfig(config: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be an object'] };
  }

  const cfg = config as Record<string, any>;

  // Validate feed section
  if (cfg.feed) {
    if (typeof cfg.feed !== 'object') {
      errors.push('feed must be an object');
    } else {
      if (cfg.feed.title && typeof cfg.feed.title !== 'string') {
        errors.push('feed.title must be a string');
      }
      if (cfg.feed.maxItems && typeof cfg.feed.maxItems !== 'number') {
        errors.push('feed.maxItems must be a number');
      }
    }
  }

  // Validate importance section
  if (cfg.importance) {
    if (typeof cfg.importance !== 'object') {
      errors.push('importance must be an object');
    } else {
      if (
        cfg.importance.defaultThreshold &&
        (typeof cfg.importance.defaultThreshold !== 'number' ||
          cfg.importance.defaultThreshold < 0 ||
          cfg.importance.defaultThreshold > 1)
      ) {
        errors.push('importance.defaultThreshold must be a number between 0 and 1');
      }
    }
  }

  // Validate LLM section
  if (cfg.llm) {
    if (typeof cfg.llm !== 'object') {
      errors.push('llm must be an object');
    } else {
      if (cfg.llm.provider && !['ollama', 'openrouter', 'none'].includes(cfg.llm.provider)) {
        errors.push('llm.provider must be "ollama", "openrouter", or "none"');
      }
    }
  }

  // Validate plugins section
  if (cfg.plugins) {
    if (typeof cfg.plugins !== 'object') {
      errors.push('plugins must be an object');
    } else {
      for (const [pluginId, pluginCfg] of Object.entries(cfg.plugins)) {
        if (typeof pluginCfg !== 'object') {
          errors.push(`plugins.${pluginId} must be an object`);
          continue;
        }

        const plugin = pluginCfg as any;

        if (plugin.enabled !== undefined && typeof plugin.enabled !== 'boolean') {
          errors.push(`plugins.${pluginId}.enabled must be a boolean`);
        }

        if (plugin.schedule && typeof plugin.schedule !== 'string') {
          errors.push(`plugins.${pluginId}.schedule must be a string (cron expression)`);
        }

        if (plugin.config && typeof plugin.config !== 'object') {
          errors.push(`plugins.${pluginId}.config must be an object`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Convert plugin config from YAML format to database format
 */
export function yamlPluginToDbPlugin(
  pluginId: string,
  yaml: PluginConfigYAML
): PluginConfig {
  return {
    pluginId,
    enabled: yaml.enabled,
    schedule: yaml.schedule,
    config: yaml.config,
    importance: {
      llmEnabled: yaml.importance?.llmEnabled ?? true,
      baseWeight: yaml.importance?.baseWeight ?? 1.0,
      threshold: yaml.importance?.threshold ?? 0.5,
      rules: yaml.importance?.rules ?? [],
    },
  };
}

/**
 * Get path to config file
 */
export function getConfigFilePath(): string {
  return getConfigPath();
}
