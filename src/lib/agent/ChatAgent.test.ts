import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChatAgent } from './ChatAgent'
import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { MessageManager, MessageType } from '@/lib/runtime/MessageManager'
import { BrowserContext } from '@/lib/browser/BrowserContext'
import { PubSub } from '@/lib/pubsub'

describe('ChatAgent', () => {
  let executionContext: ExecutionContext
  let messageManager: MessageManager
  let browserContext: BrowserContext
  let chatAgent: ChatAgent

  beforeEach(() => {
    // Create mock instances
    messageManager = new MessageManager()
    browserContext = {} as BrowserContext
    const pubsub = new PubSub()
    
    // Create execution context with mocks
    executionContext = {
      messageManager,
      browserContext,
      getPubSub: () => pubsub,
      getSelectedTabIds: () => [1],
      getCurrentTask: () => 'test task',
      getLLM: vi.fn(),
      abortController: new AbortController()
    } as any
    
    // Create ChatAgent instance
    chatAgent = new ChatAgent(executionContext)
  })

  it('tests that ChatAgent can be created with required dependencies', () => {
    expect(chatAgent).toBeDefined()
    expect(chatAgent).toBeInstanceOf(ChatAgent)
  })

  it('tests that fresh conversation is detected correctly', () => {
    // Initially message manager is empty
    const isFresh = (chatAgent as any)._isFreshConversation()
    expect(isFresh).toBe(true)
    
    // Add a message
    messageManager.addSystem('test')
    const isNotFresh = (chatAgent as any)._isFreshConversation()
    expect(isNotFresh).toBe(false)
  })

  it('tests that tab changes are detected correctly', () => {
    const chatAgentWithPrivate = chatAgent as any
    
    // First time should return true (no previous tabs)
    const tabIds1 = new Set([1, 2, 3])
    expect(chatAgentWithPrivate._hasTabsChanged(tabIds1)).toBe(true)
    
    // Set the last extracted tabs
    chatAgentWithPrivate.lastExtractedTabIds = new Set([1, 2, 3])
    
    // Same tabs should return false
    const tabIds2 = new Set([1, 2, 3])
    expect(chatAgentWithPrivate._hasTabsChanged(tabIds2)).toBe(false)
    
    // Different tabs should return true
    const tabIds3 = new Set([1, 2, 4])
    expect(chatAgentWithPrivate._hasTabsChanged(tabIds3)).toBe(true)
    
    // Different size should return true
    const tabIds4 = new Set([1, 2])
    expect(chatAgentWithPrivate._hasTabsChanged(tabIds4)).toBe(true)
  })
  
  it('tests that browser state messages are replaced correctly', () => {
    // Add initial browser state
    messageManager.addBrowserState('First page content')
    let messages = messageManager.getMessages()
    expect(messages.some(m => m.content?.includes('<BrowserState>First page content</BrowserState>'))).toBe(true)
    
    // Replace browser state (addBrowserState automatically replaces)
    messageManager.addBrowserState('Second page content')
    messages = messageManager.getMessages()
    
    // Should only have the new browser state, not both
    expect(messages.some(m => m.content?.includes('<BrowserState>Second page content</BrowserState>'))).toBe(true)
    expect(messages.some(m => m.content?.includes('First page content'))).toBe(false)
    
    // Should only have one browser state message
    const browserStateCount = messages.filter(m => 
      m.content?.includes('<BrowserState>') && m.content?.includes('</BrowserState>')
    ).length
    expect(browserStateCount).toBe(1)
  })
})