import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BrowserAgent } from './BrowserAgent';
import { ExecutionContext } from '@/lib/runtime/ExecutionContext';
import { MessageManager } from '@/lib/runtime/MessageManager';
import { BrowserContext } from '@/lib/browser/BrowserContext';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage } from '@langchain/core/messages';

// Mock dependencies
vi.mock('@/lib/runtime/ExecutionContext');
vi.mock('@/lib/runtime/MessageManager');
vi.mock('@/lib/browser/BrowserContext');
vi.mock('@langchain/core/language_models/chat_models');

describe('BrowserAgent Tool Calling', () => {
  let browserAgent: BrowserAgent;
  let mockExecutionContext: any;
  let mockMessageManager: any;
  let mockLLM: any;
  let mockBrowserContext: any;

  beforeEach(() => {
    // Setup mocks
    mockMessageManager = {
      addSystem: vi.fn(),
      addHuman: vi.fn(),
      addAI: vi.fn(),
      addTool: vi.fn(),
    } as any;

    mockLLM = {
      bindTools: vi.fn().mockReturnThis(),
      invoke: vi.fn(),
    };

    mockBrowserContext = {
      getBrowserStateString: vi.fn().mockResolvedValue('Browser state: current page'),
    };

    mockExecutionContext = {
      messageManager: mockMessageManager,
      browserContext: mockBrowserContext,
      getLLM: vi.fn().mockResolvedValue(mockLLM),
    } as any;

    browserAgent = new BrowserAgent(mockExecutionContext);
  });

  describe('Core Tool Calling Flow', () => {
    it('should use LLM tool binding instead of manual inference', async () => {
      // Arrange
      const mockToolCalls = [
        {
          name: 'navigation_tool',
          args: { url: 'https://google.com' },
          id: 'call_1',
        },
      ];

      const mockAIMessage = new AIMessage({
        content: 'Navigating to Google',
        tool_calls: mockToolCalls,
      });

      mockLLM.invoke.mockResolvedValueOnce(mockAIMessage);

      // Execute step with proper tool binding
      const step = { action: 'Navigate to google.com', reasoning: 'Start search' };
      
      const result = await browserAgent['_executeStep'](step);

      // Verify LLM.bindTools was called with available tools
      expect(mockLLM.bindTools).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ name: expect.any(String) })
      ]));

      // Verify LLM was invoked with proper messages
      expect(mockLLM.invoke).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ _getType: expect.any(Function) }), // SystemMessage
        expect.objectContaining({ _getType: expect.any(Function) })  // HumanMessage
      ]));

      // Verify response contains tool_calls
      expect(result).toBe(mockAIMessage);
      expect(result.tool_calls).toBe(mockToolCalls);
    });

    it('should properly track tool calls and results in MessageManager', async () => {
      // Test 1: Recording tool calls
      const toolCall = {
        name: 'navigation_tool',
        args: { url: 'https://example.com' },
      };

      browserAgent['_updateMessageManagerWithToolCall'](toolCall.name, toolCall.args, 'test_call_id');

      // Verify tool call was recorded
      expect(mockMessageManager.addAI).toHaveBeenCalledWith(
        expect.stringContaining('Calling tool: navigation_tool (test_call_id)')
      );

      // Test 2: Recording tool results (success)
      const toolResult = {
        ok: true,
        output: 'Successfully navigated to example.com',
      };

      browserAgent['_updateMessageManagerWithToolResult']('navigation_tool', toolResult, false, 'test_call_id');

      // Verify tool result was recorded
      expect(mockMessageManager.addTool).toHaveBeenCalledWith(
        JSON.stringify(toolResult),
        'test_call_id'
      );

      // Test 3: Recording tool errors
      const errorResult = {
        ok: false,
        error: 'Navigation failed',
      };

      browserAgent['_updateMessageManagerWithToolResult']('navigation_tool', errorResult, true, 'error_call_id');

      expect(mockMessageManager.addTool).toHaveBeenCalledWith(
        JSON.stringify(errorResult),
        'error_call_id'
      );
    });

    it('should handle complete plan execution with multiple tool calls', async () => {
      // Mock planner tool response
      const plannerResult = {
        ok: true,
        output: 'Created plan with 3 steps',
        plan: {
          steps: [
            { action: 'Navigate to google.com', reasoning: 'Start at Google homepage' },
            { action: 'Search for TypeScript docs', reasoning: 'Find official documentation' },
            { action: 'Complete task', reasoning: 'Documentation found' },
          ],
        },
      };

      // Mock tool manager
      const mockToolManager = browserAgent['toolManager'];
      vi.spyOn(mockToolManager, 'get').mockImplementation((toolName: string) => {
        if (toolName === 'planner_tool') {
          return {
            name: 'planner_tool',
            func: vi.fn().mockResolvedValue(JSON.stringify(plannerResult)),
          } as any;
        }
        if (toolName === 'done') {
          return {
            name: 'done',
            func: vi.fn().mockResolvedValue(JSON.stringify({ ok: true, output: 'Task completed' })),
          } as any;
        }
        if (toolName === 'navigation_tool') {
          return {
            name: 'navigation_tool',
            description: 'Navigate to a URL',
            func: vi.fn().mockResolvedValue(JSON.stringify({ ok: true, output: 'Navigated' })),
          } as any;
        }
        return null;
      });

      // Mock LLM responses for each step
      const toolCallResponses = [
        new AIMessage({
          content: 'Navigating to Google',
          tool_calls: [{ name: 'navigation_tool', args: { url: 'https://google.com' }, id: 'call_1' }],
        }),
        new AIMessage({
          content: 'Searching for TypeScript',
          tool_calls: [{ name: 'search', args: { query: 'TypeScript documentation' }, id: 'call_2' }],
        }),
        new AIMessage({
          content: 'Task complete',
          tool_calls: [{ name: 'done', args: { summary: 'Found TypeScript docs' }, id: 'call_3' }],
        }),
      ];

      let callCount = 0;
      mockLLM.invoke.mockImplementation(() => {
        return Promise.resolve(toolCallResponses[callCount++]);
      });

      // Execute the task - should complete without throwing
      await browserAgent.execute('Search for TypeScript documentation on Google');

      // Verify planner was called first
      expect(mockToolManager.get).toHaveBeenCalledWith('planner_tool');

      // Verify LLM was called with tool binding for each step
      expect(mockLLM.bindTools).toHaveBeenCalled();
      expect(mockLLM.invoke).toHaveBeenCalled();

      // Verify proper message tracking
      expect(mockMessageManager.addSystem).toHaveBeenCalled();
      expect(mockMessageManager.addHuman).toHaveBeenCalledWith('Search for TypeScript documentation on Google');
    });

  });
});