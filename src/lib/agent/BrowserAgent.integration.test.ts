import { describe, it, expect } from 'vitest'
import { BrowserAgent } from './BrowserAgent'
import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { MessageManager } from '@/lib/runtime/MessageManager'
import { BrowserContext } from '@/lib/browser/BrowserContext'

/**
 * Simple integration test for BrowserAgent
 */
describe('BrowserAgent Integration Test', () => {
  it.skipIf(!process.env.LITELLM_API_KEY || process.env.LITELLM_API_KEY === 'nokey')(
    'should execute task with real LLM',
    async () => {
      // Setup
      const messageManager = new MessageManager()
      const browserContext = new BrowserContext()
      const abortController = new AbortController()
      
      const executionContext = new ExecutionContext({
        browserContext,
        messageManager,
        abortController,
        debugMode: false
      })
      
      const browserAgent = new BrowserAgent(executionContext)
      
      // Start execution
      browserAgent.execute('go to amazon and order toothpaste')
      
      // Wait for planner to be called
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      // Verify execution started correctly
      const messages = messageManager.getMessages()
      expect(messages.find(m => m._getType() === 'system')).toBeDefined()
      expect(messages.find(m => m._getType() === 'human')).toBeDefined()
      expect(messages.find(m => m._getType() === 'ai' && m.content?.includes('planner_tool'))).toBeDefined()
      
      console.log('✅ Test passed - BrowserAgent is working with real LLM')
      
      // Cleanup
      abortController.abort()
    },
    30000
  )
})
