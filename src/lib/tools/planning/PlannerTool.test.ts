import { describe, it, expect, vi } from 'vitest'
import { createPlannerTool } from './PlannerTool'
import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { MessageManager } from '@/lib/runtime/MessageManager'
import { BrowserContext } from '@/lib/browser/BrowserContext'

describe('PlannerTool', () => {
  it('should be created with required dependencies', () => {
    // Setup minimal execution context
    const messageManager = new MessageManager()
    const browserContext = new BrowserContext()
    const abortController = new AbortController()
    
    const executionContext = new ExecutionContext({
      browserContext,
      messageManager,
      abortController,
      debugMode: false
    })
    
    const tool = createPlannerTool(executionContext)
    
    expect(tool).toBeDefined()
    expect(tool.name).toBe('planner_tool')
    expect(tool.description).toBe('Generate upto to 3 steps for the task')
    expect(typeof tool.func).toBe('function')
  })

  it('should handle errors gracefully', async () => {
    // Create execution context with failing LLM
    const messageManager = new MessageManager()
    const browserContext = new BrowserContext()
    const abortController = new AbortController()
    
    const executionContext = new ExecutionContext({
      browserContext,
      messageManager,
      abortController,
      debugMode: false
    })
    
    // Override getLLM to throw error
    executionContext.getLLM = vi.fn().mockRejectedValue(new Error('LLM connection failed'))
    
    const tool = createPlannerTool(executionContext)
    const result = await tool.func({ task: 'Test task', max_steps: 3 })
    const parsedResult = JSON.parse(result)
    
    expect(parsedResult.ok).toBe(false)
    expect(parsedResult.output).toContain('Planning failed')
    expect(parsedResult.output).toContain('LLM connection failed')
  })

  it('should return structured plan response', async () => {
    // Test the response structure when LLM returns a plan
    const messageManager = new MessageManager()
    const browserContext = new BrowserContext()
    const abortController = new AbortController()
    
    const executionContext = new ExecutionContext({
      browserContext,
      messageManager,
      abortController,
      debugMode: false
    })
    
    // Mock LLM to return a structured plan
    const mockLLM = {
      withStructuredOutput: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue({
          steps: [
            { action: 'Navigate to page', reasoning: 'Need to access the target page' },
            { action: 'Click button', reasoning: 'Submit the form' }
          ]
        })
      })
    }
    executionContext.getLLM = vi.fn().mockResolvedValue(mockLLM)
    
    const tool = createPlannerTool(executionContext)
    const result = await tool.func({ task: 'Test task', max_steps: 3 })
    const parsedResult = JSON.parse(result)
    
    expect(parsedResult.ok).toBe(true)
    expect(parsedResult.output).toContain('Created plan with 2 steps')
    expect(parsedResult.plan).toBeDefined()
    expect(parsedResult.plan.steps).toHaveLength(2)
  })
})