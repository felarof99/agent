import { describe, it, expect, vi } from 'vitest'
import { FindElementTool } from './FindElementTool'
import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { MessageManager } from '@/lib/runtime/MessageManager'
import { BrowserContext } from '@/lib/browser/BrowserContext'
import { EventBus, EventProcessor } from '@/lib/events'
import { withFlexibleStructuredOutput } from '@/lib/llm/utils/structuredOutput'

// Mock the structured output utility
vi.mock('@/lib/llm/utils/structuredOutput')

describe('FindElementTool', () => {
  // Unit Test 1: Tool creation
  it('should be created with required dependencies', () => {
    const messageManager = new MessageManager()
    const browserContext = new BrowserContext()
    const eventBus = new EventBus()
    const eventProcessor = new EventProcessor(eventBus)
    
    const executionContext = new ExecutionContext({
      browserContext,
      messageManager,
      abortController: new AbortController(),
      debugMode: false,
      eventBus,
      eventProcessor
    })
    
    const tool = new FindElementTool(executionContext)
    expect(tool).toBeDefined()
  })

  // Unit Test 2: Handle empty page
  it('should handle page with no interactive elements', async () => {
    const browserContext = new BrowserContext()
    const executionContext = new ExecutionContext({
      browserContext,
      messageManager: new MessageManager(),
      abortController: new AbortController(),
      debugMode: false,
      eventBus: new EventBus(),
      eventProcessor: new EventProcessor(new EventBus())
    })
    
    // Mock empty browser state
    vi.spyOn(browserContext, 'getBrowserState').mockResolvedValue({
      clickableElements: [],
      typeableElements: [],
      clickableElementsString: '',
      typeableElementsString: '',
      url: 'https://example.com',
      title: 'Test Page',
      screenshot: null
    })
    
    const tool = new FindElementTool(executionContext)
    const result = await tool.execute({
      elementDescription: 'submit button'
    })
    
    expect(result.ok).toBe(false)
    expect(result.error).toBe('No interactive elements found on the current page')
  })

  // Unit Test 3: Handle LLM errors
  it('should handle LLM invocation errors gracefully', async () => {
    const browserContext = new BrowserContext()
    const executionContext = new ExecutionContext({
      browserContext,
      messageManager: new MessageManager(),
      abortController: new AbortController(),
      debugMode: false,
      eventBus: new EventBus(),
      eventProcessor: new EventProcessor(new EventBus())
    })
    
    // Mock browser state with elements
    vi.spyOn(browserContext, 'getBrowserState').mockResolvedValue({
      clickableElements: [{ nodeId: 1, text: 'Submit', tag: 'button' }],
      typeableElements: [],
      clickableElementsString: '[1] <C> <button> "Submit"',
      typeableElementsString: '',
      url: 'https://example.com',
      title: 'Test Page',
      screenshot: null
    })
    
    // Mock LLM to throw error
    const mockInvoke = vi.fn().mockRejectedValue(new Error('LLM failed'))
    vi.mocked(withFlexibleStructuredOutput).mockResolvedValue({ invoke: mockInvoke })
    
    const tool = new FindElementTool(executionContext)
    const result = await tool.execute({
      elementDescription: 'submit button'
    })
    
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Failed to find element: LLM failed')
  })
})

// Integration test
describe('FindElementTool-integration', () => {
  it.skipIf(!process.env.LITELLM_API_KEY || process.env.LITELLM_API_KEY === 'nokey')(
    'should find element using real LLM',
    async () => {
      // Setup with real dependencies
      const browserContext = new BrowserContext()
      const messageManager = new MessageManager()
      const eventBus = new EventBus()
      const eventProcessor = new EventProcessor(eventBus)
      
      const executionContext = new ExecutionContext({
        browserContext,
        messageManager,
        abortController: new AbortController(),
        debugMode: false,
        eventBus,
        eventProcessor
      })
      
      // Mock browser state with realistic elements
      vi.spyOn(browserContext, 'getBrowserState').mockResolvedValue({
        clickableElements: [
          { nodeId: 1, text: 'Home', tag: 'a' },
          { nodeId: 2, text: 'Submit', tag: 'button' },
          { nodeId: 3, text: 'Cancel', tag: 'button' }
        ],
        typeableElements: [
          { nodeId: 10, text: '', tag: 'input', attributes: { type: 'email', placeholder: 'Enter email' } }
        ],
        clickableElementsString: '[1] <C> <a> "Home"\n[2] <C> <button> "Submit"\n[3] <C> <button> "Cancel"',
        typeableElementsString: '[10] <T> <input> "" attr:"type=email placeholder=Enter email"',
        url: 'https://example.com',
        title: 'Test Page',
        screenshot: null
      })
      
      const tool = new FindElementTool(executionContext)
      
      // Test finding submit button
      const result = await tool.execute({
        elementDescription: 'submit button'
      })
      
      // Verify result
      expect(result.ok).toBe(true)
      expect(result.output).toBeDefined()
      expect(result.output.index).toBe(2)
      expect(result.output.tag).toBe('button')
      expect(result.output.text).toBe('Submit')
    },
    30000 // 30 second timeout for LLM call
  )
})