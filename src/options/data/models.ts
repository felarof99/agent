export interface ModelInfo {
  modelId: string
  contextLength: number
}

export interface ModelsData {
  openai: ModelInfo[]
  anthropic: ModelInfo[]
  google_gemini: ModelInfo[]
  openrouter: ModelInfo[]
  openai_compatible: ModelInfo[]
  ollama: ModelInfo[]
}

export const MODELS_DATA: ModelsData = {
  openai: [
    { modelId: 'gpt-4o', contextLength: 128000 },
    { modelId: 'gpt-4o-mini', contextLength: 128000 },
    { modelId: 'gpt-4-turbo', contextLength: 128000 },
    { modelId: 'gpt-4', contextLength: 8192 },
    { modelId: 'gpt-3.5-turbo', contextLength: 16385 },
    { modelId: 'o1', contextLength: 200000 },
    { modelId: 'o1-mini', contextLength: 128000 },
    { modelId: 'o3-mini', contextLength: 128000 }
  ],
  anthropic: [
    { modelId: 'claude-opus-4-20250514', contextLength: 200000 },
    { modelId: 'claude-sonnet-4-20250514', contextLength: 200000 },
    { modelId: 'claude-3-5-sonnet-20241022', contextLength: 200000 },
    { modelId: 'claude-3-5-haiku-20241022', contextLength: 200000 },
    { modelId: 'claude-3-opus-20240229', contextLength: 200000 },
    { modelId: 'claude-3-sonnet-20240229', contextLength: 200000 },
    { modelId: 'claude-3-haiku-20240307', contextLength: 200000 }
  ],
  google_gemini: [
    { modelId: 'gemini-2.0-flash-exp', contextLength: 1048576 },
    { modelId: 'gemini-1.5-pro-latest', contextLength: 2097152 },
    { modelId: 'gemini-1.5-flash-latest', contextLength: 1048576 },
    { modelId: 'gemini-2.5-pro', contextLength: 2097152 },
    { modelId: 'gemini-2.5-flash', contextLength: 1048576 }
  ],
  openrouter: [
    { modelId: 'deepseek/deepseek-chat', contextLength: 64000 },
    { modelId: 'anthropic/claude-opus-4', contextLength: 200000 },
    { modelId: 'anthropic/claude-3.5-sonnet', contextLength: 200000 },
    { modelId: 'google/gemini-2.0-flash-exp', contextLength: 1048576 },
    { modelId: 'openai/gpt-4o', contextLength: 128000 },
    { modelId: 'meta-llama/llama-3.3-70b-instruct', contextLength: 131072 },
    { modelId: 'mistralai/mistral-large', contextLength: 128000 }
  ],
  openai_compatible: [
    { modelId: 'lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF', contextLength: 131072 },
    { modelId: 'lmstudio-community/Qwen2.5-Coder-32B-Instruct-GGUF', contextLength: 32768 },
    { modelId: 'TheBloke/Mistral-7B-Instruct-v0.2-GGUF', contextLength: 32768 },
    { modelId: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B-GGUF', contextLength: 64000 }
  ],
  ollama: [
    { modelId: 'qwen3:4b', contextLength: 32768 },  
    { modelId: 'qwen3:8b', contextLength: 32768 },
    { modelId: 'qwen3:14b', contextLength: 32768 },
    { modelId: 'qwen3-coder:30b', contextLength: 131072 },  
    { modelId: 'llama3.1:8b', contextLength: 131072 },
    { modelId: 'llama3.2:3b', contextLength: 131072 },
    { modelId: 'deepseek-r1:7b', contextLength: 64000 },
    { modelId: 'qwen2.5:7b', contextLength: 32768 },  
    { modelId: 'qwen2.5-coder:7b', contextLength: 32768 },  
    { modelId: 'mistral:7b', contextLength: 32768 },
    { modelId: 'codellama:7b', contextLength: 16384 },
    { modelId: 'phi3:3.8b', contextLength: 131072 }
  ]
}

export function getModelsForProvider(providerType: string): ModelInfo[] {
  const normalizedType = providerType.toLowerCase() as keyof ModelsData
  return MODELS_DATA[normalizedType] || []
}

export function getModelContextLength(providerType: string, modelId: string): number | undefined {
  const models = getModelsForProvider(providerType)
  const model = models.find(m => m.modelId === modelId)
  return model?.contextLength
}
