/**
 * BrowserAgent - Unified agent that handles all browser automation tasks
 * 
 * ## Streaming Architecture
 * 
 * Currently, BrowserAgent uses llm.invoke() which waits for the entire response before returning. 
 * With streaming:
 * - Users see the AI "thinking" in real-time
 * - Tool calls appear as they're being decided
 * - No long waits with blank screens
 * 
 * ### How Streaming Works in LangChain
 * 
 * Current approach (blocking):
 * ```
 * const response = await llm.invoke(messages);  // Waits for complete response
 * ```
 * 
 * Streaming approach:
 * ```
 * const stream = await llm.stream(messages);    // Returns immediately
 * for await (const chunk of stream) {
 *   // Process each chunk as it arrives
 * }
 * ```
 * 
 * ### Stream Chunk Structure
 * 
 * Each chunk contains:
 * ```
 * {
 *   content: string,           // Text content (may be empty)
 *   tool_calls: [],           // Tool calls being formed
 *   tool_call_chunks: []      // Progressive tool call building
 * }
 * ```
 * 
 * Tool calls build progressively in the stream:
 * - Chunk 1: { tool_call_chunks: [{ name: 'navigation_tool', args: '', id: 'call_123' }] }
 * - Chunk 2: { tool_call_chunks: [{ name: 'navigation_tool', args: '{"url":', id: 'call_123' }] }
 * - Chunk 3: { tool_call_chunks: [{ name: 'navigation_tool', args: '{"url": "https://example.com"}', id: 'call_123' }] }
 */

import { ExecutionContext } from '@/lib/runtime/ExecutionContext';
import { MessageManager } from '@/lib/runtime/MessageManager';
import { ToolManager } from '@/lib/tools/ToolManager';
import { createPlannerTool } from '@/lib/tools/planning/PlannerTool';
import { createDoneTool } from '@/lib/tools/utils/DoneTool';
import { createNavigationTool } from '@/lib/tools/navigation/NavigationTool';
import { createTabOperationsTool } from '@/lib/tools/tab/TabOperationsTool';
import { createClassificationTool } from '@/lib/tools/classification/ClassificationTool';
import { generateSystemPrompt, generateStepExecutionPrompt } from './BrowserAgent.prompt';
import { AIMessage, AIMessageChunk, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { EventProcessor } from '@/lib/events/EventProcessor';

const MAX_ITERATIONS = 20;
const NUM_STEPS_SHORT_PLAN = 3;

export class BrowserAgent {
  private executionContext: ExecutionContext;
  private messageManager: MessageManager;
  private toolManager: ToolManager;
  private events: EventProcessor;
  private currentPlan: any[] = [];
  private currentStepOfPlan: number = 0;  // NTN: Using this variable name as requested
  private classificationResult: { is_simple_task: boolean; is_followup_task: boolean } | null = null;

  constructor(executionContext: ExecutionContext) {
    this.executionContext = executionContext;
    this.messageManager = executionContext.messageManager;
    this.toolManager = new ToolManager(executionContext);
    this.events = new EventProcessor(executionContext.getEventBus());
    this._registerTools();
  }

  private _registerTools(): void {
    // Register all tools first
    this.toolManager.register(createPlannerTool(this.executionContext));
    this.toolManager.register(createDoneTool());
    this.toolManager.register(createNavigationTool(this.executionContext));
    this.toolManager.register(createTabOperationsTool(this.executionContext));
    
    // Register classification tool last with all tool descriptions
    const toolDescriptions = this.toolManager.getDescriptions();
    this.toolManager.register(createClassificationTool(this.executionContext, toolDescriptions));
  }

  // Simple getter to check if plan was created (for testing)
  getPlanSteps(): any[] {
    return this.currentPlan;
  }

  async execute(task: string): Promise<void> {

    try {
      // Initialize with system prompt
      const systemPrompt = generateSystemPrompt(this.toolManager.getDescriptions());
      this.messageManager.addSystem(systemPrompt);
      this.messageManager.addHuman(task);

      // Classify the task first
      await this._classifyTask(task);

      let taskComplete = false;

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        // Create a new plan if needed
        if (this.currentPlan.length === 0) {
          await this._createNewPlan(task);
          if (this.currentPlan.length === 0) {
            this.events.error('Failed to create execution plan', true);
            break;
          }
        }

        // Execute the next step
        const step = this.currentPlan.shift();
        if (!step) continue;
        
        this.currentStepOfPlan++;
        this.events.executingStep(this.currentStepOfPlan, step.action);

        // Get AI response for this step
        let aiResponse: AIMessage;
        try {
          aiResponse = await this._executeStep(step);
        } catch (error) {
          this.events.error(`Step execution failed: ${error instanceof Error ? error.message : String(error)}`);
          this.currentPlan = [];  // Trigger re-planning
          continue;
        }

        // Process any tool calls in the response
        if (aiResponse.tool_calls && aiResponse.tool_calls?.length > 0) {
          taskComplete = await this._processToolCalls(aiResponse.tool_calls);
          if (taskComplete) break;
        } else if (aiResponse.content) {
          // Log AI content if no tools were called
          const content = typeof aiResponse.content === 'string' 
            ? aiResponse.content 
            : JSON.stringify(aiResponse.content);
          this.messageManager.addAI(content);
        }
      }

      if (!taskComplete) {
        this.events.error('Max iterations reached without completing task');
        this.messageManager.addAI('Max iterations reached');
      }
    } catch (error) {
      // Handle any unhandled errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.events.error(errorMessage, true);
      throw error;
    }
  }

  // Private helper methods
  private async _classifyTask(task: string): Promise<void> {
    this.events.analyzingTask();
    
    const classificationTool = this.toolManager.get('classification_tool');
    if (!classificationTool) {
      // If classification tool not found, assume complex task
      this.classificationResult = { is_simple_task: false, is_followup_task: false };
      this.events.taskClassified(false);
      return;
    }

    try {
      this.events.executingTool('classification_tool', { task });
      const args = { task };
      const result = await classificationTool.func(args);
      this._updateMessageManagerWithToolCall('classification_tool', args, result);
      
      const parsedResult = JSON.parse(result);
      if (parsedResult.ok) {
        const classification = JSON.parse(parsedResult.output);
        this.classificationResult = classification;
        this.events.toolResult('classification_tool', true, 'Task analyzed');
        this.events.taskClassified(classification.is_simple_task);
      } else {
        // If classification fails, assume complex task
        this.classificationResult = { is_simple_task: false, is_followup_task: false };
        this.events.toolResult('classification_tool', false, parsedResult.error || 'Classification failed');
        this.events.taskClassified(false);
      }
    } catch (error) {
      // If any error occurs, assume complex task
      this.classificationResult = { is_simple_task: false, is_followup_task: false };
      this.events.toolResult('classification_tool', false, error instanceof Error ? error.message : 'Classification error');
      this.events.taskClassified(false);
    }
  }

  private async _createNewPlan(task: string): Promise<void> {
    // Check if it's a simple task
    if (this.classificationResult?.is_simple_task) {
      // Create a direct execution plan for simple tasks
      this.currentPlan = [{
        action: `Execute task directly: ${task}`,
        reasoning: `This is a simple task that can be executed directly without planning`
      }];
      this.currentStepOfPlan = 0;
      
      // Log that we're skipping planning
      this.events.progress('Simple task - executing directly without planning');
      this.messageManager.addAI('Classified as simple task - executing directly without planning');
      return;
    }

    // Complex task - use planner as normal
    this.events.planningSteps(NUM_STEPS_SHORT_PLAN);
    
    const plannerTool = this.toolManager.get('planner_tool')!;  // Always exists
    const args = { 
      task: `Based on the history, continue with the main goal: ${task}`,
      max_steps: NUM_STEPS_SHORT_PLAN
    };

    try {
      this.events.executingTool('planner_tool', args);
      const planResult = await plannerTool.func(args);
      this._updateMessageManagerWithToolCall('planner_tool', args, planResult);
      
      const parsedResult = JSON.parse(planResult);
      if (parsedResult.ok && parsedResult.plan) {
        this.currentPlan = parsedResult.plan.steps;
        this.currentStepOfPlan = 0;
        this.events.toolResult('planner_tool', true, `Created ${this.currentPlan.length}-step plan`);
      } else {
        this.events.toolResult('planner_tool', false, parsedResult.error || 'Planning failed');
        this.events.error('Failed to create plan', false);
      }
    } catch (error) {
      this.events.toolResult('planner_tool', false, error instanceof Error ? error.message : 'Planning error');
      this.events.error('Planning failed', false);
    }
  }

  private async _processToolCalls(toolCalls: any[]): Promise<boolean> {
    for (const toolCall of toolCalls) {
      const { name: toolName, args, id: toolCallId } = toolCall;
      
      // Execute the tool
      const tool = this.toolManager.get(toolName);
      let result: any;
      
      if (!tool) {
        result = { ok: false, error: `Tool ${toolName} not found` };
        this.events.error(`Tool ${toolName} not found`);
        this._updateMessageManagerWithToolCall(toolName, args, result, toolCallId);
        this.currentPlan = [];  // Trigger re-planning
        continue;
      }

      // Emit tool execution start (except for classification and planner which are already handled)
      if (toolName !== 'classification_tool' && toolName !== 'planner_tool') {
        this.events.executingTool(toolName, args);
      }

      try {
        const toolResult = await tool.func(args);
        result = typeof toolResult === 'string' ? JSON.parse(toolResult) : toolResult;
        
        // Emit tool success (except for classification and planner)
        if (toolName !== 'classification_tool' && toolName !== 'planner_tool') {
          const summary = toolName === 'done_tool' ? 'Task marked as complete' : undefined;
          this.events.toolResult(toolName, result.ok, summary || result.message);
        }
      } catch (error) {
        result = { ok: false, error: error instanceof Error ? error.message : String(error) };
        
        // Emit tool failure
        if (toolName !== 'classification_tool' && toolName !== 'planner_tool') {
          this.events.toolResult(toolName, false, result.error);
        }
      }

      // Record tool call and result
      this._updateMessageManagerWithToolCall(toolName, args, result, toolCallId);

      // Check if done
      if (toolName === 'done_tool' && result.ok) {
        this.events.complete('Task completed successfully');
        return true;
      }

      // Check if we need to replan
      if (!result.ok || result.error?.includes('page changed')) {
        this.events.progress('Replanning due to: ' + (result.error || 'execution failure'));
        this.currentPlan = [];
      }
    }
    return false;
  }

  // Helper method to record tool call and result in message manager
  private _updateMessageManagerWithToolCall(toolName: string, args: any, result: any, toolCallId?: string): void {
    const resultString = typeof result === 'string' ? result : JSON.stringify(result);
    const message = `Called ${toolName} tool and got result: ${resultString}`;
    this.messageManager.addTool(message, toolCallId || `${toolName}_result`);
  }

  // Execute a single step from the plan using LLM with tool binding and streaming
  private async _executeStep(step: { action: string; reasoning: string }): Promise<AIMessage> {
    const llm = await this.executionContext.getLLM();
    const tools = this.toolManager.getAll();
    
    // Bind tools to LLM
    if (!llm.bindTools || typeof llm.bindTools !== 'function') {
      throw new Error('LLM does not support tool binding');
    }
    const llmWithTools = llm.bindTools(tools);
    
    // Start thinking event
    this.events.startThinking();
    
    // Create messages for this step
    const messages = [
      new SystemMessage(generateStepExecutionPrompt()),
      new HumanMessage(`Step: ${step.action}`)
    ];
    
    // Stream the response - see top of file for streaming documentation
    const stream = await llmWithTools.stream(messages);
    
    let accumulatedTextContent = '';
    let accumulatedChunks: AIMessageChunk | undefined;
  
    for await (const chunk of stream) {
      // Chunk.content is the text content of the chunk, accumulate this so we can add 
      // final text content to message manager.
      if (chunk.content && typeof chunk.content === 'string') {
        this.events.streamThought(chunk.content);
        accumulatedTextContent += chunk.content;
      }
      
      // Use concat to accumulate chunks, this is required to return 
      // the final return value of the _executeStep method.
      if (!accumulatedChunks) {
        accumulatedChunks = chunk;
      } else {
        accumulatedChunks = accumulatedChunks.concat(chunk);
      }
    }
    
    // Finish thinking event
    this.events.finishThinking(accumulatedTextContent);
    
    // Update message manager with accumulated text content if any
    if (accumulatedTextContent) {
      this.messageManager.addAI(accumulatedTextContent);
    }
    
    // Return the final accumulated message
    if (!accumulatedChunks) {
      return new AIMessage('');
    }
    
    // Convert AIMessageChunk to AIMessage for return
    return new AIMessage({
      content: accumulatedChunks.content,
      tool_calls: accumulatedChunks.tool_calls,
      additional_kwargs: accumulatedChunks.additional_kwargs
    });
  }

}
