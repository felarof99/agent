import { describe, it, expect, vi } from 'vitest'
import { RefreshStateTool } from './RefreshStateTool'
import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { MessageManager } from '@/lib/runtime/MessageManager'
import { BrowserContext } from '@/lib/browser/BrowserContext'
import { EventBus, EventProcessor } from '@/lib/events'

describe('RefreshStateTool', () => {
  // Unit Test 1: Tool creation
  it('tests that refresh state tool can be created with required dependencies', () => {
    const executionContext = new ExecutionContext({
      browserContext: new BrowserContext(),
      messageManager: new MessageManager(),
      abortController: new AbortController(),
      debugMode: false,
      eventBus: new EventBus(),
      eventProcessor: new EventProcessor(new EventBus())
    })
    
    const tool = new RefreshStateTool(executionContext)
    expect(tool).toBeDefined()
  })

  // Unit Test 2: Successful refresh
  it('tests that browser state refreshes successfully', async () => {
    const messageManager = new MessageManager()
    const browserContext = new BrowserContext()
    const executionContext = new ExecutionContext({
      browserContext,
      messageManager,
      abortController: new AbortController(),
      debugMode: false,
      eventBus: new EventBus(),
      eventProcessor: new EventProcessor(new EventBus())
    })
    
    // Mock current page
    const mockPage = {
      url: vi.fn().mockReturnValue('https://example.com')
    }
    vi.spyOn(browserContext, 'getCurrentPage').mockResolvedValue(mockPage as any)
    
    // Mock browser state
    const mockBrowserState = 'Current page: example.com\nClickable elements: [1] Submit'
    vi.spyOn(browserContext, 'getBrowserStateString').mockResolvedValue(mockBrowserState)
    
    // Spy on message manager methods
    const removeSpy = vi.spyOn(messageManager, 'removeBrowserStateMessages')
    const addSpy = vi.spyOn(messageManager, 'addBrowserStateMessage')
    
    const tool = new RefreshStateTool(executionContext)
    const result = await tool.execute({})
    
    expect(result.ok).toBe(true)
    expect(result.output.message).toContain('Browser state refreshed successfully')
    expect(result.output.url).toBe('https://example.com')
    expect(removeSpy).toHaveBeenCalled()
    expect(addSpy).toHaveBeenCalledWith(mockBrowserState)
  })

  // Unit Test 3: Handle no active page
  it('tests that no active page error is handled', async () => {
    const browserContext = new BrowserContext()
    const executionContext = new ExecutionContext({
      browserContext,
      messageManager: new MessageManager(),
      abortController: new AbortController(),
      debugMode: false,
      eventBus: new EventBus(),
      eventProcessor: new EventProcessor(new EventBus())
    })
    
    // Mock no current page
    vi.spyOn(browserContext, 'getCurrentPage').mockResolvedValue(null)
    
    const tool = new RefreshStateTool(executionContext)
    const result = await tool.execute({})
    
    expect(result.ok).toBe(false)
    expect(result.error).toBe('No active page to refresh state from')
  })

  // Unit Test 4: Count actions correctly
  it('tests that actions are counted since last refresh', async () => {
    const messageManager = new MessageManager()
    const browserContext = new BrowserContext()
    const executionContext = new ExecutionContext({
      browserContext,
      messageManager,
      abortController: new AbortController(),
      debugMode: false,
      eventBus: new EventBus(),
      eventProcessor: new EventProcessor(new EventBus())
    })
    
    // Add some tool messages to message manager
    messageManager.addToolMessage('tool1', 'result1')
    messageManager.addToolMessage('tool2', 'result2')
    messageManager.addToolMessage('tool3', 'result3')
    
    // Mock current page
    const mockPage = {
      url: vi.fn().mockReturnValue('https://example.com')
    }
    vi.spyOn(browserContext, 'getCurrentPage').mockResolvedValue(mockPage as any)
    vi.spyOn(browserContext, 'getBrowserStateString').mockResolvedValue('Browser state')
    
    const tool = new RefreshStateTool(executionContext)
    const result = await tool.execute({})
    
    expect(result.ok).toBe(true)
    expect(result.output.actionCount).toBe(3)
  })
})