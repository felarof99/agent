import { describe, it, expect, vi } from 'vitest'
import { BrowserAgent } from './BrowserAgent'
import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { MessageManager } from '@/lib/runtime/MessageManager'
import { BrowserContext } from '@/lib/browser/BrowserContext'
import { EventBus, EventProcessor } from '@/lib/events'

describe('BrowserAgent-unit-test', () => {
  // Unit Test 1: Creation and initialization
  it('should be created with required dependencies', () => {
    const messageManager = new MessageManager()
    const browserContext = new BrowserContext()
    const abortController = new AbortController()
    const eventBus = new EventBus()
    const eventProcessor = new EventProcessor(eventBus)
    
    const executionContext = new ExecutionContext({
      browserContext,
      messageManager,
      abortController,
      debugMode: false,
      eventBus,
      eventProcessor
    })
    
    const browserAgent = new BrowserAgent(executionContext)
    
    // Verify the agent is created and has proper initial state
    expect(browserAgent).toBeDefined()
    expect(browserAgent['toolManager']).toBeDefined()
    expect(browserAgent['messageManager']).toBe(messageManager)
    expect(browserAgent['executionContext']).toBe(executionContext)
  })

  // Unit Test 2: Method calls and state changes during execution
  it('should call classification and process steps correctly', async () => {
    const messageManager = new MessageManager()
    const browserContext = new BrowserContext()
    const abortController = new AbortController()
    const eventBus = new EventBus()
    const eventProcessor = new EventProcessor(eventBus)
    
    const executionContext = new ExecutionContext({
      browserContext,
      messageManager,
      abortController,
      debugMode: false,
      eventBus,
      eventProcessor
    })
    
    const browserAgent = new BrowserAgent(executionContext)
    
    // Spy on private methods to verify behavior
    const classifyTaskSpy = vi.spyOn(browserAgent as any, '_classifyTask')
      .mockResolvedValue({ is_simple_task: true })
    const executeSimpleTaskSpy = vi.spyOn(browserAgent as any, '_executeSimpleTaskStrategy')
      .mockResolvedValue(undefined)
    
    // Execute task
    await browserAgent.execute('simple test task')
    
    // Verify methods were called
    expect(classifyTaskSpy).toHaveBeenCalledWith('simple test task')
    expect(executeSimpleTaskSpy).toHaveBeenCalledWith('simple test task')
    
    // Verify state changes
    expect(messageManager.getMessages().length).toBeGreaterThan(0)
  })

  // Unit Test 3: Error handling
  it('should handle errors gracefully', async () => {
    const messageManager = new MessageManager()
    const browserContext = new BrowserContext()
    const abortController = new AbortController()
    const eventBus = new EventBus()
    const eventProcessor = new EventProcessor(eventBus)
    
    const executionContext = new ExecutionContext({
      browserContext,
      messageManager,
      abortController,
      debugMode: false,
      eventBus,
      eventProcessor
    })
    
    const browserAgent = new BrowserAgent(executionContext)
    
    // Spy on error event emission
    const errorSpy = vi.spyOn(eventProcessor, 'error')
    
    // Make classification fail
    vi.spyOn(browserAgent as any, '_classifyTask')
      .mockRejectedValue(new Error('Classification failed'))
    
    // Execute should throw error
    await expect(browserAgent.execute('test task')).rejects.toThrow('Classification failed')
    
    // Verify error was emitted
    expect(errorSpy).toHaveBeenCalledWith('Classification failed', true)
  })
})

describe('BrowserAgent-integration-test', () => {
  // Integration Test: Real LLM call with simple flow verification
  it.skipIf(!process.env.LITELLM_API_KEY || process.env.LITELLM_API_KEY === 'nokey')(
    'should work with real LLM',
    async () => {
      // Setup with real dependencies
      const messageManager = new MessageManager()
      const browserContext = new BrowserContext()
      const abortController = new AbortController()
      const eventBus = new EventBus()
      const eventProcessor = new EventProcessor(eventBus)
      
      const executionContext = new ExecutionContext({
        browserContext,
        messageManager,
        abortController,
        debugMode: false,
        eventBus,
        eventProcessor
      })
      
      const browserAgent = new BrowserAgent(executionContext)
      
      // Start execution (don't await)
      browserAgent.execute('what is 2 + 2?')
      
      // Wait for initial processing
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      // High-level verification - verify major things happened
      expect(messageManager.getMessages().length).toBeGreaterThanOrEqual(2)  // System prompt + task added
      expect(browserAgent['toolManager'].getAll().length).toBeGreaterThan(0)  // Tools are registered
      
      // Cleanup
      abortController.abort()
    },
    30000
  )
})