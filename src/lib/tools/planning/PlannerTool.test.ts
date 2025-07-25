import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPlannerTool } from './PlannerTool';

describe('PlannerTool', () => {
  let mockExecutionContext: any;
  let mockMessageManager: any;
  let mockBrowserContext: any;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    
    // Setup mocks
    mockMessageManager = {
      getMessages: vi.fn().mockReturnValue([]),
      addSystemMessage: vi.fn(),
      addHumanMessage: vi.fn(),
      addAIMessage: vi.fn(),
    };

    mockBrowserContext = {
      getCurrentPage: vi.fn().mockReturnValue({
        url: vi.fn().mockResolvedValue('https://example.com'),
        title: vi.fn().mockResolvedValue('Example Page'),
      }),
      getBrowserStateString: vi.fn().mockResolvedValue('BROWSER STATE:\nCurrent tab: {id: 1, url: https://example.com, title: Example Page}'),
    };

    // Mock the LLM with withStructuredOutput method
    const mockLLM = {
      withStructuredOutput: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue({
          steps: [
            { action: 'Navigate to page', reasoning: 'Need to access the target page' },
            { action: 'Click button', reasoning: 'Submit the form' },
            { action: 'Verify result', reasoning: 'Ensure task completed' }
          ]
        })
      })
    };

    mockExecutionContext = {
      messageManager: mockMessageManager,
      browserContext: mockBrowserContext,
      getLLM: vi.fn().mockResolvedValue(mockLLM),
    };
  });

  it('should create a DynamicStructuredTool with correct properties', () => {
    // Test that the tool is created with correct name, description, and schema
    const tool = createPlannerTool(mockExecutionContext);
    
    expect(tool.name).toBe('planner_tool');
    expect(tool.description).toBe('Generate 3-5 upcoming steps for the task');
    expect(tool.schema).toBeDefined();
    expect(typeof tool.func).toBe('function');
  });

  it('should generate a valid plan with steps when given a task', async () => {
    // Test that the tool generates a plan with proper structure
    const tool = createPlannerTool(mockExecutionContext);
    const result = await tool.func({ task: 'Fill out a contact form', max_steps: 3 });
    const parsedResult = JSON.parse(result);
    
    expect(parsedResult.ok).toBe(true);
    expect(parsedResult.plan).toBeDefined();
    expect(parsedResult.plan.steps).toBeInstanceOf(Array);
    expect(parsedResult.plan.steps.length).toBeGreaterThan(0);
    expect(parsedResult.plan.steps.length).toBeLessThanOrEqual(5);
    
    // Each step should have action and reasoning
    parsedResult.plan.steps.forEach((step: any) => {
      expect(step).toHaveProperty('action');
      expect(step).toHaveProperty('reasoning');
      expect(typeof step.action).toBe('string');
      expect(typeof step.reasoning).toBe('string');
    });
  });

  it('should handle errors gracefully and return error result', async () => {
    // Test error handling when LLM fails
    mockExecutionContext.getLLM.mockRejectedValue(new Error('LLM connection failed'));
    
    const tool = createPlannerTool(mockExecutionContext);
    const result = await tool.func({ task: 'Test task', max_steps: 3 });
    const parsedResult = JSON.parse(result);
    
    expect(parsedResult.ok).toBe(false);
    expect(parsedResult.output).toContain('Planning failed');
    expect(parsedResult.output).toContain('LLM connection failed');
  });

  it('should use execution context resources correctly', async () => {
    // Test that the tool properly uses ExecutionContext to access LLM and browser state
    const tool = createPlannerTool(mockExecutionContext);
    await tool.func({ task: 'Navigate and interact', max_steps: 3 });
    
    // Should call getLLM to get language model
    expect(mockExecutionContext.getLLM).toHaveBeenCalledTimes(1);
    
    // Should access browser context to get browser state string
    expect(mockExecutionContext.browserContext.getBrowserStateString).toHaveBeenCalled();
    
    // Should access message manager for conversation history
    expect(mockExecutionContext.messageManager).toBeDefined();
  });
});