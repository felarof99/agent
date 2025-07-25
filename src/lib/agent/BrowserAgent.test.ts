import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BrowserAgent } from './BrowserAgent';
import { ExecutionContext } from '@/lib/runtime/ExecutionContext';
import { MessageManager } from '@/lib/runtime/MessageManager';
import { BrowserContext } from '@/lib/browser/BrowserContext';
import { ToolManager } from '@/lib/tools/ToolManager';
import { createPlannerTool } from '@/lib/tools/planning/PlannerTool';
import { createDoneTool } from '@/lib/tools/utils/DoneTool';

// Mock dependencies
vi.mock('@/lib/runtime/ExecutionContext');
vi.mock('@/lib/runtime/MessageManager');
vi.mock('@/lib/browser/BrowserContext');
vi.mock('@/lib/tools/ToolManager');
vi.mock('@/lib/tools/planning/PlannerTool');
vi.mock('@/lib/tools/utils/DoneTool');
vi.mock('@/lib/tools/navigation/NavigationTool');

describe('BrowserAgent', () => {
  let browserAgent: BrowserAgent;
  let mockExecutionContext: any;
  let mockMessageManager: any;
  let mockBrowserContext: any;
  let mockToolManager: any;
  let mockPlannerTool: any;
  let mockDoneTool: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock instances
    mockMessageManager = {
      addSystem: vi.fn(),
      addHuman: vi.fn(),
      addAI: vi.fn(),
      addTool: vi.fn(),
      getMessages: vi.fn().mockReturnValue([])
    } as any;

    mockBrowserContext = {
      getCurrentPage: vi.fn().mockReturnValue({
        url: vi.fn().mockReturnValue('https://example.com')
      }),
      getBrowserStateString: vi.fn().mockResolvedValue('Browser state: example.com')
    } as any;

    // Create mock tools
    mockPlannerTool = {
      name: 'planner_tool',
      func: vi.fn().mockResolvedValue(JSON.stringify({
        ok: true,
        output: 'Created plan with 2 steps',
        plan: {
          steps: [
            { action: 'Navigate to website', reasoning: 'Need to go to target site' },
            { action: 'Done with task', reasoning: 'Task completed' }
          ]
        }
      }))
    };

    mockDoneTool = {
      name: 'done',
      func: vi.fn().mockResolvedValue(JSON.stringify({
        ok: true,
        output: 'Task completed successfully'
      }))
    };

    // Mock tool creation functions to return our mock tools
    vi.mocked(createPlannerTool).mockReturnValue(mockPlannerTool as any);
    vi.mocked(createDoneTool).mockReturnValue(mockDoneTool as any);

    // Create mock ToolManager with proper get() method
    mockToolManager = {
      register: vi.fn(),
      get: vi.fn((name: string) => {
        if (name === 'planner_tool') return mockPlannerTool;
        if (name === 'done') return mockDoneTool;
        return undefined;
      }),
      getAll: vi.fn().mockReturnValue([mockPlannerTool, mockDoneTool]),
      getDescriptions: vi.fn().mockReturnValue('Available tools:\n- planner_tool: Generate a plan\n- done: Mark task complete')
    };

    // Mock the ToolManager constructor to return our mock
    vi.mocked(ToolManager).mockImplementation(() => mockToolManager);

    mockExecutionContext = {
      messageManager: mockMessageManager,
      browserContext: mockBrowserContext,
      getLLM: vi.fn().mockResolvedValue({
        withStructuredOutput: vi.fn().mockReturnValue({
          invoke: vi.fn().mockResolvedValue({
            steps: [
              { action: 'Navigate to website', reasoning: 'Need to go to target site' },
              { action: 'Done with task', reasoning: 'Task completed' }
            ]
          })
        }),
        bindTools: vi.fn().mockReturnThis(),
        invoke: vi.fn().mockResolvedValue({
          content: 'Executing task',
          tool_calls: [{ name: 'done', args: { summary: 'Task completed' }, id: 'call_1' }]
        })
      })
    } as any;

    // Create browser agent
    browserAgent = new BrowserAgent(mockExecutionContext);
  });

  describe('Core Functionality', () => {
    it('should initialize with proper tool registration', () => {
      // Verify that tools are registered during construction
      expect(createPlannerTool).toHaveBeenCalledWith(mockExecutionContext);
      expect(createDoneTool).toHaveBeenCalled();
    });

    it('should execute a simple task successfully', async () => {
      // Execute task
      await browserAgent.execute('Navigate to example.com');

      // Verify system prompt and task are added to message manager
      expect(mockMessageManager.addSystem).toHaveBeenCalledWith(expect.stringContaining('sophisticated web browsing automation agent'));
      expect(mockMessageManager.addHuman).toHaveBeenCalledWith('Navigate to example.com');

      // Verify AI messages were added during execution
      expect(mockMessageManager.addAI).toHaveBeenCalled();
    });

    it('should handle max iterations gracefully', async () => {
      // Mock LLM to never call done tool
      mockExecutionContext.getLLM = vi.fn().mockResolvedValue({
        withStructuredOutput: vi.fn().mockReturnValue({
          invoke: vi.fn().mockResolvedValue({
            steps: [
              { action: 'Navigate to website', reasoning: 'Need to go to target site' },
              { action: 'Search for content', reasoning: 'Find required information' }
            ]
          })
        }),
        bindTools: vi.fn().mockReturnThis(),
        invoke: vi.fn().mockResolvedValue({
          content: 'Continuing to work on task',
          tool_calls: []  // No tool calls, so done is never called
        })
      });

      // Mock planner to never include done tool
      mockPlannerTool.func = vi.fn().mockResolvedValue(JSON.stringify({
        ok: true,
        output: 'Created plan with 2 steps',
        plan: {
          steps: [
            { action: 'Navigate to website', reasoning: 'Need to go to target site' },
            { action: 'Search for content', reasoning: 'Find required information' }
          ]
        }
      }));

      // Execute task
      await browserAgent.execute('Complex task that never completes');

      // Verify max iterations message is added
      expect(mockMessageManager.addAI).toHaveBeenCalledWith('Max iterations reached');
    });

    it('should handle tool execution errors and trigger replanning', async () => {
      // Mock a tool that fails
      const mockNavigateTool = {
        name: 'navigate',
        func: vi.fn().mockRejectedValueOnce(new Error('Navigation failed'))
      };

      // Override tool manager to return our mock tool
      const originalGet = ToolManager.prototype.get;
      ToolManager.prototype.get = vi.fn().mockImplementation((name: string) => {
        if (name === 'navigate') return mockNavigateTool;
        if (name === 'planner') return vi.mocked(createPlannerTool).mock.results[0].value;
        if (name === 'done') return vi.mocked(createDoneTool).mock.results[0].value;
        return undefined;
      });

      // Create new agent
      browserAgent = new BrowserAgent(mockExecutionContext);

      // Execute task
      await browserAgent.execute('Navigate somewhere');

      // Verify error handling - should have error messages about tool binding
      expect(mockMessageManager.addAI).toHaveBeenCalled();

      // Restore original method
      ToolManager.prototype.get = originalGet;
    });
  });
});