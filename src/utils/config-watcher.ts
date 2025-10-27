/**
 * Config File Watcher
 * Watches config.yaml for changes and triggers reloads
 */

import { watch, FSWatcher } from 'chokidar';
import { getConfigFilePath, loadConfig, validateConfig, type TopixConfig } from './config-file';

export type ConfigChangeHandler = (newConfig: TopixConfig) => void | Promise<void>;

export class ConfigWatcher {
  private watcher: FSWatcher | null = null;
  private changeHandler: ConfigChangeHandler | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly debounceMs = 500; // Wait 500ms after last change

  /**
   * Start watching the config file
   * @param handler Callback to invoke when config changes
   */
  start(handler: ConfigChangeHandler): void {
    if (this.watcher) {
      console.warn('Config watcher is already running');
      return;
    }

    this.changeHandler = handler;
    const configPath = getConfigFilePath();

    console.log('👀 Watching config file for changes:', configPath);

    this.watcher = watch(configPath, {
      persistent: true,
      ignoreInitial: true, // Don't trigger on initial file read
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on('change', () => {
      this.handleFileChange();
    });

    this.watcher.on('add', () => {
      console.log('📝 Config file created');
      this.handleFileChange();
    });

    this.watcher.on('unlink', () => {
      console.warn('⚠️  Config file was deleted - using existing config');
    });

    this.watcher.on('error', (error) => {
      console.error('❌ Config watcher error:', error);
    });
  }

  /**
   * Stop watching the config file
   */
  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      console.log('👋 Stopped watching config file');
    }

    this.changeHandler = null;
  }

  /**
   * Handle file change with debouncing
   */
  private handleFileChange(): void {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new timer
    this.debounceTimer = setTimeout(() => {
      this.processConfigChange();
    }, this.debounceMs);
  }

  /**
   * Process the config change after debounce
   */
  private async processConfigChange(): Promise<void> {
    console.log('🔄 Config file changed, reloading...');

    try {
      // Load new config
      const newConfig = loadConfig();

      // Validate new config
      const validation = validateConfig(newConfig);

      if (!validation.valid) {
        console.error('❌ Config validation failed:');
        validation.errors.forEach((error) => console.error(`   - ${error}`));
        console.error('   Keeping existing configuration');
        return;
      }

      // Call the change handler
      if (this.changeHandler) {
        await this.changeHandler(newConfig);
        console.log('✅ Config reloaded successfully');
      }
    } catch (error) {
      console.error('❌ Failed to reload config:', error);
      console.error('   Keeping existing configuration');
    }
  }

  /**
   * Check if watcher is running
   */
  isWatching(): boolean {
    return this.watcher !== null;
  }
}
