"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("@/models/database");
const uuid_1 = require("uuid");
const fs_1 = require("fs");
const path_1 = require("path");
describe('TopixDatabase', () => {
    let db;
    const testDbPath = (0, path_1.join)(__dirname, 'test-topix.db');
    beforeEach(() => {
        if ((0, fs_1.existsSync)(testDbPath)) {
            (0, fs_1.unlinkSync)(testDbPath);
        }
        db = new database_1.TopixDatabase(testDbPath);
    });
    afterEach(() => {
        db.close();
        if ((0, fs_1.existsSync)(testDbPath)) {
            (0, fs_1.unlinkSync)(testDbPath);
        }
    });
    describe('Initialization', () => {
        it('should create database file', () => {
            expect((0, fs_1.existsSync)(testDbPath)).toBe(true);
        });
        it('should run migrations', () => {
            expect(db).toBeDefined();
        });
    });
    describe('Headlines', () => {
        it('should insert and retrieve a headline', () => {
            const headline = {
                id: (0, uuid_1.v4)(),
                pluginId: 'test-plugin',
                title: 'Test Headline',
                description: 'Test description',
                link: 'https://example.com',
                pubDate: new Date(),
                createdAt: new Date(),
                category: 'test',
                tags: ['test', 'example'],
                importanceScore: 0.75,
                importanceReason: 'Test importance',
                isImportant: true,
                metadata: { source: 'test' },
                read: false,
                starred: false,
                archived: false,
            };
            db.insertHeadline(headline);
            const retrieved = db.getHeadlineById(headline.id);
            expect(retrieved).toBeDefined();
            expect(retrieved?.title).toBe(headline.title);
            expect(retrieved?.pluginId).toBe(headline.pluginId);
            expect(retrieved?.isImportant).toBe(true);
        });
        it('should get headlines with filters', () => {
            const headline1 = {
                id: (0, uuid_1.v4)(),
                pluginId: 'plugin1',
                title: 'Headline 1',
                pubDate: new Date(),
                createdAt: new Date(),
                category: 'news',
                tags: [],
                importanceScore: 0.8,
                isImportant: true,
                metadata: {},
                read: false,
                starred: false,
                archived: false,
            };
            const headline2 = {
                id: (0, uuid_1.v4)(),
                pluginId: 'plugin2',
                title: 'Headline 2',
                pubDate: new Date(),
                createdAt: new Date(),
                category: 'email',
                tags: [],
                importanceScore: 0.3,
                isImportant: false,
                metadata: {},
                read: false,
                starred: false,
                archived: false,
            };
            db.insertHeadline(headline1);
            db.insertHeadline(headline2);
            const important = db.getHeadlines({ isImportant: true });
            expect(important).toHaveLength(1);
            expect(important[0].title).toBe('Headline 1');
            const newsHeadlines = db.getHeadlines({ category: 'news' });
            expect(newsHeadlines).toHaveLength(1);
            expect(newsHeadlines[0].category).toBe('news');
        });
        it('should update headline status', () => {
            const headline = {
                id: (0, uuid_1.v4)(),
                pluginId: 'test',
                title: 'Test',
                pubDate: new Date(),
                createdAt: new Date(),
                category: 'test',
                tags: [],
                importanceScore: 0.5,
                isImportant: false,
                metadata: {},
                read: false,
                starred: false,
                archived: false,
            };
            db.insertHeadline(headline);
            db.updateHeadlineStatus(headline.id, { read: true, starred: true });
            const updated = db.getHeadlineById(headline.id);
            expect(updated?.read).toBe(true);
            expect(updated?.starred).toBe(true);
            expect(updated?.archived).toBe(false);
        });
    });
    describe('Plugin Configs', () => {
        it('should insert and retrieve plugin config', () => {
            const config = {
                pluginId: 'test-plugin',
                enabled: true,
                schedule: '*/5 * * * *',
                config: { apiKey: 'test' },
                importance: {
                    llmEnabled: true,
                    baseWeight: 1.0,
                    threshold: 0.6,
                    rules: [],
                },
            };
            db.upsertPluginConfig(config);
            const retrieved = db.getPluginConfig('test-plugin');
            expect(retrieved).toBeDefined();
            expect(retrieved?.pluginId).toBe('test-plugin');
            expect(retrieved?.enabled).toBe(true);
            expect(retrieved?.config.apiKey).toBe('test');
        });
        it('should update existing plugin config', () => {
            const config = {
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
            config.enabled = false;
            config.schedule = '*/10 * * * *';
            db.upsertPluginConfig(config);
            const retrieved = db.getPluginConfig('test-plugin');
            expect(retrieved?.enabled).toBe(false);
            expect(retrieved?.schedule).toBe('*/10 * * * *');
        });
        it('should get enabled plugin configs', () => {
            db.upsertPluginConfig({
                pluginId: 'plugin1',
                enabled: true,
                schedule: '*/5 * * * *',
                config: {},
                importance: {
                    llmEnabled: true,
                    baseWeight: 1.0,
                    threshold: 0.6,
                    rules: [],
                },
            });
            db.upsertPluginConfig({
                pluginId: 'plugin2',
                enabled: false,
                schedule: '*/5 * * * *',
                config: {},
                importance: {
                    llmEnabled: true,
                    baseWeight: 1.0,
                    threshold: 0.6,
                    rules: [],
                },
            });
            const enabled = db.getEnabledPluginConfigs();
            expect(enabled).toHaveLength(1);
            expect(enabled[0].pluginId).toBe('plugin1');
        });
    });
    describe('User Preferences', () => {
        it('should set and get preference', () => {
            db.setPreference('test', { value: 'hello' });
            const retrieved = db.getPreference('test');
            expect(retrieved).toEqual({ value: 'hello' });
        });
        it('should get default user preferences', () => {
            const prefs = db.getUserPreferences();
            expect(prefs.feed.title).toBe('Topix - Your Personal Headlines');
            expect(prefs.llm.provider).toBe('ollama');
            expect(prefs.llm.ollama?.model).toBe('llama3.2:3b');
        });
        it('should set and retrieve user preferences', () => {
            const prefs = db.getUserPreferences();
            prefs.feed.title = 'Custom Title';
            prefs.llm.provider = 'openrouter';
            db.setUserPreferences(prefs);
            const retrieved = db.getUserPreferences();
            expect(retrieved.feed.title).toBe('Custom Title');
            expect(retrieved.llm.provider).toBe('openrouter');
        });
    });
});
//# sourceMappingURL=database.test.js.map