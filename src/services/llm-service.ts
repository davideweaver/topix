/**
 * LLM Service
 * Provides text generation capabilities using configured LLM providers (Ollama or OpenRouter)
 */

import { TopixDatabase } from '@/models/database';
import { LLMConfig, LLMProvider } from '@/models/types';

export interface LLMGenerateOptions {
  temperature?: number;
  maxTokens?: number;
}

export class LLMService {
  private db: TopixDatabase;

  constructor(db: TopixDatabase) {
    this.db = db;
  }

  /**
   * Generate text using the configured LLM provider
   */
  async generateText(prompt: string, options: LLMGenerateOptions = {}): Promise<string> {
    const prefs = this.db.getUserPreferences();
    const llmConfig = prefs.llm;

    if (llmConfig.provider === 'none') {
      throw new Error('LLM provider is disabled. Configure an LLM provider to use AI features.');
    }

    switch (llmConfig.provider) {
      case 'ollama':
        if (!llmConfig.ollama) {
          throw new Error('Ollama configuration is missing');
        }
        return await this.generateWithOllama(prompt, llmConfig.ollama, options);

      case 'openrouter':
        if (!llmConfig.openrouter) {
          throw new Error('OpenRouter configuration is missing');
        }
        return await this.generateWithOpenRouter(prompt, llmConfig.openrouter, options);

      default:
        throw new Error(`Unsupported LLM provider: ${llmConfig.provider}`);
    }
  }

  /**
   * Generate text using Ollama
   */
  private async generateWithOllama(
    prompt: string,
    config: NonNullable<LLMConfig['ollama']>,
    options: LLMGenerateOptions
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeout);

    try {
      const response = await fetch(`${config.endpoint}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          prompt,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.maxTokens ?? 500,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as {
        response: string;
        done: boolean;
      };

      return data.response.trim();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Ollama request timed out after ${config.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Generate text using OpenRouter
   */
  private async generateWithOpenRouter(
    prompt: string,
    config: NonNullable<LLMConfig['openrouter']>,
    options: LLMGenerateOptions
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeout);

    try {
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
          'HTTP-Referer': 'https://github.com/dweaver/topix',
          'X-Title': 'Topix',
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 500,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = (await response.json()) as {
        choices: Array<{
          message: {
            content: string;
          };
        }>;
      };

      if (!data.choices || data.choices.length === 0) {
        throw new Error('OpenRouter returned no choices');
      }

      return data.choices[0].message.content.trim();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`OpenRouter request timed out after ${config.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Check if LLM is available and configured
   */
  isAvailable(): boolean {
    const prefs = this.db.getUserPreferences();
    return prefs.llm.provider !== 'none';
  }

  /**
   * Get the current LLM provider name
   */
  getProvider(): LLMProvider {
    const prefs = this.db.getUserPreferences();
    return prefs.llm.provider;
  }
}
