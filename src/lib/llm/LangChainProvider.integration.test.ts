import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { LangChainProvider } from '@/lib/llm/LangChainProvider'

/**
 * Integration tests for LangChainProvider
 * 
 * To run the full integration test with API calls:
 * 1. Set the LITELLM_API_KEY environment variable
 * 2. Run: LITELLM_API_KEY=your-key npm test -- LangChainProvider.integration.test.ts
 */
describe('LangChainProvider Integration Test', () => {
  let provider: LangChainProvider
  
  beforeAll(() => {
    // Get the singleton instance
    provider = LangChainProvider.getInstance()
    provider.clearCache()
  })
  
  afterAll(() => {
    // Clean up
    provider.clearCache()
  })
  
  it('should successfully create Nxtscape LLM instance', async () => {
    // Note: This test validates the LLM instance creation
    // The internal configuration (proxy URL, API key) is handled by LangChain
    
    // Create a direct config for Nxtscape provider
    const config = {
      provider: 'nxtscape' as const,
      model: 'gpt-4o-mini',
      temperature: 0,
      streaming: false
    }
    
    // Create LLM instance
    const llm = provider.createLLMFromConfig(config)
    
    // Verify instance is created correctly
    expect(llm).toBeDefined()
    expect(llm.constructor.name).toBe('ChatOpenAI')
    
    // Verify basic configuration that we can access
    const chatModel = llm as any
    expect(chatModel.modelName).toBe('gpt-4o-mini')
    expect(chatModel.temperature).toBe(0)
    expect(chatModel.streaming).toBe(false)
    
    console.log('✓ Nxtscape LLM instance created successfully')
    console.log(`  - Provider: Nxtscape (using LiteLLM proxy)`)
    console.log(`  - Model: ${chatModel.modelName}`)
    console.log(`  - Temperature: ${chatModel.temperature}`)
    console.log(`  - Streaming: ${chatModel.streaming}`)
  })
  
  it.skipIf(!process.env.LITELLM_API_KEY || process.env.LITELLM_API_KEY === 'nokey')(
    'should successfully invoke Nxtscape LLM via LiteLLM proxy (requires LITELLM_API_KEY)',
    async () => {
      // This test only runs if LITELLM_API_KEY is properly configured
      const config = {
        provider: 'nxtscape' as const,
        model: 'gpt-4o-mini',
        temperature: 0,
        maxTokens: 50
      }
      
      const llm = provider.createLLMFromConfig(config)
      
      // Test with a simple prompt
      const response = await llm.invoke('Say "Hello from Nxtscape!" and nothing else.')
      
      // Verify response
      expect(response).toBeDefined()
      expect(response.content).toBeDefined()
      expect(typeof response.content).toBe('string')
      
      // The response should contain our expected text
      const responseText = response.content.toString().toLowerCase()
      expect(responseText).toContain('hello')
      
      console.log('✓ Integration test successful! Response:', response.content)
    }, 
    30000
  )
})