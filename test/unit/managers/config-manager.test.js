"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_manager_1 = require("@/managers/config-manager");
const database_1 = require("@/models/database");
const fs_1 = require("fs");
const path_1 = require("path");
describe('ConfigManager', () => {
    let db;
    let configManager;
    const testDbPath = (0, path_1.join)(__dirname, 'test-config-manager.db');
    beforeEach(() => {
        if ((0, fs_1.existsSync)(testDbPath)) {
            (0, fs_1.unlinkSync)(testDbPath);
        }
        db = new database_1.TopixDatabase(testDbPath);
        configManager = new config_manager_1.ConfigManager(db);
    });
    afterEach(() => {
        db.close();
        if ((0, fs_1.existsSync)(testDbPath)) {
            (0, fs_1.unlinkSync)(testDbPath);
        }
    });
    describe('Getting Preferences', () => {
        it('should get default preferences', () => {
            const prefs = configManager.getPreferences();
            expect(prefs).toBeDefined();
            expect(prefs.feed.title).toBe('Topix - Your Personal Headlines');
            expect(prefs.llm.provider).toBe('ollama');
        });
        it('should cache preferences', () => {
            const prefs1 = configManager.getPreferences();
            const prefs2 = configManager.getPreferences();
            expect(prefs1).toBe(prefs2);
        });
        it('should get specific preference by path', () => {
            const feedTitle = configManager.getPreference('feed.title');
            const llmProvider = configManager.getPreference('llm.provider');
            const ollamaModel = configManager.getPreference('llm.ollama.model');
            expect(feedTitle).toBe('Topix - Your Personal Headlines');
            expect(llmProvider).toBe('ollama');
            expect(ollamaModel).toBe('llama3.2:3b');
        });
        it('should return undefined for non-existent preference', () => {
            const value = configManager.getPreference('non.existent.path');
            expect(value).toBeUndefined();
        });
    });
    describe('Setting Preferences', () => {
        it('should set preferences', () => {
            const newPrefs = {
                feed: {
                    title: 'Custom Feed',
                    description: 'Custom description',
                    maxItems: 100,
                    ttl: 60,
                },
                importance: {
                    defaultThreshold: 0.7,
                    llmPrompt: 'Custom prompt',
                    context: 'Custom context',
                },
                llm: {
                    provider: 'openrouter',
                    ollama: {
                        endpoint: 'http://localhost:11434',
                        model: 'llama3.2:3b',
                        timeout: 10000,
                    },
                    openrouter: {
                        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
                        model: 'meta-llama/llama-3.1-8b-instruct',
                        apiKey: 'test-key',
                        timeout: 10000,
                    },
                },
                notifications: {
                    enabled: true,
                    urgentThreshold: 0.95,
                },
            };
            configManager.setPreferences(newPrefs);
            const retrieved = configManager.getPreferences();
            expect(retrieved.feed.title).toBe('Custom Feed');
            expect(retrieved.llm.provider).toBe('openrouter');
        });
        it('should set specific preference by path', () => {
            configManager.setPreference('feed.title', 'New Title');
            configManager.setPreference('llm.provider', 'openrouter');
            expect(configManager.getPreference('feed.title')).toBe('New Title');
            expect(configManager.getPreference('llm.provider')).toBe('openrouter');
        });
        it('should create nested objects when setting deep paths', () => {
            configManager.setPreference('llm.openrouter.apiKey', 'new-key');
            expect(configManager.getPreference('llm.openrouter.apiKey')).toBe('new-key');
        });
    });
    describe('Feed Configuration', () => {
        it('should get feed config', () => {
            const feedConfig = configManager.getFeedConfig();
            expect(feedConfig.title).toBe('Topix - Your Personal Headlines');
            expect(feedConfig.maxItems).toBe(50);
        });
        it('should set feed config', () => {
            configManager.setFeedConfig({
                title: 'Custom Feed Title',
                maxItems: 100,
            });
            const feedConfig = configManager.getFeedConfig();
            expect(feedConfig.title).toBe('Custom Feed Title');
            expect(feedConfig.maxItems).toBe(100);
            expect(feedConfig.description).toBe('Curated headlines from your digital life');
        });
    });
    describe('Importance Configuration', () => {
        it('should get importance config', () => {
            const importanceConfig = configManager.getImportanceConfig();
            expect(importanceConfig.defaultThreshold).toBe(0.6);
            expect(importanceConfig.context).toBe('');
        });
        it('should set importance config', () => {
            configManager.setImportanceConfig({
                defaultThreshold: 0.8,
                context: 'I care about tech news',
            });
            const importanceConfig = configManager.getImportanceConfig();
            expect(importanceConfig.defaultThreshold).toBe(0.8);
            expect(importanceConfig.context).toBe('I care about tech news');
        });
    });
    describe('LLM Configuration', () => {
        it('should get LLM config', () => {
            const llmConfig = configManager.getLLMConfig();
            expect(llmConfig.provider).toBe('ollama');
            expect(llmConfig.ollama?.model).toBe('llama3.2:3b');
        });
        it('should set LLM config', () => {
            configManager.setLLMConfig({
                provider: 'openrouter',
                openrouter: {
                    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
                    model: 'meta-llama/llama-3.1-8b-instruct',
                    apiKey: 'test-key',
                    timeout: 15000,
                },
            });
            const llmConfig = configManager.getLLMConfig();
            expect(llmConfig.provider).toBe('openrouter');
            expect(llmConfig.openrouter?.apiKey).toBe('test-key');
        });
        it('should set LLM provider', () => {
            configManager.setLLMProvider('openrouter');
            expect(configManager.getLLMConfig().provider).toBe('openrouter');
        });
    });
    describe('Notification Configuration', () => {
        it('should get notification config', () => {
            const notificationConfig = configManager.getNotificationConfig();
            expect(notificationConfig?.enabled).toBe(false);
            expect(notificationConfig?.urgentThreshold).toBe(0.9);
        });
        it('should set notification config', () => {
            configManager.setNotificationConfig({
                enabled: true,
                urgentThreshold: 0.95,
            });
            const notificationConfig = configManager.getNotificationConfig();
            expect(notificationConfig?.enabled).toBe(true);
            expect(notificationConfig?.urgentThreshold).toBe(0.95);
        });
    });
    describe('Reset and Defaults', () => {
        it('should reset to defaults', () => {
            configManager.setPreference('feed.title', 'Custom Title');
            configManager.setPreference('llm.provider', 'openrouter');
            configManager.resetToDefaults();
            const prefs = configManager.getPreferences();
            expect(prefs.feed.title).toBe('Topix - Your Personal Headlines');
            expect(prefs.llm.provider).toBe('ollama');
        });
    });
    describe('Import/Export', () => {
        it('should export configuration as JSON', () => {
            const json = configManager.exportConfig();
            expect(json).toBeDefined();
            expect(typeof json).toBe('string');
            const parsed = JSON.parse(json);
            expect(parsed.feed).toBeDefined();
            expect(parsed.llm).toBeDefined();
        });
        it('should import configuration from JSON', () => {
            const customPrefs = {
                feed: {
                    title: 'Imported Feed',
                    description: 'Imported description',
                    maxItems: 75,
                    ttl: 45,
                },
                importance: {
                    defaultThreshold: 0.65,
                    llmPrompt: 'Imported prompt',
                    context: 'Imported context',
                },
                llm: {
                    provider: 'openrouter',
                    ollama: {
                        endpoint: 'http://localhost:11434',
                        model: 'llama3.2:3b',
                        timeout: 10000,
                    },
                    openrouter: {
                        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
                        model: 'meta-llama/llama-3.1-8b-instruct',
                        apiKey: 'imported-key',
                        timeout: 10000,
                    },
                },
                notifications: {
                    enabled: true,
                    urgentThreshold: 0.85,
                },
            };
            const json = JSON.stringify(customPrefs);
            configManager.importConfig(json);
            const prefs = configManager.getPreferences();
            expect(prefs.feed.title).toBe('Imported Feed');
            expect(prefs.llm.provider).toBe('openrouter');
        });
        it('should throw error on invalid JSON import', () => {
            expect(() => {
                configManager.importConfig('invalid json');
            }).toThrow();
        });
    });
    describe('Cache Management', () => {
        it('should clear cache', () => {
            const prefs1 = configManager.getPreferences();
            configManager.clearCache();
            const prefs2 = configManager.getPreferences();
            expect(prefs1).not.toBe(prefs2);
            expect(prefs1.feed.title).toBe(prefs2.feed.title);
        });
    });
    describe('Configuration Summary', () => {
        it('should get configuration summary', () => {
            const summary = configManager.getSummary();
            expect(summary).toBeDefined();
            expect(summary.feedTitle).toBe('Topix - Your Personal Headlines');
            expect(summary.llmProvider).toBe('ollama');
            expect(summary.importanceThreshold).toBe(0.6);
            expect(summary.notificationsEnabled).toBe(false);
        });
    });
    describe('LLM Validation', () => {
        it('should validate OpenRouter config requires API key', async () => {
            configManager.setLLMProvider('openrouter');
            const result = await configManager.validateLLMConfig();
            expect(result.valid).toBe(false);
            expect(result.message).toContain('API key is required');
        });
        it('should validate OpenRouter config with API key', async () => {
            configManager.setLLMConfig({
                provider: 'openrouter',
                openrouter: {
                    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
                    model: 'meta-llama/llama-3.1-8b-instruct',
                    apiKey: 'test-key',
                    timeout: 10000,
                },
            });
            const result = await configManager.validateLLMConfig();
            expect(result.valid).toBe(true);
            expect(result.message).toContain('valid');
        });
    });
});
//# sourceMappingURL=config-manager.test.js.map