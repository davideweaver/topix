"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const auth_manager_1 = require("@/managers/auth-manager");
const database_1 = require("@/models/database");
const fs_1 = require("fs");
const path_1 = require("path");
jest.mock('keytar', () => ({
    setPassword: jest.fn(),
    getPassword: jest.fn(),
    deletePassword: jest.fn(),
    findCredentials: jest.fn(),
}));
const keytar = __importStar(require("keytar"));
describe('AuthManager', () => {
    let db;
    let authManager;
    const testDbPath = (0, path_1.join)(__dirname, 'test-auth-manager.db');
    beforeEach(() => {
        if ((0, fs_1.existsSync)(testDbPath)) {
            (0, fs_1.unlinkSync)(testDbPath);
        }
        db = new database_1.TopixDatabase(testDbPath);
        jest.clearAllMocks();
        keytar.findCredentials.mockResolvedValue([]);
        authManager = new auth_manager_1.AuthManager(db);
    });
    afterEach(() => {
        db.close();
        if ((0, fs_1.existsSync)(testDbPath)) {
            (0, fs_1.unlinkSync)(testDbPath);
        }
    });
    describe('API Key Credentials', () => {
        it('should store and retrieve API key credentials', async () => {
            const credentials = {
                type: 'apikey',
                apiKey: 'test-api-key-12345',
            };
            keytar.setPassword.mockResolvedValue(undefined);
            keytar.getPassword.mockResolvedValue(JSON.stringify(credentials));
            await authManager.storeCredentials('test-plugin', credentials);
            const retrieved = await authManager.getCredentials('test-plugin');
            expect(retrieved).toBeDefined();
            expect(retrieved?.type).toBe('apikey');
            expect(retrieved.apiKey).toBe('test-api-key-12345');
        });
        it('should delete API key credentials', async () => {
            const credentials = {
                type: 'apikey',
                apiKey: 'test-api-key-12345',
            };
            keytar.setPassword.mockResolvedValue(undefined);
            keytar.getPassword.mockResolvedValue(JSON.stringify(credentials));
            await authManager.storeCredentials('test-plugin', credentials);
            await authManager.deleteCredentials('test-plugin');
            keytar.getPassword.mockResolvedValue(null);
            const retrieved = await authManager.getCredentials('test-plugin');
            expect(retrieved).toBeNull();
        });
    });
    describe('Basic Auth Credentials', () => {
        it('should store and retrieve basic auth credentials', async () => {
            const credentials = {
                type: 'basic',
                username: 'testuser',
                password: 'testpassword',
            };
            keytar.setPassword.mockResolvedValue(undefined);
            keytar.getPassword.mockResolvedValue(JSON.stringify(credentials));
            await authManager.storeCredentials('test-plugin', credentials);
            const retrieved = await authManager.getCredentials('test-plugin');
            expect(retrieved).toBeDefined();
            expect(retrieved?.type).toBe('basic');
            expect(retrieved.username).toBe('testuser');
            expect(retrieved.password).toBe('testpassword');
        });
    });
    describe('OAuth2 Credentials', () => {
        it('should store and retrieve OAuth2 credentials', async () => {
            const credentials = {
                type: 'oauth2',
                accessToken: 'test-access-token',
                refreshToken: 'test-refresh-token',
                expiresAt: new Date(Date.now() + 3600 * 1000),
                tokenUrl: 'https://example.com/token',
            };
            keytar.setPassword.mockResolvedValue(undefined);
            keytar.getPassword.mockResolvedValue(JSON.stringify(credentials));
            await authManager.storeCredentials('test-plugin', credentials);
            const retrieved = await authManager.getCredentials('test-plugin');
            expect(retrieved).toBeDefined();
            expect(retrieved?.type).toBe('oauth2');
            expect(retrieved.accessToken).toBe('test-access-token');
            expect(retrieved.refreshToken).toBe('test-refresh-token');
        });
        it('should return valid OAuth2 token if not expired', async () => {
            const credentials = {
                type: 'oauth2',
                accessToken: 'test-access-token',
                refreshToken: 'test-refresh-token',
                expiresAt: new Date(Date.now() + 3600 * 1000),
                tokenUrl: 'https://example.com/token',
            };
            keytar.setPassword.mockResolvedValue(undefined);
            keytar.getPassword.mockResolvedValue(JSON.stringify(credentials));
            await authManager.storeCredentials('test-plugin', credentials);
            const validated = await authManager.validateOAuth2Token('test-plugin');
            expect(validated).toBeDefined();
            expect(validated?.accessToken).toBe('test-access-token');
        });
        it('should return null for expired OAuth2 token without refresh token', async () => {
            const credentials = {
                type: 'oauth2',
                accessToken: 'test-access-token',
                refreshToken: '',
                expiresAt: new Date(Date.now() - 1000),
                tokenUrl: 'https://example.com/token',
            };
            keytar.setPassword.mockResolvedValue(undefined);
            keytar.getPassword.mockResolvedValue(JSON.stringify(credentials));
            await authManager.storeCredentials('test-plugin', credentials);
            const refreshed = await authManager.refreshOAuth2Token('test-plugin');
            expect(refreshed).toBeNull();
        });
    });
    describe('Credential Management', () => {
        it('should check if credentials exist', async () => {
            const credentials = {
                type: 'apikey',
                apiKey: 'test-api-key',
            };
            keytar.setPassword.mockResolvedValue(undefined);
            keytar.getPassword.mockResolvedValue(null);
            const beforeStore = await authManager.hasCredentials('test-plugin');
            expect(beforeStore).toBe(false);
            keytar.getPassword.mockResolvedValue(JSON.stringify(credentials));
            await authManager.storeCredentials('test-plugin', credentials);
            const afterStore = await authManager.hasCredentials('test-plugin');
            expect(afterStore).toBe(true);
        });
        it('should list all stored credentials', async () => {
            const creds1 = {
                type: 'apikey',
                apiKey: 'key1',
            };
            const creds2 = {
                type: 'basic',
                username: 'user',
                password: 'pass',
            };
            keytar.setPassword.mockResolvedValue(undefined);
            keytar.findCredentials.mockResolvedValue([
                { account: 'plugin1', password: JSON.stringify(creds1) },
                { account: 'plugin2', password: JSON.stringify(creds2) },
            ]);
            await authManager.storeCredentials('plugin1', creds1);
            await authManager.storeCredentials('plugin2', creds2);
            const list = await authManager.listCredentials();
            expect(list).toHaveLength(2);
            expect(list[0].pluginId).toBe('plugin1');
            expect(list[0].authType).toBe('apikey');
            expect(list[1].pluginId).toBe('plugin2');
            expect(list[1].authType).toBe('basic');
        });
    });
    describe('Keychain Fallback', () => {
        it('should fallback to database if Keychain fails', async () => {
            keytar.setPassword.mockRejectedValue(new Error('Keychain unavailable'));
            keytar.getPassword.mockRejectedValue(new Error('Keychain unavailable'));
            const credentials = {
                type: 'apikey',
                apiKey: 'test-api-key',
            };
            await authManager.storeCredentials('test-plugin', credentials);
            const retrieved = await authManager.getCredentials('test-plugin');
            expect(retrieved).toBeDefined();
            expect(retrieved?.type).toBe('apikey');
            expect(retrieved.apiKey).toBe('test-api-key');
        });
        it('should indicate Keychain availability', () => {
            const available = authManager.isKeychainAvailable();
            expect(typeof available).toBe('boolean');
        });
    });
    describe('Error Handling', () => {
        it('should handle malformed credentials gracefully', async () => {
            keytar.getPassword.mockResolvedValue('invalid-json');
            const retrieved = await authManager.getCredentials('test-plugin');
            expect(retrieved).toBeNull();
        });
        it('should return null for non-existent credentials', async () => {
            keytar.getPassword.mockResolvedValue(null);
            const retrieved = await authManager.getCredentials('non-existent');
            expect(retrieved).toBeNull();
        });
        it('should return null when validating non-OAuth2 credentials', async () => {
            const credentials = {
                type: 'apikey',
                apiKey: 'test-key',
            };
            keytar.setPassword.mockResolvedValue(undefined);
            keytar.getPassword.mockResolvedValue(JSON.stringify(credentials));
            await authManager.storeCredentials('test-plugin', credentials);
            const validated = await authManager.validateOAuth2Token('test-plugin');
            expect(validated).toBeNull();
        });
    });
});
//# sourceMappingURL=auth-manager.test.js.map