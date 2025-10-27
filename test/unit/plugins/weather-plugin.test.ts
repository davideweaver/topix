/**
 * Tests for Weather Plugin
 */

import { WeatherPlugin } from '@/plugins/weather-plugin';
import { PluginConfig, FetchContext } from '@/models/types';

describe('WeatherPlugin', () => {
  let plugin: WeatherPlugin;

  beforeEach(() => {
    plugin = new WeatherPlugin();
  });

  describe('Plugin Metadata', () => {
    it('should have correct metadata', () => {
      expect(plugin.id).toBe('weather');
      expect(plugin.name).toBe('Weather');
      expect(plugin.description).toContain('weather');
      expect(plugin.version).toBeDefined();
      expect(plugin.author).toBeDefined();
    });
  });

  describe('Configuration', () => {
    it('should have a valid config schema', () => {
      const schema = plugin.getConfigSchema();

      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
      expect(schema.properties.latitude).toBeDefined();
      expect(schema.properties.longitude).toBeDefined();
      expect(schema.properties.location).toBeDefined();
    });

    it('should validate correct config', () => {
      const config = {
        latitude: 37.7749,
        longitude: -122.4194,
        location: 'San Francisco, CA',
        temperatureUnit: 'fahrenheit',
      };

      const result = plugin.validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject invalid latitude', () => {
      const config = {
        latitude: 100, // Invalid: > 90
        longitude: -122.4194,
        location: 'Test',
      };

      const result = plugin.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Latitude must be a number between -90 and 90');
    });

    it('should reject invalid longitude', () => {
      const config = {
        latitude: 37.7749,
        longitude: 200, // Invalid: > 180
        location: 'Test',
      };

      const result = plugin.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Longitude must be a number between -180 and 180');
    });

    it('should reject invalid temperature unit', () => {
      const config = {
        latitude: 37.7749,
        longitude: -122.4194,
        location: 'Test',
        temperatureUnit: 'kelvin', // Invalid
      };

      const result = plugin.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Temperature unit must be "fahrenheit" or "celsius"');
    });

    it('should initialize with custom config', async () => {
      const config: PluginConfig = {
        pluginId: 'weather',
        enabled: true,
        schedule: '*/30 * * * *',
        config: {
          latitude: 40.7128,
          longitude: -74.006,
          location: 'New York, NY',
          temperatureUnit: 'fahrenheit',
        },
        importance: {
          llmEnabled: false,
          baseWeight: 1.0,
          threshold: 0.5,
          rules: [],
        },
      };

      await plugin.initialize(config);

      // Plugin should accept the config without errors
      expect(plugin).toBeDefined();
    });
  });

  describe('Authentication', () => {
    it('should not require authentication', () => {
      const authReq = plugin.getAuthRequirements();

      expect(authReq).toBeNull();
    });
  });

  describe('Health Check', () => {
    it('should check API health', async () => {
      const health = await plugin.healthCheck();

      expect(health).toBeDefined();
      expect(health.lastChecked).toBeInstanceOf(Date);
      expect(typeof health.healthy).toBe('boolean');
      expect(typeof health.message).toBe('string');
    }, 10000);
  });

  describe('Fetching Headlines', () => {
    it('should fetch weather headlines', async () => {
      const context: FetchContext = {
        pluginId: 'weather',
        config: {
          latitude: 37.7749,
          longitude: -122.4194,
          location: 'San Francisco, CA',
          temperatureUnit: 'fahrenheit',
        },
      };

      await plugin.initialize({
        pluginId: 'weather',
        enabled: true,
        schedule: '*/30 * * * *',
        config: context.config,
        importance: {
          llmEnabled: false,
          baseWeight: 1.0,
          threshold: 0.5,
          rules: [],
        },
      });

      const headlines = await plugin.fetchHeadlines(context);

      expect(headlines).toBeDefined();
      expect(Array.isArray(headlines)).toBe(true);
      expect(headlines.length).toBeGreaterThan(0);

      // Verify headline structure
      const firstHeadline = headlines[0];
      expect(firstHeadline.id).toBeDefined();
      expect(firstHeadline.pluginId).toBe('weather');
      expect(firstHeadline.title).toBeDefined();
      expect(firstHeadline.pubDate).toBeInstanceOf(Date);
      expect(firstHeadline.category).toBe('weather');
      expect(firstHeadline.tags).toBeDefined();
      expect(Array.isArray(firstHeadline.tags)).toBe(true);
    }, 15000);

    it('should include current conditions headline', async () => {
      const context: FetchContext = {
        pluginId: 'weather',
        config: {
          latitude: 37.7749,
          longitude: -122.4194,
          location: 'San Francisco, CA',
          temperatureUnit: 'fahrenheit',
        },
      };

      await plugin.initialize({
        pluginId: 'weather',
        enabled: true,
        schedule: '*/30 * * * *',
        config: context.config,
        importance: {
          llmEnabled: false,
          baseWeight: 1.0,
          threshold: 0.5,
          rules: [],
        },
      });

      const headlines = await plugin.fetchHeadlines(context);

      const currentCondition = headlines.find((h) => h.tags.includes('current'));
      expect(currentCondition).toBeDefined();
      expect(currentCondition?.title).toContain('San Francisco, CA');
    }, 15000);

    it('should include forecast headline', async () => {
      const context: FetchContext = {
        pluginId: 'weather',
        config: {
          latitude: 37.7749,
          longitude: -122.4194,
          location: 'San Francisco, CA',
          temperatureUnit: 'fahrenheit',
        },
      };

      await plugin.initialize({
        pluginId: 'weather',
        enabled: true,
        schedule: '*/30 * * * *',
        config: context.config,
        importance: {
          llmEnabled: false,
          baseWeight: 1.0,
          threshold: 0.5,
          rules: [],
        },
      });

      const headlines = await plugin.fetchHeadlines(context);

      const forecast = headlines.find((h) => h.tags.includes('forecast'));
      expect(forecast).toBeDefined();
      expect(forecast?.title).toContain('Forecast');
    }, 15000);
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully', async () => {
      await expect(plugin.shutdown()).resolves.not.toThrow();
    });
  });
});
