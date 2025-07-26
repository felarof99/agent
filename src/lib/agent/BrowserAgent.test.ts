import { describe, it, expect, vi } from 'vitest'
import { BrowserAgent } from './BrowserAgent'
import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { MessageManager } from '@/lib/runtime/MessageManager'
import { BrowserContext } from '@/lib/browser/BrowserContext'
import { EventBus } from '@/lib/events'

describe('BrowserAgent', () => {
  it('should be created with required dependencies', () => {
    const messageManager = new MessageManager()
    const browserContext = new BrowserContext()
    const abortController = new AbortController()
    
    const eventBus = new EventBus()
    const executionContext = new ExecutionContext({
      browserContext,
      messageManager,
      abortController,
      debugMode: false,
      eventBus
    })
    
    const browserAgent = new BrowserAgent(executionContext)
    
    expect(browserAgent).toBeDefined()
    expect(browserAgent.getPlanSteps()).toEqual([])
  })

  it('should handle max iterations gracefully', async () => {
    const messageManager = new MessageManager()
    const browserContext = new BrowserContext()
    const abortController = new AbortController()
    
    const eventBus = new EventBus()
    const executionContext = new ExecutionContext({
      browserContext,
      messageManager,
      abortController,
      debugMode: false,
      eventBus
    })
    
    // Mock LLM that never calls done tool
    const mockLLM = {
      bindTools: vi.fn().mockReturnThis(),
      invoke: vi.fn().mockResolvedValue({
        content: 'Continuing work',
        tool_calls: []  // No done tool call
      })
    }
    executionContext.getLLM = vi.fn().mockResolvedValue(mockLLM)
    
    const browserAgent = new BrowserAgent(executionContext)
    
    // Execute should complete without error when max iterations reached
    await browserAgent.execute('Complex task')
    
    // Verify max iterations message was added
    const messages = messageManager.getMessages()
    expect(messages.some(m => m.content === 'Max iterations reached')).toBe(true)
  })

  it('should track tool calls and results in message manager', () => {
    const messageManager = new MessageManager()
    const browserContext = new BrowserContext()
    const abortController = new AbortController()
    
    const eventBus = new EventBus()
    const executionContext = new ExecutionContext({
      browserContext,
      messageManager,
      abortController,
      debugMode: false,
      eventBus
    })
    
    const browserAgent = new BrowserAgent(executionContext)
    
    // Access private method for testing
    const agent = browserAgent as any
    
    // Test recording tool call and result with the new combined method
    const toolResult = { ok: true, output: 'Successfully navigated' }
    agent._updateMessageManagerWithToolCall('navigation_tool', { url: 'https://example.com' }, toolResult, 'test_id')
    
    const messages = messageManager.getMessages()
    
    // Check that the combined message was added
    expect(messages.some(m => 
      m.content.includes('Called navigation_tool tool and got result:') && 
      m.content.includes(JSON.stringify(toolResult))
    )).toBe(true)
    
    // Check that the tool call id was set correctly
    expect(messages.some(m => m.tool_call_id === 'test_id')).toBe(true)
  })

})