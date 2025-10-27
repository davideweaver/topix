/**
 * Tests for ServiceManager
 */

import { ServiceManager } from '@/managers/service-manager';
import { Headline } from '@/models/types';
import { v4 as uuidv4 } from 'uuid';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';

describe('ServiceManager', () => {
  let serviceManager: ServiceManager;
  const testPort = 3001; // Use different port for tests
  const testDbPath = join(__dirname, 'test-service-manager.db');

  beforeEach(() => {
    // Clean up test database if it exists
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }

    // Set test data directory
    process.env.TOPIX_DATA_DIR = join(__dirname, 'test-data');

    // Create service manager with test port
    serviceManager = new ServiceManager(testPort);
  });

  afterEach(async () => {
    // Stop service if running
    if (serviceManager.isRunning()) {
      await serviceManager.stop();
    }

    // Clean up test database
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  describe('Service Lifecycle', () => {
    it('should start the service', async () => {
      await serviceManager.start();

      expect(serviceManager.isRunning()).toBe(true);

      const status = serviceManager.getStatus();
      expect(status.running).toBe(true);
      expect(status.port).toBe(testPort);
      expect(status.pid).toBe(process.pid);
      expect(status.startedAt).toBeDefined();
    }, 10000);

    it('should stop the service', async () => {
      await serviceManager.start();
      expect(serviceManager.isRunning()).toBe(true);

      await serviceManager.stop();
      expect(serviceManager.isRunning()).toBe(false);

      const status = serviceManager.getStatus();
      expect(status.running).toBe(false);
    }, 10000);

    it('should throw error if starting when already running', async () => {
      await serviceManager.start();

      await expect(serviceManager.start()).rejects.toThrow('Service is already running');

      await serviceManager.stop();
    }, 10000);

    it('should handle multiple stop calls gracefully', async () => {
      await serviceManager.start();
      await serviceManager.stop();

      // Second stop should not throw
      await expect(serviceManager.stop()).resolves.not.toThrow();
    }, 10000);
  });

  describe('HTTP Endpoints', () => {
    beforeEach(async () => {
      await serviceManager.start();
    }, 10000);

    afterEach(async () => {
      await serviceManager.stop();
    }, 10000);

    it('should respond to health check endpoint', async () => {
      const response = await fetch(`http://localhost:${testPort}/health`);
      expect(response.ok).toBe(true);

      const data = (await response.json()) as { status: string; uptime: number };
      expect(data.status).toBe('ok');
      expect(data.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should respond to status endpoint', async () => {
      const response = await fetch(`http://localhost:${testPort}/api/status`);
      expect(response.ok).toBe(true);

      const data = (await response.json()) as { running: boolean; port: number };
      expect(data.running).toBe(true);
      expect(data.port).toBe(testPort);
    });

    it('should respond to plugins endpoint', async () => {
      const response = await fetch(`http://localhost:${testPort}/api/plugins`);
      expect(response.ok).toBe(true);

      const data = (await response.json()) as any[];
      expect(Array.isArray(data)).toBe(true);
    });

    it('should respond to headlines endpoint', async () => {
      const response = await fetch(`http://localhost:${testPort}/api/headlines`);
      expect(response.ok).toBe(true);

      const data = (await response.json()) as any[];
      expect(Array.isArray(data)).toBe(true);
    });

    it('should return 404 for unknown endpoints', async () => {
      const response = await fetch(`http://localhost:${testPort}/unknown`);
      expect(response.status).toBe(404);
    });
  });

  describe('RSS Feed Generation', () => {
    beforeEach(async () => {
      // Add some test headlines
      const managers = serviceManager.getManagers();
      const db = managers.db;

      const headline1: Headline = {
        id: uuidv4(),
        pluginId: 'test',
        title: 'Test Headline 1',
        description: 'Test description 1',
        link: 'https://example.com/1',
        pubDate: new Date(),
        createdAt: new Date(),
        category: 'test',
        tags: ['tag1', 'tag2'],
        importanceScore: 0.8,
        isImportant: true,
        metadata: {},
        read: false,
        starred: false,
        archived: false,
      };

      const headline2: Headline = {
        id: uuidv4(),
        pluginId: 'test',
        title: 'Test Headline 2',
        description: 'Test description 2',
        link: 'https://example.com/2',
        pubDate: new Date(),
        createdAt: new Date(),
        category: 'test',
        tags: ['tag3'],
        importanceScore: 0.7,
        isImportant: true,
        metadata: {},
        read: false,
        starred: false,
        archived: false,
      };

      db.insertHeadline(headline1);
      db.insertHeadline(headline2);

      await serviceManager.start();
    }, 10000);

    afterEach(async () => {
      await serviceManager.stop();
    }, 10000);

    it('should generate RSS feed', async () => {
      const response = await fetch(`http://localhost:${testPort}/feed.xml`);
      expect(response.ok).toBe(true);

      const contentType = response.headers.get('content-type');
      expect(contentType).toContain('application/xml');

      const feed = await response.text();
      expect(feed).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(feed).toContain('<rss version="2.0"');
      expect(feed).toContain('<title>');
      expect(feed).toContain('Test Headline 1');
      expect(feed).toContain('Test Headline 2');
    });

    it('should escape XML special characters in feed', async () => {
      const managers = serviceManager.getManagers();
      const db = managers.db;

      const headline: Headline = {
        id: uuidv4(),
        pluginId: 'test',
        title: 'Title with <special> & "characters"',
        description: 'Description with <tags> & entities',
        link: 'https://example.com/special',
        pubDate: new Date(),
        createdAt: new Date(),
        category: 'test',
        tags: [],
        importanceScore: 0.9,
        isImportant: true,
        metadata: {},
        read: false,
        starred: false,
        archived: false,
      };

      db.insertHeadline(headline);

      const response = await fetch(`http://localhost:${testPort}/feed.xml`);
      const feed = await response.text();

      expect(feed).toContain('&lt;special&gt;');
      expect(feed).toContain('&amp;');
      expect(feed).toContain('&quot;');
    });
  });

  describe('Status Information', () => {
    it('should return not running status when stopped', () => {
      const status = serviceManager.getStatus();

      expect(status.running).toBe(false);
      expect(status.pid).toBeUndefined();
      expect(status.port).toBeUndefined();
      expect(status.startedAt).toBeUndefined();
    });

    it('should return running status with stats when started', async () => {
      await serviceManager.start();

      const status = serviceManager.getStatus();

      expect(status.running).toBe(true);
      expect(status.pid).toBe(process.pid);
      expect(status.port).toBe(testPort);
      expect(status.startedAt).toBeInstanceOf(Date);
      expect(status.uptime).toBeGreaterThanOrEqual(0);
      expect(status.stats).toBeDefined();
      expect(status.stats?.totalPlugins).toBeGreaterThanOrEqual(0);
      expect(status.stats?.enabledPlugins).toBeGreaterThanOrEqual(0);

      await serviceManager.stop();
    }, 10000);
  });

  describe('Manager Access', () => {
    it('should provide access to managers', () => {
      const managers = serviceManager.getManagers();

      expect(managers.db).toBeDefined();
      expect(managers.pluginManager).toBeDefined();
      expect(managers.authManager).toBeDefined();
      expect(managers.configManager).toBeDefined();
    });
  });
});
