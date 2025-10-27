/**
 * Weather Plugin
 * Fetches weather data from Open-Meteo API and generates weather headlines
 * No API key required - uses free Open-Meteo API
 */

import {
  TopixPlugin,
  PluginConfig,
  FetchContext,
  Headline,
  ConfigSchema,
  ValidationResult,
  AuthRequirement,
  AuthCredentials,
  HealthStatus,
  RetentionPolicy,
} from '@/models/types';
import { v4 as uuidv4 } from 'uuid';
import { LLMService } from '@/services/llm-service';
import { TopixDatabase } from '@/models/database';

interface WeatherConfig {
  latitude: number;
  longitude: number;
  location: string; // Display name (e.g., "San Francisco, CA")
  temperatureUnit: 'fahrenheit' | 'celsius';
  llmPrompt?: string; // Custom prompt for AI headline generation
}

interface WeatherData {
  current: {
    temperature: number;
    weatherCode: number;
    windSpeed: number;
    precipitation: number;
    humidity: number;
  };
  daily: {
    date: string;
    temperatureMax: number;
    temperatureMin: number;
    weatherCode: number;
    precipitationSum: number;
    precipitationProbability: number;
  }[];
}

export class WeatherPlugin implements TopixPlugin {
  readonly id = 'weather';
  readonly name = 'Weather';
  readonly description = 'Get weather updates and forecasts for your location';
  readonly version = '0.1.0';
  readonly author = 'Dave Weaver';

  private config: WeatherConfig = {
    latitude: 37.7749,
    longitude: -122.4194,
    location: 'San Francisco, CA',
    temperatureUnit: 'fahrenheit',
  };

  async initialize(config: PluginConfig): Promise<void> {
    if (config.config.latitude && config.config.longitude) {
      this.config = config.config as WeatherConfig;
    }
  }

  async shutdown(): Promise<void> {
    // No cleanup needed
  }

  async fetchHeadlines(context: FetchContext): Promise<Headline[]> {
    try {
      const weatherData = await this.fetchWeather();
      return await this.generateHeadlines(weatherData, context.db);
    } catch (error) {
      console.error('Failed to fetch weather:', error);
      return [];
    }
  }

  private async fetchWeather(): Promise<WeatherData> {
    const tempUnit = this.config.temperatureUnit === 'celsius' ? 'celsius' : 'fahrenheit';
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${this.config.latitude}&longitude=${this.config.longitude}&current=temperature_2m,weather_code,wind_speed_10m,precipitation,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&temperature_unit=${tempUnit}&timezone=auto`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Weather API error: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      current: {
        temperature_2m: number;
        weather_code: number;
        wind_speed_10m: number;
        precipitation: number;
        relative_humidity_2m: number;
      };
      daily: {
        time: string[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        weather_code: number[];
        precipitation_sum: number[];
        precipitation_probability_max: number[];
      };
    };

    return {
      current: {
        temperature: data.current.temperature_2m,
        weatherCode: data.current.weather_code,
        windSpeed: data.current.wind_speed_10m,
        precipitation: data.current.precipitation,
        humidity: data.current.relative_humidity_2m,
      },
      daily: data.daily.time.slice(0, 7).map((date: string, index: number) => ({
        date,
        temperatureMax: data.daily.temperature_2m_max[index],
        temperatureMin: data.daily.temperature_2m_min[index],
        weatherCode: data.daily.weather_code[index],
        precipitationSum: data.daily.precipitation_sum[index],
        precipitationProbability: data.daily.precipitation_probability_max[index],
      })),
    };
  }

  private async generateHeadlines(weatherData: WeatherData, db: TopixDatabase): Promise<Headline[]> {
    const now = new Date();
    const tempUnit = this.config.temperatureUnit === 'fahrenheit' ? '°F' : '°C';

    // Format weather data for LLM
    const currentWeather = this.formatCurrentWeather(weatherData, tempUnit);
    const forecastData = this.formatForecast(weatherData, tempUnit);

    // Get the LLM prompt from config or use default
    const promptTemplate = this.config.llmPrompt || this.getConfigSchema().properties.llmPrompt.default as string;
    const prompt = promptTemplate
      .replace('{current}', currentWeather)
      .replace('{forecast}', forecastData);

    let headlineText: string;
    try {
      // Try to generate AI headline
      const llmService = new LLMService(db);
      headlineText = await llmService.generateText(prompt);
    } catch (error) {
      // Fallback to simple headline if LLM fails
      console.warn('Failed to generate AI headline, using fallback:', error);
      const currentCondition = this.getWeatherDescription(weatherData.current.weatherCode);
      headlineText = `${currentCondition}, ${Math.round(weatherData.current.temperature)}${tempUnit} in ${this.config.location}`;
    }

    // Create single headline
    const headline: Headline = {
      id: uuidv4(),
      pluginId: this.id,
      title: headlineText,
      description: `Weather update for ${this.config.location}`,
      pubDate: now,
      createdAt: now,
      category: 'weather',
      tags: ['weather', 'forecast', 'ai-generated'],
      importanceScore: 0.5,
      isImportant: false,
      metadata: {
        temperature: weatherData.current.temperature,
        weatherCode: weatherData.current.weatherCode,
        location: this.config.location,
      },
      read: false,
      starred: false,
      archived: false,
    };

    return [headline];
  }

  private formatCurrentWeather(weatherData: WeatherData, tempUnit: string): string {
    const condition = this.getWeatherDescription(weatherData.current.weatherCode);
    const temp = Math.round(weatherData.current.temperature);
    const wind = Math.round(weatherData.current.windSpeed);
    const precip = weatherData.current.precipitation;

    let weather = `${condition}, ${temp}${tempUnit}`;
    if (wind > 25) {
      weather += `, winds ${wind} mph`;
    }
    if (precip > 0) {
      weather += `, precipitation ${precip} mm`;
    }

    return weather;
  }

  private formatForecast(weatherData: WeatherData, tempUnit: string): string {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const lines: string[] = [];

    for (const day of weatherData.daily) {
      const date = new Date(day.date);
      const dayName = dayNames[date.getDay()];
      const condition = this.getWeatherDescription(day.weatherCode);
      const high = Math.round(day.temperatureMax);
      const low = Math.round(day.temperatureMin);
      const precipProb = day.precipitationProbability;

      let line = `${dayName}: ${condition}, High ${high}${tempUnit}, Low ${low}${tempUnit}`;
      if (precipProb > 30) {
        line += `, ${precipProb}% chance of precipitation`;
      }

      lines.push(line);
    }

    return lines.join('\n');
  }

  private getWeatherDescription(code: number): string {
    // WMO Weather interpretation codes
    const weatherCodes: { [key: number]: string } = {
      0: 'Clear sky',
      1: 'Mainly clear',
      2: 'Partly cloudy',
      3: 'Overcast',
      45: 'Foggy',
      48: 'Depositing rime fog',
      51: 'Light drizzle',
      53: 'Moderate drizzle',
      55: 'Dense drizzle',
      61: 'Slight rain',
      63: 'Moderate rain',
      65: 'Heavy rain',
      71: 'Slight snow',
      73: 'Moderate snow',
      75: 'Heavy snow',
      77: 'Snow grains',
      80: 'Slight rain showers',
      81: 'Moderate rain showers',
      82: 'Violent rain showers',
      85: 'Slight snow showers',
      86: 'Heavy snow showers',
      95: 'Thunderstorm',
      96: 'Thunderstorm with slight hail',
      99: 'Thunderstorm with heavy hail',
    };

    return weatherCodes[code] || 'Unknown conditions';
  }


  getConfigSchema(): ConfigSchema {
    return {
      type: 'object',
      properties: {
        latitude: {
          type: 'number',
          description: 'Latitude of your location',
          default: 37.7749,
        },
        longitude: {
          type: 'number',
          description: 'Longitude of your location',
          default: -122.4194,
        },
        location: {
          type: 'string',
          description: 'Display name for your location (e.g., "San Francisco, CA")',
          default: 'San Francisco, CA',
        },
        temperatureUnit: {
          type: 'string',
          description: 'Temperature unit (fahrenheit or celsius)',
          default: 'fahrenheit',
        },
        llmPrompt: {
          type: 'string',
          description: 'Custom prompt for AI-generated weather headline',
          default: `You are a weather reporter creating a concise, natural headline summarizing current weather and significant changes in the next 7 days.

Current weather: {current}
7-day forecast: {forecast}

Guidelines:
- Start with current conditions (e.g., "Sunny and 38°F today")
- Mention significant upcoming changes (temperature drops/rises, precipitation, severe weather)
- Mention specific day names for important events (e.g., "snow on Wednesday")
- Skip humidity and wind speed unless they have major impact (e.g., dangerous winds)
- Keep it to 1-2 sentences maximum
- Be conversational and natural

Create the headline:`,
        },
      },
      required: ['latitude', 'longitude', 'location'],
    };
  }

  validateConfig(config: unknown): ValidationResult {
    const errors: string[] = [];

    if (typeof config !== 'object' || config === null) {
      return { valid: false, errors: ['Config must be an object'] };
    }

    const cfg = config as Record<string, any>;

    if (typeof cfg.latitude !== 'number' || cfg.latitude < -90 || cfg.latitude > 90) {
      errors.push('Latitude must be a number between -90 and 90');
    }

    if (typeof cfg.longitude !== 'number' || cfg.longitude < -180 || cfg.longitude > 180) {
      errors.push('Longitude must be a number between -180 and 180');
    }

    if (cfg.location && typeof cfg.location !== 'string') {
      errors.push('Location must be a string');
    }

    if (cfg.temperatureUnit && !['fahrenheit', 'celsius'].includes(cfg.temperatureUnit)) {
      errors.push('Temperature unit must be "fahrenheit" or "celsius"');
    }

    if (cfg.llmPrompt && typeof cfg.llmPrompt !== 'string') {
      errors.push('llmPrompt must be a string');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  getAuthRequirements(): AuthRequirement | null {
    // No authentication required for Open-Meteo API
    return null;
  }

  setAuthCredentials(_credentials: AuthCredentials): void {
    // No authentication needed
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      // Test the API with a simple request
      const response = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&current=temperature_2m'
      );

      if (!response.ok) {
        return {
          healthy: false,
          message: `Weather API returned ${response.status}: ${response.statusText}`,
          lastChecked: new Date(),
        };
      }

      return {
        healthy: true,
        message: 'Weather API is accessible',
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Failed to reach Weather API: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastChecked: new Date(),
      };
    }
  }

  getRetentionPolicy(): RetentionPolicy {
    // Weather plugin only needs the latest conditions
    // Delete all previous headlines after each fetch
    return { type: 'count', value: 1 };
  }
}

// Export plugin instance
export default new WeatherPlugin();
