import { describe, it, expect } from 'vitest'
import { createPlannerTool } from './PlannerTool'
import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { MessageManager } from '@/lib/runtime/MessageManager'
import { BrowserContext } from '@/lib/browser/BrowserContext'
import { EventBus } from '@/lib/events'

/**
 * Simple integration test for PlannerTool
 */
describe('PlannerTool Integration Test', () => {
  it.skipIf(!process.env.LITELLM_API_KEY || process.env.LITELLM_API_KEY === 'nokey')(
    'should generate plan with real LLM',
    async () => {
      // Setup
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
      
      const plannerTool = createPlannerTool(executionContext)
      
      // Execute planner
      const result = await plannerTool.func({
        task: 'go to amazon and order toothpaste',
        max_steps: 3
      })
      
      // Verify plan was created
      const parsed = JSON.parse(result)
      expect(parsed.ok).toBe(true)
      expect(parsed.plan).toBeDefined()
      expect(parsed.plan.steps).toBeDefined()
      expect(Array.isArray(parsed.plan.steps)).toBe(true)
      expect(parsed.plan.steps.length).toBeGreaterThan(0)
      expect(parsed.plan.steps.length).toBeLessThanOrEqual(3)
      
      console.log('✅ Test passed - PlannerTool is working with real LLM')
    },
    30000
  )
})