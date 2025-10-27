/**
 * Scheduler Manager
 * Handles automatic plugin execution based on cron schedules
 */

import cron, { ScheduledTask } from 'node-cron';
import { PluginManager } from './plugin-manager';
import { getConfigManager } from './config-manager';

export class Scheduler {
  private pluginManager: PluginManager;
  private tasks: Map<string, ScheduledTask> = new Map();
  private running: boolean = false;

  constructor(pluginManager: PluginManager) {
    this.pluginManager = pluginManager;
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.running) {
      console.warn('⚠️  Scheduler is already running');
      return;
    }

    console.log('⏰ Starting scheduler...');

    // Get all enabled plugins from config manager
    const configManager = getConfigManager();
    const fullConfig = configManager.getFullConfig();
    const enabledPlugins = Object.entries(fullConfig.plugins).filter(([_, cfg]) => cfg.enabled);

    for (const [pluginId, config] of enabledPlugins) {
      this.schedulePlugin(pluginId, config.schedule);
    }

    this.running = true;
    console.log(`✅ Scheduler started with ${this.tasks.size} scheduled tasks`);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    console.log('⏰ Stopping scheduler...');

    // Stop all scheduled tasks
    for (const [pluginId, task] of this.tasks) {
      task.stop();
      console.log(`   ✓ Stopped schedule for ${pluginId}`);
    }

    this.tasks.clear();
    this.running = false;
    console.log('✅ Scheduler stopped');
  }

  /**
   * Schedule a plugin to run on a cron schedule
   */
  private schedulePlugin(pluginId: string, schedule: string): void {
    // Validate cron expression
    if (!cron.validate(schedule)) {
      console.warn(`⚠️  Invalid cron schedule for ${pluginId}: ${schedule}`);
      return;
    }

    // Remove existing task if any
    if (this.tasks.has(pluginId)) {
      this.tasks.get(pluginId)?.stop();
      this.tasks.delete(pluginId);
    }

    // Create new scheduled task
    const task = cron.schedule(
      schedule,
      async () => {
        await this.executePlugin(pluginId);
      },
      {
        scheduled: true,
      }
    );

    this.tasks.set(pluginId, task);
    console.log(`   ✓ Scheduled ${pluginId}: ${schedule}`);
  }

  /**
   * Execute a plugin fetch
   */
  private async executePlugin(pluginId: string): Promise<void> {
    const plugin = this.pluginManager.getPlugin(pluginId);

    if (!plugin) {
      console.error(`❌ Plugin ${pluginId} not found`);
      return;
    }

    const now = new Date();
    const timestamp = now.toLocaleString();

    console.log(`\n⏰ [${timestamp}] Running scheduled fetch: ${plugin.name}`);

    try {
      await this.pluginManager.fetchFromPlugin(pluginId);
    } catch (error) {
      console.error(
        `❌ Scheduled fetch failed for ${plugin.name}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Reschedule a plugin (called when config changes)
   */
  reschedulePlugin(pluginId: string, schedule: string): void {
    if (!this.running) {
      return;
    }

    console.log(`⏰ Rescheduling ${pluginId}: ${schedule}`);
    this.schedulePlugin(pluginId, schedule);
  }

  /**
   * Unschedule a plugin (called when plugin is disabled)
   */
  unschedulePlugin(pluginId: string): void {
    const task = this.tasks.get(pluginId);

    if (task) {
      task.stop();
      this.tasks.delete(pluginId);
      console.log(`⏰ Unscheduled ${pluginId}`);
    }
  }

  /**
   * Get scheduled task info
   */
  getScheduledTasks(): Array<{ pluginId: string; schedule: string; active: boolean }> {
    const result: Array<{ pluginId: string; schedule: string; active: boolean }> = [];
    const configManager = getConfigManager();
    const fullConfig = configManager.getFullConfig();

    for (const [pluginId, _task] of this.tasks) {
      const config = fullConfig.plugins[pluginId];
      if (config) {
        result.push({
          pluginId,
          schedule: config.schedule,
          active: true,
        });
      }
    }

    return result;
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.running;
  }
}
