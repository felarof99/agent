import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BrowserAgent } from './BrowserAgent';
import { ExecutionContext } from '@/lib/runtime/ExecutionContext';
import { MessageManager } from '@/lib/runtime/MessageManager';
import { BrowserContext } from '@/lib/browser/BrowserContext';
import { ToolManager } from '@/lib/tools/base/ToolManager';
import { createPlannerTool } from '@/lib/tools/planning/PlannerTool';
import { createDoneTool } from '@/lib/tools/utils/DoneTool';

// Mock dependencies
vi.mock('@/lib/runtime/ExecutionContext');
vi.mock('@/lib/runtime/MessageManager');
vi.mock('@/lib/browser/BrowserContext');
vi.mock('@/lib/tools/base/ToolManager');
vi.mock('@/lib/tools/planning/PlannerTool');
vi.mock('@/lib/tools/utils/DoneTool');
vi.mock('@/lib/tools/navigation/NavigationTool');

describe('BrowserAgent', () => {
  let browserAgent: BrowserAgent;
  let mockExecutionContext: any;
  let mockMessageManager: any;
  let mockBrowserContext: any;
  let mockToolManager: any;

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

    // Mock tool creation functions
    vi.mocked(createPlannerTool).mockReturnValue({
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
    } as any);

    vi.mocked(createDoneTool).mockReturnValue({
      name: 'done',
      func: vi.fn().mockResolvedValue(JSON.stringify({
        ok: true,
        output: 'Task completed successfully'
      }))
    } as any);

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
      // Mock planner to never include done tool
      vi.mocked(createPlannerTool).mockReturnValue({
        name: 'planner_tool',
        func: vi.fn().mockResolvedValue(JSON.stringify({
          ok: true,
          output: 'Created plan with 3 steps',
          plan: {
            steps: [
              { action: 'Navigate to website', reasoning: 'Need to go to target site' },
              { action: 'Search for content', reasoning: 'Find required information' },
              { action: 'Extract data', reasoning: 'Get the data' }
            ]
          }
        }))
      } as any);

      // Create new agent with mocked tools
      browserAgent = new BrowserAgent(mockExecutionContext);

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