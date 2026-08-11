import { openai, createOpenAI } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import type { LanguageModel } from 'ai'

export type AIProvider = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'openai-compatible'
export type AIModel = string

export interface AIProviderConfig {
  provider: AIProvider
  model: AIModel
  baseURL?: string
  apiKey?: string
  relayToken?: string
}

const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-3.5-flash-lite',
  deepseek: 'deepseek-v4-flash',
  'openai-compatible': 'gpt-4o-mini',
}

const ENV_VARS: Record<AIProvider, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  'openai-compatible': 'OPENAI_API_KEY',
}

export function getModel(config: AIProviderConfig): LanguageModel {
  const { provider, model, baseURL, apiKey } = config
  const resolvedModel = model || DEFAULT_MODELS[provider]
  const resolvedKey = apiKey || process.env[ENV_VARS[provider]] || ''

  switch (provider) {
    case 'openai':
      if (apiKey || baseURL) return createOpenAI({ apiKey: resolvedKey, baseURL })(resolvedModel)
      return openai(resolvedModel)
    case 'deepseek': {
      const provider = createOpenAI({
        baseURL: baseURL || 'https://api.deepseek.com/v1',
        apiKey: resolvedKey,
      })
      return provider(resolvedModel)
    }
    case 'openai-compatible': {
      if (!baseURL && !apiKey) return openai(resolvedModel)
      const provider = createOpenAI({ baseURL: baseURL || undefined, apiKey: resolvedKey || undefined })
      return provider(resolvedModel)
    }
    case 'anthropic':
      if (apiKey) {
        const { createAnthropicAI } = require('@ai-sdk/anthropic')
        return createAnthropicAI({ apiKey })(resolvedModel)
      }
      return anthropic(resolvedModel)
    case 'google': {
      if (apiKey) {
        const { createGoogleGenerativeAI } = require('@ai-sdk/google')
        return createGoogleGenerativeAI({ apiKey })(resolvedModel)
      }
      return google(resolvedModel)
    }
    default:
      return openai(resolvedModel)
  }
}