#!/usr/bin/env node

import { Command } from 'commander';
import { version } from '../package.json';
import { getServiceManager } from '@/managers/service-manager';
import { getDatabase } from '@/models/database';
import { PluginManager } from '@/managers/plugin-manager';
import { AuthManager } from '@/managers/auth-manager';
import { getConfigManager } from '@/managers/config-manager';
import { ApiKeyCredentials, BasicAuthCredentials } from '@/models/types';
import inquirer from 'inquirer';
import { spawn } from 'child_process';
import { getDataDir } from '@/utils/paths';
import { join } from 'path';
import { existsSync } from 'fs';

const program = new Command();

program
  .name('topix')
  .description('Personal headline aggregator with AI-powered importance filtering')
  .version(version);

// Service management
program
  .command('start')
  .description('Start the topix service')
  .option('--foreground', 'Run in foreground (do not daemonize)')
  .action(async (options: { foreground?: boolean }) => {
    try {
      const serviceManager = getServiceManager();

      // Check if service is already running
      if (serviceManager.isRunning()) {
        console.log('⚠️  Service is already running');
        console.log('   Use "topix status" to check status');
        console.log('   Use "topix stop" to stop the service');
        process.exit(0);
      }

      // If not running as daemon and not foreground flag, spawn as daemon
      if (!process.env.TOPIX_DAEMON && !options.foreground) {
        console.log('🚀 Starting Topix service in background...');

        const logDir = join(getDataDir(), 'logs');
        const logFile = join(logDir, 'topix.log');

        // Spawn detached process
        const child = spawn(process.argv[0], [process.argv[1], 'start', '--foreground'], {
          detached: true,
          stdio: ['ignore', 'ignore', 'ignore'],
          env: { ...process.env, TOPIX_DAEMON: '1' },
        });

        // Unref so parent can exit
        child.unref();

        // Wait a moment to see if it starts successfully
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check if it's running
        if (serviceManager.isRunning()) {
          console.log('✅ Topix service started');
          console.log(`   Logs: ${logFile}`);
          console.log('   Use "topix status" to check status');
          console.log('   Use "topix stop" to stop the service');
        } else {
          console.error('❌ Failed to start service');
          console.error(`   Check logs: ${logFile}`);
          process.exit(1);
        }
      } else {
        // Running as daemon or foreground mode
        if (process.env.TOPIX_DAEMON) {
          // Redirect stdout/stderr to log file
          const logDir = join(getDataDir(), 'logs');
          const logFile = join(logDir, 'topix.log');

          const logStream = require('fs').createWriteStream(logFile, { flags: 'a' });
          process.stdout.write = logStream.write.bind(logStream);
          process.stderr.write = logStream.write.bind(logStream);

          // Add timestamp to logs
          const originalLog = console.log;
          const originalError = console.error;
          console.log = (...args: any[]) => {
            originalLog(`[${new Date().toISOString()}]`, ...args);
          };
          console.error = (...args: any[]) => {
            originalError(`[${new Date().toISOString()}]`, ...args);
          };
        }

        await serviceManager.start();
      }
    } catch (error) {
      console.error('❌ Failed to start service:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('stop')
  .description('Stop the topix service')
  .action(async () => {
    try {
      const serviceManager = getServiceManager();

      if (!serviceManager.isRunning()) {
        console.log('⚠️  Service is not running');
        return;
      }

      await serviceManager.stop();
    } catch (error) {
      console.error('❌ Failed to stop service:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('restart')
  .description('Restart the topix service')
  .action(async () => {
    try {
      const serviceManager = getServiceManager();

      if (serviceManager.isRunning()) {
        console.log('🔄 Restarting Topix service...');
        await serviceManager.stop();
        // Wait a moment for cleanup
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Re-run start command
      const { spawn } = require('child_process');
      const start = spawn(process.argv[0], [process.argv[1], 'start'], {
        stdio: 'inherit',
      });

      start.on('exit', (code: number) => {
        process.exit(code);
      });
    } catch (error) {
      console.error('❌ Failed to restart service:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show service status')
  .action(() => {
    const serviceManager = getServiceManager();
    const status = serviceManager.getStatus();

    if (status.running) {
      console.log('✅ Topix service is running');
      console.log(`   PID: ${status.pid}`);
      console.log(`   Port: ${status.port}`);
      console.log(`   RSS Feed: http://localhost:${status.port}/feed.xml`);
      console.log(`   Started: ${status.startedAt?.toLocaleString()}`);
      console.log(`   Uptime: ${status.uptime}s`);

      if (status.stats) {
        console.log('\nStats:');
        console.log(`   Total Plugins: ${status.stats.totalPlugins}`);
        console.log(`   Enabled Plugins: ${status.stats.enabledPlugins}`);
        console.log(`   Total Headlines: ${status.stats.totalHeadlines}`);
      }

      if (status.plugins && status.plugins.length > 0) {
        console.log('\nPlugins:');
        for (const plugin of status.plugins) {
          const statusIcon = plugin.enabled ? '✅' : '⚪';
          console.log(`   ${statusIcon} ${plugin.name} (${plugin.id})`);
          if (plugin.lastRun) {
            console.log(`      Last run: ${plugin.lastRun.toLocaleString()}`);
          }
          if (plugin.lastError) {
            console.log(`      Last error: ${plugin.lastError}`);
          }
          if (plugin.schedule) {
            console.log(`      Schedule: ${plugin.schedule}`);
          }
        }
      }
    } else {
      console.log('⚠️  Topix service is not running');
    }
  });

program
  .command('logs')
  .description('View service logs')
  .option('-f, --follow', 'Follow log output (like tail -f)')
  .option('-n, --lines <number>', 'Number of lines to show', '50')
  .action((options: { follow?: boolean; lines?: string }) => {
    const logFile = join(getDataDir(), 'logs', 'topix.log');

    if (!existsSync(logFile)) {
      console.log('⚠️  No log file found');
      console.log(`   Expected: ${logFile}`);
      return;
    }

    const { spawn } = require('child_process');

    if (options.follow) {
      // Follow mode (like tail -f)
      const tail = spawn('tail', ['-f', logFile], {
        stdio: 'inherit',
      });

      // Handle Ctrl+C gracefully
      process.on('SIGINT', () => {
        tail.kill();
        process.exit(0);
      });
    } else {
      // Show last N lines
      const lines = parseInt(options.lines || '50');
      const tail = spawn('tail', ['-n', lines.toString(), logFile], {
        stdio: 'inherit',
      });

      tail.on('exit', (code: number | null) => {
        process.exit(code || 0);
      });
    }
  });

// Setup wizard
program
  .command('setup')
  .description('Run interactive setup wizard')
  .option('--reconfigure', 'Reconfigure existing setup')
  .option('--continue', 'Continue incomplete setup')
  .action((_options) => {
    console.log('🧙 Starting setup wizard...');
    // TODO: Implement setup wizard
  });

// Plugin management
const pluginCommand = program.command('plugin').description('Manage plugins');

pluginCommand
  .command('list')
  .description('List all available plugins')
  .action(async () => {
    try {
      const db = getDatabase();
      const pluginManager = new PluginManager(db, { verbose: false });
      await pluginManager.initialize({ initializePlugins: false });

      const allPlugins = pluginManager.getAllPlugins();
      const enabledPlugins = pluginManager.getEnabledPlugins();
      const enabledIds = new Set(enabledPlugins.map((p) => p.id));

      console.log('📦 Available plugins:\n');

      for (const plugin of allPlugins) {
        const enabled = enabledIds.has(plugin.id);
        const status = enabled ? '✅' : '  ';
        console.log(`${status} ${plugin.name} (${plugin.id})`);
        console.log(`   ${plugin.description}`);
        console.log(`   Version: ${plugin.version} | Author: ${plugin.author}\n`);
      }

      const stats = pluginManager.getPluginStats();
      console.log(`Total: ${stats.total} | Enabled: ${stats.enabled} | Disabled: ${stats.disabled}`);

      await pluginManager.shutdown();
      db.close();
    } catch (error) {
      console.error('❌ Failed to list plugins:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

pluginCommand
  .command('enable <plugin-id>')
  .description('Enable a plugin')
  .action(async (pluginId: string) => {
    try {
      const db = getDatabase();
      const pluginManager = new PluginManager(db, { verbose: false });
      await pluginManager.initialize({ initializePlugins: false });

      await pluginManager.enablePlugin(pluginId);

      await pluginManager.shutdown();
      db.close();
    } catch (error) {
      console.error(`❌ Failed to enable plugin ${pluginId}:`, error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

pluginCommand
  .command('disable <plugin-id>')
  .description('Disable a plugin')
  .action(async (pluginId: string) => {
    try {
      const db = getDatabase();
      const pluginManager = new PluginManager(db, { verbose: false });
      await pluginManager.initialize({ initializePlugins: false });

      await pluginManager.disablePlugin(pluginId);

      await pluginManager.shutdown();
      db.close();
    } catch (error) {
      console.error(`❌ Failed to disable plugin ${pluginId}:`, error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

pluginCommand
  .command('config <plugin-id>')
  .description('Configure a plugin interactively')
  .action(async (pluginId: string) => {
    try {
      const db = getDatabase();
      const pluginManager = new PluginManager(db, { verbose: false });
      await pluginManager.initialize({ initializePlugins: false });

      const plugin = pluginManager.getPlugin(pluginId);

      if (!plugin) {
        console.error(`❌ Plugin ${pluginId} not found`);
        process.exit(1);
      }

      console.log(`\n🔧 Configuring ${plugin.name}\n`);

      // Get current config
      const currentConfig = db.getPluginConfig(pluginId);
      const currentValues = currentConfig?.config || {};

      // Get config schema
      const schema = plugin.getConfigSchema();

      if (!schema.properties || Object.keys(schema.properties).length === 0) {
        console.log('⚠️  This plugin has no configurable options');
        await pluginManager.shutdown();
        db.close();
        return;
      }

      // Build inquirer prompts from schema
      const prompts: any[] = [];

      for (const [key, prop] of Object.entries(schema.properties)) {
        const propDef = prop as any;
        let prompt: any = {
          name: key,
          message: propDef.description || key,
          default: currentValues[key] !== undefined ? currentValues[key] : propDef.default,
        };

        switch (propDef.type) {
          case 'string':
            prompt.type = 'input';
            break;
          case 'number':
            prompt.type = 'number';
            break;
          case 'boolean':
            prompt.type = 'confirm';
            break;
          default:
            prompt.type = 'input';
        }

        prompts.push(prompt);
      }

      // Add schedule prompt
      const currentSchedule = currentConfig?.schedule || '*/15 * * * *';
      // Parse current schedule to get minutes (e.g., "*/15 * * * *" -> 15)
      const scheduleMatch = currentSchedule.match(/^\*\/(\d+)/);
      const currentMinutes = scheduleMatch ? parseInt(scheduleMatch[1]) : 15;

      prompts.push({
        type: 'number',
        name: '_schedule_minutes',
        message: 'How often should this plugin fetch headlines? (in minutes)',
        default: currentMinutes,
        validate: (value: number) => {
          if (!value || value < 1) {
            return 'Please enter a number of minutes (minimum: 1)';
          }
          if (value > 1440) {
            return 'Please enter a reasonable value (maximum: 1440 minutes = 24 hours)';
          }
          return true;
        },
      });

      // Show current config
      if (Object.keys(currentValues).length > 0 || currentConfig) {
        console.log('Current configuration:');
        for (const [key, value] of Object.entries(currentValues)) {
          console.log(`  ${key}: ${JSON.stringify(value)}`);
        }
        if (currentConfig) {
          console.log(`  schedule: Every ${currentMinutes} minutes (${currentSchedule})`);
        }
        console.log();
      }

      // Prompt for new values
      const answers = await inquirer.prompt(prompts);

      // Extract and convert schedule from answers
      const scheduleMinutes = answers._schedule_minutes as number;
      const newSchedule = `*/${scheduleMinutes} * * * *`;
      delete answers._schedule_minutes; // Remove from config before validation

      // Validate config
      const validation = plugin.validateConfig(answers);

      if (!validation.valid) {
        console.error('\n❌ Invalid configuration:');
        validation.errors?.forEach((error) => console.error(`   - ${error}`));
        process.exit(1);
      }

      // Update config in database
      const pluginConfig = currentConfig || {
        pluginId,
        enabled: false,
        schedule: '*/15 * * * *',
        config: {},
        importance: {
          llmEnabled: true,
          baseWeight: 1.0,
          threshold: 0.5,
          rules: [],
        },
      };

      pluginConfig.config = answers;
      pluginConfig.schedule = newSchedule; // Update schedule
      db.upsertPluginConfig(pluginConfig);

      console.log('\n✅ Plugin configuration updated successfully\n');

      // Show new config
      console.log('New configuration:');
      for (const [key, value] of Object.entries(answers)) {
        console.log(`  ${key}: ${JSON.stringify(value)}`);
      }
      console.log(`  schedule: Every ${scheduleMinutes} minutes (${newSchedule})`);

      // If service is running, reload the plugin
      const serviceManager = getServiceManager();
      if (serviceManager.isRunning()) {
        try {
          const response = await fetch(`http://localhost:3000/api/plugins/${pluginId}/reload`, {
            method: 'POST',
          });

          const result = (await response.json()) as { success: boolean; error?: string };

          if (response.ok && result.success) {
            console.log('\n🔄 Reloaded plugin in running service');
          } else {
            console.log('\n⚠️  Service is running but plugin reload failed. Restart service to apply changes.');
            if (result.error) {
              console.log(`   Error: ${result.error}`);
            }
          }
        } catch (error) {
          console.log('\n⚠️  Could not reload plugin in running service. Restart service to apply changes.');
        }
      } else {
        console.log('\nℹ️  Service is not running. Start service to apply changes.');
      }

      await pluginManager.shutdown();
      db.close();
    } catch (error) {
      console.error(`❌ Failed to configure plugin:`, error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Authentication management
const authCommand = program.command('auth').description('Manage authentication');

authCommand
  .command('add <plugin-id>')
  .description('Add authentication for a plugin')
  .option('--api-key <key>', 'API key for API key auth')
  .option('--username <username>', 'Username for basic auth')
  .option('--password <password>', 'Password for basic auth')
  .action(async (pluginId: string, options: any) => {
    try {
      const db = getDatabase();
      const authManager = new AuthManager(db);

      if (options.apiKey) {
        const credentials: ApiKeyCredentials = {
          type: 'apikey',
          apiKey: options.apiKey,
        };
        await authManager.storeCredentials(pluginId, credentials);
        console.log(`✓ Added API key authentication for ${pluginId}`);
      } else if (options.username && options.password) {
        const credentials: BasicAuthCredentials = {
          type: 'basic',
          username: options.username,
          password: options.password,
        };
        await authManager.storeCredentials(pluginId, credentials);
        console.log(`✓ Added basic authentication for ${pluginId}`);
      } else {
        console.error('❌ Please provide either --api-key or both --username and --password');
        process.exit(1);
      }

      db.close();
    } catch (error) {
      console.error(`❌ Failed to add authentication:`, error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

authCommand
  .command('list')
  .description('List configured authentication')
  .action(async () => {
    try {
      const db = getDatabase();
      const authManager = new AuthManager(db);

      const credentials = await authManager.listCredentials();

      if (credentials.length === 0) {
        console.log('No authentication configured');
        db.close();
        return;
      }

      console.log('🔑 Configured authentication:\n');

      for (const cred of credentials) {
        console.log(`  ${cred.pluginId}: ${cred.authType}`);
      }

      db.close();
    } catch (error) {
      console.error('❌ Failed to list authentication:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

authCommand
  .command('revoke <plugin-id>')
  .description('Revoke authentication for a plugin')
  .action(async (pluginId: string) => {
    try {
      const db = getDatabase();
      const authManager = new AuthManager(db);

      await authManager.deleteCredentials(pluginId);
      console.log(`✓ Revoked authentication for ${pluginId}`);

      db.close();
    } catch (error) {
      console.error(`❌ Failed to revoke authentication:`, error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Configuration
const configCommand = program.command('config').description('Manage configuration');

configCommand
  .command('get <key>')
  .description('Get configuration value')
  .action((key: string) => {
    try {
      const configManager = getConfigManager();

      const value = configManager.getPreference(key);

      if (value === undefined) {
        console.log(`⚠️  Configuration key not found: ${key}`);
      } else {
        console.log(`${key} = ${JSON.stringify(value, null, 2)}`);
      }
    } catch (error) {
      console.error('❌ Failed to get configuration:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

configCommand
  .command('set <key> <value>')
  .description('Set configuration value')
  .action((key: string, value: string) => {
    try {
      const configManager = getConfigManager();

      // Try to parse value as JSON, otherwise use as string
      let parsedValue: any = value;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        // Not JSON, use as string
      }

      configManager.setPreference(key, parsedValue);
      console.log(`✓ Set ${key} = ${JSON.stringify(parsedValue)}`);
    } catch (error) {
      console.error('❌ Failed to set configuration:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Headlines
program
  .command('headlines')
  .description('List recent headlines')
  .option('--all', 'Include filtered headlines')
  .option('--detail', 'Show detailed information')
  .option('--category <category>', 'Filter by category')
  .option('--limit <n>', 'Limit number of headlines', '20')
  .action((options: any) => {
    try {
      const db = getDatabase();
      const configManager = getConfigManager();
      const importanceConfig = configManager.getImportanceConfig();

      const queryOptions: any = {
        limit: parseInt(options.limit),
        category: options.category,
      };

      // Apply importance threshold if not showing all headlines
      if (!options.all) {
        queryOptions.minImportanceScore = importanceConfig.defaultThreshold;
      }

      const headlines = db.getHeadlines(queryOptions);

      if (headlines.length === 0) {
        console.log('No headlines found');
        db.close();
        return;
      }

      if (options.detail) {
        // Detailed view
        console.log(`📰 ${options.all ? 'All' : 'Important'} headlines:\n`);

        for (const headline of headlines) {
          const read = headline.read ? '✓' : ' ';
          console.log(`[${read}] ${headline.title}`);
          console.log(`   Score: ${headline.importanceScore.toFixed(2)} | Category: ${headline.category} | ${headline.pubDate.toLocaleString()}`);
          if (headline.description) {
            console.log(`   ${headline.description}`);
          }
          console.log();
        }
      } else {
        // Simple view - just titles
        for (const headline of headlines) {
          console.log(headline.title);
        }
      }

      db.close();
    } catch (error) {
      console.error('❌ Failed to list headlines:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('fetch')
  .description('Manually fetch headlines from plugins')
  .option('--plugin <plugin-id>', 'Fetch from specific plugin only')
  .action(async (options: any) => {
    try {
      const db = getDatabase();
      const pluginManager = new PluginManager(db);
      await pluginManager.initialize();

      if (options.plugin) {
        console.log(`🔄 Fetching from plugin: ${options.plugin}...`);
        await pluginManager.fetchFromPlugin(options.plugin);
      } else {
        console.log('🔄 Fetching from all enabled plugins...');
        await pluginManager.fetchFromAllPlugins();
      }

      await pluginManager.shutdown();
      db.close();
    } catch (error) {
      console.error('❌ Failed to fetch headlines:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Default command (TUI)
program
  .action(() => {
    console.log('🖥️  Launching Topix TUI...');
    // TODO: Implement TUI
  });

program.parse(process.argv);

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
