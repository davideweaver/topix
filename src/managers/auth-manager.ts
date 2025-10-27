/**
 * Authentication Manager
 * Handles credential storage and retrieval using macOS Keychain (via keytar)
 * Falls back to database storage if Keychain is unavailable
 */

import * as keytar from 'keytar';
import { TopixDatabase } from '@/models/database';
import { AuthCredentials, OAuth2Credentials } from '@/models/types';

const KEYCHAIN_SERVICE = 'com.topix.app';

export class AuthManager {
  private db: TopixDatabase;
  private keychainAvailable: boolean = true;

  constructor(db: TopixDatabase) {
    this.db = db;
    this.checkKeychainAvailability();
  }

  /**
   * Check if Keychain is available
   */
  private checkKeychainAvailability(): void {
    try {
      // Try a test operation to verify Keychain access
      keytar.findCredentials(KEYCHAIN_SERVICE).catch(() => {
        this.keychainAvailable = false;
      });
    } catch {
      this.keychainAvailable = false;
    }
  }

  /**
   * Store authentication credentials for a plugin
   */
  async storeCredentials(pluginId: string, credentials: AuthCredentials): Promise<void> {
    const authType = this.getAuthType(credentials);

    if (this.keychainAvailable) {
      try {
        await this.storeInKeychain(pluginId, credentials);
        console.log(`✓ Stored credentials for ${pluginId} in Keychain`);

        // Also store metadata in database (not the sensitive data)
        this.db.upsertAuth(pluginId, authType, { type: authType } as AuthCredentials);
        return;
      } catch (error) {
        console.warn(`⚠️  Failed to store in Keychain, falling back to database:`, error);
        this.keychainAvailable = false;
      }
    }

    // Fallback to database
    this.db.upsertAuth(pluginId, authType, credentials);
    console.log(`✓ Stored credentials for ${pluginId} in database (Keychain unavailable)`);
  }

  /**
   * Retrieve authentication credentials for a plugin
   */
  async getCredentials(pluginId: string): Promise<AuthCredentials | null> {
    if (this.keychainAvailable) {
      try {
        const credentials = await this.getFromKeychain(pluginId);
        if (credentials) {
          return credentials;
        }
      } catch (error) {
        console.warn(`⚠️  Failed to retrieve from Keychain:`, error);
        this.keychainAvailable = false;
      }
    }

    // Fallback to database
    return this.db.getAuth(pluginId);
  }

  /**
   * Delete authentication credentials for a plugin
   */
  async deleteCredentials(pluginId: string): Promise<void> {
    if (this.keychainAvailable) {
      try {
        await keytar.deletePassword(KEYCHAIN_SERVICE, pluginId);
        console.log(`✓ Deleted credentials for ${pluginId} from Keychain`);
      } catch (error) {
        console.warn(`⚠️  Failed to delete from Keychain:`, error);
      }
    }

    // Also delete from database
    this.db.deleteAuth(pluginId);
    console.log(`✓ Deleted credentials for ${pluginId}`);
  }

  /**
   * List all plugins with stored credentials
   */
  async listCredentials(): Promise<Array<{ pluginId: string; authType: string }>> {
    if (this.keychainAvailable) {
      try {
        const keychainCreds = await keytar.findCredentials(KEYCHAIN_SERVICE);
        return keychainCreds.map((cred) => {
          const credentials = JSON.parse(cred.password) as AuthCredentials;
          return {
            pluginId: cred.account,
            authType: this.getAuthType(credentials),
          };
        });
      } catch (error) {
        console.warn(`⚠️  Failed to list Keychain credentials:`, error);
        this.keychainAvailable = false;
      }
    }

    // Fallback to database
    return this.db.getAllAuth();
  }

  /**
   * Check if credentials exist for a plugin
   */
  async hasCredentials(pluginId: string): Promise<boolean> {
    const credentials = await this.getCredentials(pluginId);
    return credentials !== null;
  }

  /**
   * Refresh OAuth2 access token
   */
  async refreshOAuth2Token(pluginId: string): Promise<OAuth2Credentials | null> {
    const credentials = await this.getCredentials(pluginId);

    if (!credentials || credentials.type !== 'oauth2') {
      return null;
    }

    const oauth2Creds = credentials as OAuth2Credentials;

    if (!oauth2Creds.refreshToken || oauth2Creds.refreshToken === '') {
      console.warn(`⚠️  No refresh token available for ${pluginId}`);
      return null;
    }

    // Check if token needs refresh (expires within 5 minutes)
    if (oauth2Creds.expiresAt) {
      const expiresAt = new Date(oauth2Creds.expiresAt);
      const now = new Date();
      const fiveMinutes = 5 * 60 * 1000;

      if (expiresAt.getTime() - now.getTime() > fiveMinutes) {
        // Token is still valid
        return oauth2Creds;
      }
    }

    try {
      // Make token refresh request
      const tokenUrl = oauth2Creds.tokenUrl;
      if (!tokenUrl) {
        throw new Error('Token URL not found in credentials');
      }

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: oauth2Creds.refreshToken,
          client_id: oauth2Creds.clientId || '',
          client_secret: oauth2Creds.clientSecret || '',
        }),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      };

      // Update credentials with new token
      const updatedCredentials: OAuth2Credentials = {
        ...oauth2Creds,
        accessToken: data.access_token,
        refreshToken: data.refresh_token || oauth2Creds.refreshToken,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
      };

      // Store updated credentials
      await this.storeCredentials(pluginId, updatedCredentials);

      console.log(`✓ Refreshed OAuth2 token for ${pluginId}`);

      return updatedCredentials;
    } catch (error) {
      console.error(`✗ Failed to refresh OAuth2 token for ${pluginId}:`, error);
      return null;
    }
  }

  /**
   * Validate OAuth2 token and refresh if needed
   */
  async validateOAuth2Token(pluginId: string): Promise<OAuth2Credentials | null> {
    const credentials = await this.getCredentials(pluginId);

    if (!credentials || credentials.type !== 'oauth2') {
      return null;
    }

    const oauth2Creds = credentials as OAuth2Credentials;

    // Check if token is expired or expiring soon
    if (oauth2Creds.expiresAt) {
      const expiresAt = new Date(oauth2Creds.expiresAt);
      const now = new Date();

      if (expiresAt.getTime() <= now.getTime()) {
        // Token is expired, refresh it
        return await this.refreshOAuth2Token(pluginId);
      }
    }

    return oauth2Creds;
  }

  /**
   * Store credentials in macOS Keychain
   */
  private async storeInKeychain(pluginId: string, credentials: AuthCredentials): Promise<void> {
    const credentialsJson = JSON.stringify(credentials);
    await keytar.setPassword(KEYCHAIN_SERVICE, pluginId, credentialsJson);
  }

  /**
   * Retrieve credentials from macOS Keychain
   */
  private async getFromKeychain(pluginId: string): Promise<AuthCredentials | null> {
    const credentialsJson = await keytar.getPassword(KEYCHAIN_SERVICE, pluginId);

    if (!credentialsJson) {
      return null;
    }

    return JSON.parse(credentialsJson) as AuthCredentials;
  }

  /**
   * Determine auth type from credentials
   */
  private getAuthType(credentials: AuthCredentials): string {
    return credentials.type;
  }

  /**
   * Check if Keychain is available and working
   */
  isKeychainAvailable(): boolean {
    return this.keychainAvailable;
  }
}

/**
 * Singleton auth manager instance
 */
let authManagerInstance: AuthManager | null = null;

/**
 * Get the singleton auth manager instance
 */
export function getAuthManager(db: TopixDatabase): AuthManager {
  if (!authManagerInstance) {
    authManagerInstance = new AuthManager(db);
  }
  return authManagerInstance;
}

/**
 * Reset auth manager
 */
export function resetAuthManager(): void {
  authManagerInstance = null;
}
