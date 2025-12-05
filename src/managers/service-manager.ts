/**
 * Service Manager
 * Handles the lifecycle of the Topix service (start, stop, status)
 */

import express, { Express, Request, Response } from 'express';
import { Server } from 'http';
import { TopixDatabase, getDatabase, closeDatabase } from '@/models/database';
import { PluginManager } from './plugin-manager';
import { AuthManager } from './auth-manager';
import { ConfigManager, getConfigManager } from './config-manager';
import { Scheduler } from './scheduler';
import { ConfigWatcher } from '@/utils/config-watcher';
import { existsSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { getDataDir } from '@/utils/paths';

export interface ServiceStatus {
  running: boolean;
  pid?: number;
  port?: number;
  startedAt?: Date;
  uptime?: number;
  stats?: {
    totalPlugins: number;
    enabledPlugins: number;
    totalHeadlines: number;
  };
  plugins?: Array<{
    id: string;
    name: string;
    enabled: boolean;
    lastRun?: Date;
    lastError?: string;
    schedule?: string;
  }>;
}

export class ServiceManager {
  private app: Express;
  private server: Server | null = null;
  private db: TopixDatabase;
  private pluginManager: PluginManager;
  private authManager: AuthManager;
  private configManager: ConfigManager;
  private configWatcher: ConfigWatcher;
  private scheduler: Scheduler;
  private port: number;
  private startedAt: Date | null = null;
  private pidFile: string;
  private statusFile: string;
  private signalHandlers: Map<NodeJS.Signals, NodeJS.SignalsListener> = new Map();

  constructor(port: number = 3000) {
    this.port = port;
    this.pidFile = join(getDataDir(), 'topix.pid');
    this.statusFile = join(getDataDir(), 'topix.status.json');
    this.app = express();

    // Initialize database
    this.db = getDatabase();

    // Initialize managers
    this.pluginManager = new PluginManager(this.db);
    this.authManager = new AuthManager(this.db);
    this.configManager = getConfigManager(); // ConfigManager now uses singleton pattern
    this.configWatcher = new ConfigWatcher();
    this.scheduler = new Scheduler(this.pluginManager);

    // Setup express middleware
    this.setupMiddleware();

    // Setup routes
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Add logging middleware
    this.app.use((req: Request, _res: Response, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup Express routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        uptime: this.getUptime(),
        startedAt: this.startedAt,
      });
    });

    // RSS feed endpoint (main endpoint)
    this.app.get('/feed.xml', async (_req: Request, res: Response) => {
      try {
        const feed = await this.generateRSSFeed();
        res.type('application/xml');
        res.send(feed);
      } catch (error) {
        console.error('Error generating RSS feed:', error);
        res.status(500).send('Error generating feed');
      }
    });

    // API: Get status
    this.app.get('/api/status', (_req: Request, res: Response) => {
      const status = this.getStatus();
      res.json(status);
    });

    // API: Get plugins
    this.app.get('/api/plugins', (_req: Request, res: Response) => {
      const plugins = this.pluginManager.getAllPlugins().map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        version: p.version,
        author: p.author,
      }));
      res.json(plugins);
    });

    // API: Get headlines
    this.app.get('/api/headlines', (req: Request, res: Response) => {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const important = req.query.important === 'true';

      const options: any = { limit, offset };

      // Apply importance threshold if filtering for important headlines
      if (important) {
        const importanceConfig = this.configManager.getImportanceConfig();
        options.minImportanceScore = importanceConfig.defaultThreshold;
      }

      const headlines = this.db.getHeadlines(options);

      res.json(headlines);
    });

    // API: Reload plugin configuration
    this.app.post('/api/plugins/:id/reload', async (req: Request, res: Response) => {
      const pluginId = req.params.id;

      try {
        // Get updated config from config manager
        const fullConfig = this.configManager.getFullConfig();
        const pluginConfig = fullConfig.plugins[pluginId];

        if (!pluginConfig) {
          res.status(404).json({ success: false, error: `Plugin ${pluginId} has no configuration` });
          return;
        }

        // Reinitialize plugin with updated config
        await this.pluginManager.reinitializePlugin(pluginId);

        // Reschedule plugin with updated schedule
        this.scheduler.reschedulePlugin(pluginId, pluginConfig.schedule);

        res.json({
          success: true,
          message: `Plugin ${pluginId} reloaded successfully`,
        });
      } catch (error) {
        console.error(`❌ Error reloading plugin ${pluginId}:`, error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // 404 handler
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  /**
   * Start the service
   */
  async start(): Promise<void> {
    // Check if already running
    if (this.isRunning()) {
      throw new Error('Service is already running');
    }

    console.log('🚀 Starting Topix service...');

    try {
      // Initialize plugin manager
      await this.pluginManager.initialize();

      // Start HTTP server
      await new Promise<void>((resolve, reject) => {
        this.server = this.app.listen(this.port, () => {
          this.startedAt = new Date();
          console.log(`✅ Topix service started on port ${this.port}`);
          console.log(`   RSS Feed: http://localhost:${this.port}/feed.xml`);
          console.log(`   API: http://localhost:${this.port}/api/status`);
          resolve();
        });

        this.server.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'EADDRINUSE') {
            reject(new Error(`Port ${this.port} is already in use`));
          } else {
            reject(error);
          }
        });
      });

      // Write PID file and status file
      this.writePidFile();
      this.writeStatusFile();

      // Setup signal handlers for graceful shutdown
      this.setupSignalHandlers();

      // Start config file watcher for auto-reload
      this.configWatcher.start(async () => {
        console.log('🔄 Config file changed, reloading...');

        // Reload ConfigManager
        this.configManager.reload();

        // Reload PluginManager (reinitialize plugins with new configs)
        await this.pluginManager.handleConfigReload();

        // Reschedule plugins with new schedules
        const pluginConfigs = this.configManager.getFullConfig().plugins;
        for (const [pluginId, pluginConfig] of Object.entries(pluginConfigs)) {
          if (pluginConfig.enabled) {
            this.scheduler.reschedulePlugin(pluginId, pluginConfig.schedule);
          } else {
            this.scheduler.unschedulePlugin(pluginId);
          }
        }
      });

      // Start scheduler for automatic plugin fetching
      this.scheduler.start();
    } catch (error) {
      console.error('❌ Failed to start service:', error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Stop the service
   */
  async stop(): Promise<void> {
    console.log('🛑 Stopping Topix service...');

    try {
      // If this is the running instance, stop directly
      if (this.server) {
        await new Promise<void>((resolve, reject) => {
          this.server!.close((error) => {
            if (error) {
              reject(error);
            } else {
              console.log('  ✓ HTTP server stopped');
              resolve();
            }
          });
        });
        this.server = null;
        await this.cleanup();
      } else {
        // This is a separate process trying to stop the service
        // Read PID from file and kill the process
        if (!existsSync(this.pidFile)) {
          console.log('⚠️  Service is not running (no PID file)');
          return;
        }

        const pid = parseInt(readFileSync(this.pidFile, 'utf-8'));

        // Check if process exists
        try {
          process.kill(pid, 0); // Signal 0 just checks if process exists
        } catch {
          console.log('⚠️  Service is not running (stale PID file)');
          this.removePidFile();
          this.removeStatusFile();
          return;
        }

        // Send SIGTERM to gracefully stop the service
        console.log(`  ⏳ Sending stop signal to process ${pid}...`);
        process.kill(pid, 'SIGTERM');

        // Wait for process to terminate (max 10 seconds)
        const maxWaitMs = 10000;
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitMs) {
          try {
            process.kill(pid, 0);
            // Process still exists, wait a bit
            await new Promise((resolve) => setTimeout(resolve, 100));
          } catch {
            // Process no longer exists
            console.log('  ✓ Service stopped');
            break;
          }
        }

        // Check if process is still running
        try {
          process.kill(pid, 0);
          // Still running, force kill
          console.log('  ⚠️  Service did not stop gracefully, forcing...');
          process.kill(pid, 'SIGKILL');
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch {
          // Process is gone
        }

        // Clean up files
        this.removePidFile();
        this.removeStatusFile();
      }

      console.log('✅ Topix service stopped');
    } catch (error) {
      console.error('❌ Error stopping service:', error);
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    // Remove signal handlers
    this.removeSignalHandlers();

    // Stop config watcher
    if (this.configWatcher) {
      await this.configWatcher.stop();
    }

    // Stop scheduler
    if (this.scheduler) {
      this.scheduler.stop();
    }

    // Shutdown plugin manager
    if (this.pluginManager) {
      await this.pluginManager.shutdown();
    }

    // Close database
    closeDatabase();

    // Remove PID file and status file
    this.removePidFile();
    this.removeStatusFile();

    this.startedAt = null;
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    if (this.server && this.server.listening) {
      return true;
    }

    // Check PID file
    if (existsSync(this.pidFile)) {
      try {
        const pid = parseInt(readFileSync(this.pidFile, 'utf-8'));
        // Check if process is running
        try {
          process.kill(pid, 0); // Signal 0 checks if process exists
          return true;
        } catch {
          // Process doesn't exist, remove stale PID file
          this.removePidFile();
          return false;
        }
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Get service status
   */
  getStatus(): ServiceStatus {
    const running = this.isRunning();

    const status: ServiceStatus = {
      running,
    };

    if (running) {
      // Try to get status from the running instance
      if (this.startedAt) {
        // This is the running instance
        status.pid = process.pid;
        status.port = this.port;
        status.startedAt = this.startedAt;
        status.uptime = this.getUptime();
      } else {
        // This is a separate process checking status - read from status file
        const statusFile = this.readStatusFile();
        if (statusFile) {
          status.pid = statusFile.pid;
          status.port = statusFile.port;
          status.startedAt = new Date(statusFile.startedAt);
          status.uptime = Math.floor((Date.now() - new Date(statusFile.startedAt).getTime()) / 1000);
        }
      }

      // Get stats from config manager and database
      try {
        const fullConfig = this.configManager.getFullConfig();
        const pluginConfigs = Object.entries(fullConfig.plugins);
        const enabledConfigs = pluginConfigs.filter(([_, cfg]) => cfg.enabled);
        const headlines = this.db.getHeadlines({ limit: 1 });

        status.stats = {
          totalPlugins: pluginConfigs.length,
          enabledPlugins: enabledConfigs.length,
          totalHeadlines: headlines.length > 0 ? this.db.getHeadlines({ limit: 10000 }).length : 0,
        };

        // Get plugin status
        status.plugins = pluginConfigs.map(([pluginId, config]) => {
          const plugin = this.pluginManager.getPlugin(pluginId);
          return {
            id: pluginId,
            name: plugin?.name || pluginId,
            enabled: config.enabled,
            lastRun: undefined, // TODO: Add runtime data tracking
            lastError: undefined,
            schedule: config.schedule,
          };
        });
      } catch (error) {
        // Config/database might not be accessible, skip stats
      }
    }

    return status;
  }

  /**
   * Get uptime in seconds
   */
  private getUptime(): number {
    if (!this.startedAt) {
      return 0;
    }
    return Math.floor((Date.now() - this.startedAt.getTime()) / 1000);
  }

  /**
   * Write PID file
   */
  private writePidFile(): void {
    try {
      writeFileSync(this.pidFile, process.pid.toString());
    } catch (error) {
      console.warn('⚠️  Failed to write PID file:', error);
    }
  }

  /**
   * Remove PID file
   */
  private removePidFile(): void {
    try {
      if (existsSync(this.pidFile)) {
        unlinkSync(this.pidFile);
      }
    } catch (error) {
      console.warn('⚠️  Failed to remove PID file:', error);
    }
  }

  /**
   * Write status file
   */
  private writeStatusFile(): void {
    try {
      const status = {
        pid: process.pid,
        port: this.port,
        startedAt: this.startedAt?.toISOString(),
      };
      writeFileSync(this.statusFile, JSON.stringify(status, null, 2));
    } catch (error) {
      console.warn('⚠️  Failed to write status file:', error);
    }
  }

  /**
   * Remove status file
   */
  private removeStatusFile(): void {
    try {
      if (existsSync(this.statusFile)) {
        unlinkSync(this.statusFile);
      }
    } catch (error) {
      console.warn('⚠️  Failed to remove status file:', error);
    }
  }

  /**
   * Read status file
   */
  private readStatusFile(): { pid: number; port: number; startedAt: string } | null {
    try {
      if (existsSync(this.statusFile)) {
        const content = readFileSync(this.statusFile, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      // Ignore errors, file may not exist or be invalid
    }
    return null;
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

    for (const signal of signals) {
      const handler: NodeJS.SignalsListener = async () => {
        console.log(`\n📡 Received ${signal}, shutting down gracefully...`);
        try {
          await this.stop();
          process.exit(0);
        } catch (error) {
          console.error('Error during shutdown:', error);
          process.exit(1);
        }
      };

      this.signalHandlers.set(signal, handler);
      process.on(signal, handler);
    }
  }

  /**
   * Remove signal handlers
   */
  private removeSignalHandlers(): void {
    for (const [signal, handler] of this.signalHandlers) {
      process.off(signal, handler);
    }
    this.signalHandlers.clear();
  }

  /**
   * Generate RSS feed
   */
  private async generateRSSFeed(): Promise<string> {
    const config = this.configManager.getFeedConfig();
    const importanceConfig = this.configManager.getImportanceConfig();
    const headlines = this.db.getHeadlines({
      limit: config.maxItems,
      minImportanceScore: importanceConfig.defaultThreshold,
      archived: false,
    });

    const buildDate = new Date().toUTCString();
    const feedUrl = `http://localhost:${this.port}/feed.xml`;

    let rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${this.escapeXml(config.title)}</title>
    <description>${this.escapeXml(config.description)}</description>
    <link>${feedUrl}</link>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <ttl>${config.ttl}</ttl>
    <generator>Topix v0.1.0</generator>
`;

    for (const headline of headlines) {
      const pubDate = headline.pubDate.toUTCString();
      const guid = headline.id;

      rss += `
    <item>
      <title>${this.escapeXml(headline.title)}</title>
      ${headline.description ? `<description>${this.escapeXml(headline.description)}</description>` : ''}
      ${headline.link ? `<link>${this.escapeXml(headline.link)}</link>` : ''}
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${guid}</guid>
      <category>${this.escapeXml(headline.category)}</category>
      ${headline.tags.map((tag) => `<category>${this.escapeXml(tag)}</category>`).join('\n      ')}
    </item>`;
    }

    rss += `
  </channel>
</rss>`;

    return rss;
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Get managers for external access
   */
  getManagers() {
    return {
      db: this.db,
      pluginManager: this.pluginManager,
      authManager: this.authManager,
      configManager: this.configManager,
    };
  }
}

/**
 * Singleton service manager instance
 */
let serviceManagerInstance: ServiceManager | null = null;

/**
 * Get the singleton service manager instance
 */
export function getServiceManager(port?: number): ServiceManager {
  if (!serviceManagerInstance) {
    serviceManagerInstance = new ServiceManager(port);
  }
  return serviceManagerInstance;
}

/**
 * Reset service manager
 */
export function resetServiceManager(): void {
  serviceManagerInstance = null;
}
