/**
 * Tests for AuthManager
 */

import { AuthManager } from '@/managers/auth-manager';
import { TopixDatabase } from '@/models/database';
import {
  OAuth2Credentials,
  ApiKeyCredentials,
  BasicAuthCredentials,
} from '@/models/types';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';

// Mock keytar module
jest.mock('keytar', () => ({
  setPassword: jest.fn(),
  getPassword: jest.fn(),
  deletePassword: jest.fn(),
  findCredentials: jest.fn(),
}));

import * as keytar from 'keytar';

describe('AuthManager', () => {
  let db: TopixDatabase;
  let authManager: AuthManager;
  const testDbPath = join(__dirname, 'test-auth-manager.db');

  beforeEach(() => {
    // Clean up test database if it exists
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    // Create new database for each test
    db = new TopixDatabase(testDbPath);

    // Reset mocks
    jest.clearAllMocks();

    // Mock keytar to simulate Keychain availability
    (keytar.findCredentials as jest.Mock).mockResolvedValue([]);

    // Create auth manager
    authManager = new AuthManager(db);
  });

  afterEach(() => {
    // Clean up
    db.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  describe('API Key Credentials', () => {
    it('should store and retrieve API key credentials', async () => {
      const credentials: ApiKeyCredentials = {
        type: 'apikey',
        apiKey: 'test-api-key-12345',
      };

      // Mock Keychain storage
      (keytar.setPassword as jest.Mock).mockResolvedValue(undefined);
      (keytar.getPassword as jest.Mock).mockResolvedValue(JSON.stringify(credentials));

      await authManager.storeCredentials('test-plugin', credentials);
      const retrieved = await authManager.getCredentials('test-plugin');

      expect(retrieved).toBeDefined();
      expect(retrieved?.type).toBe('apikey');
      expect((retrieved as ApiKeyCredentials).apiKey).toBe('test-api-key-12345');
    });

    it('should delete API key credentials', async () => {
      const credentials: ApiKeyCredentials = {
        type: 'apikey',
        apiKey: 'test-api-key-12345',
      };

      (keytar.setPassword as jest.Mock).mockResolvedValue(undefined);
      (keytar.getPassword as jest.Mock).mockResolvedValue(JSON.stringify(credentials));

      await authManager.storeCredentials('test-plugin', credentials);
      await authManager.deleteCredentials('test-plugin');

      (keytar.getPassword as jest.Mock).mockResolvedValue(null);

      const retrieved = await authManager.getCredentials('test-plugin');
      expect(retrieved).toBeNull();
    });
  });

  describe('Basic Auth Credentials', () => {
    it('should store and retrieve basic auth credentials', async () => {
      const credentials: BasicAuthCredentials = {
        type: 'basic',
        username: 'testuser',
        password: 'testpassword',
      };

      (keytar.setPassword as jest.Mock).mockResolvedValue(undefined);
      (keytar.getPassword as jest.Mock).mockResolvedValue(JSON.stringify(credentials));

      await authManager.storeCredentials('test-plugin', credentials);
      const retrieved = await authManager.getCredentials('test-plugin');

      expect(retrieved).toBeDefined();
      expect(retrieved?.type).toBe('basic');
      expect((retrieved as BasicAuthCredentials).username).toBe('testuser');
      expect((retrieved as BasicAuthCredentials).password).toBe('testpassword');
    });
  });

  describe('OAuth2 Credentials', () => {
    it('should store and retrieve OAuth2 credentials', async () => {
      const credentials: OAuth2Credentials = {
        type: 'oauth2',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        tokenUrl: 'https://example.com/token',
      };

      (keytar.setPassword as jest.Mock).mockResolvedValue(undefined);
      (keytar.getPassword as jest.Mock).mockResolvedValue(JSON.stringify(credentials));

      await authManager.storeCredentials('test-plugin', credentials);
      const retrieved = await authManager.getCredentials('test-plugin');

      expect(retrieved).toBeDefined();
      expect(retrieved?.type).toBe('oauth2');
      expect((retrieved as OAuth2Credentials).accessToken).toBe('test-access-token');
      expect((retrieved as OAuth2Credentials).refreshToken).toBe('test-refresh-token');
    });

    it('should return valid OAuth2 token if not expired', async () => {
      const credentials: OAuth2Credentials = {
        type: 'oauth2',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: new Date(Date.now() + 3600 * 1000), // Expires in 1 hour
        tokenUrl: 'https://example.com/token',
      };

      (keytar.setPassword as jest.Mock).mockResolvedValue(undefined);
      (keytar.getPassword as jest.Mock).mockResolvedValue(JSON.stringify(credentials));

      await authManager.storeCredentials('test-plugin', credentials);

      const validated = await authManager.validateOAuth2Token('test-plugin');

      expect(validated).toBeDefined();
      expect(validated?.accessToken).toBe('test-access-token');
    });

    it('should return null for expired OAuth2 token without refresh token', async () => {
      const credentials: OAuth2Credentials = {
        type: 'oauth2',
        accessToken: 'test-access-token',
        refreshToken: '', // Empty refresh token
        expiresAt: new Date(Date.now() - 1000), // Expired
        tokenUrl: 'https://example.com/token',
      };

      (keytar.setPassword as jest.Mock).mockResolvedValue(undefined);
      (keytar.getPassword as jest.Mock).mockResolvedValue(JSON.stringify(credentials));

      await authManager.storeCredentials('test-plugin', credentials);

      const refreshed = await authManager.refreshOAuth2Token('test-plugin');

      expect(refreshed).toBeNull();
    });
  });

  describe('Credential Management', () => {
    it('should check if credentials exist', async () => {
      const credentials: ApiKeyCredentials = {
        type: 'apikey',
        apiKey: 'test-api-key',
      };

      (keytar.setPassword as jest.Mock).mockResolvedValue(undefined);
      (keytar.getPassword as jest.Mock).mockResolvedValue(null);

      const beforeStore = await authManager.hasCredentials('test-plugin');
      expect(beforeStore).toBe(false);

      (keytar.getPassword as jest.Mock).mockResolvedValue(JSON.stringify(credentials));

      await authManager.storeCredentials('test-plugin', credentials);

      const afterStore = await authManager.hasCredentials('test-plugin');
      expect(afterStore).toBe(true);
    });

    it('should list all stored credentials', async () => {
      const creds1: ApiKeyCredentials = {
        type: 'apikey',
        apiKey: 'key1',
      };

      const creds2: BasicAuthCredentials = {
        type: 'basic',
        username: 'user',
        password: 'pass',
      };

      (keytar.setPassword as jest.Mock).mockResolvedValue(undefined);
      (keytar.findCredentials as jest.Mock).mockResolvedValue([
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
      // Mock Keychain failure
      (keytar.setPassword as jest.Mock).mockRejectedValue(new Error('Keychain unavailable'));
      (keytar.getPassword as jest.Mock).mockRejectedValue(new Error('Keychain unavailable'));

      const credentials: ApiKeyCredentials = {
        type: 'apikey',
        apiKey: 'test-api-key',
      };

      await authManager.storeCredentials('test-plugin', credentials);

      // Should store in database
      const retrieved = await authManager.getCredentials('test-plugin');

      expect(retrieved).toBeDefined();
      expect(retrieved?.type).toBe('apikey');
      expect((retrieved as ApiKeyCredentials).apiKey).toBe('test-api-key');
    });

    it('should indicate Keychain availability', () => {
      const available = authManager.isKeychainAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed credentials gracefully', async () => {
      (keytar.getPassword as jest.Mock).mockResolvedValue('invalid-json');

      // Should catch error and fallback to database, returning null
      const retrieved = await authManager.getCredentials('test-plugin');
      expect(retrieved).toBeNull();
    });

    it('should return null for non-existent credentials', async () => {
      (keytar.getPassword as jest.Mock).mockResolvedValue(null);

      const retrieved = await authManager.getCredentials('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should return null when validating non-OAuth2 credentials', async () => {
      const credentials: ApiKeyCredentials = {
        type: 'apikey',
        apiKey: 'test-key',
      };

      (keytar.setPassword as jest.Mock).mockResolvedValue(undefined);
      (keytar.getPassword as jest.Mock).mockResolvedValue(JSON.stringify(credentials));

      await authManager.storeCredentials('test-plugin', credentials);

      const validated = await authManager.validateOAuth2Token('test-plugin');
      expect(validated).toBeNull();
    });
  });
});
