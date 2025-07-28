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
import { AIMessage, AIMessageChunk, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { EventProcessor } from '@/lib/events/EventProcessor';

const MAX_ITERATIONS = 20;
const NUM_STEPS_SHORT_PLAN = 3;
const DEFAULT_CLASSIFICATION_RESULT = { is_simple_task: false, is_followup_task: false };

interface ClassificationResult {
  is_simple_task: boolean;
  is_followup_task: boolean;
}

interface PlanStep {
  action: string;
  reasoning: string;
}

export class BrowserAgent {
  private executionContext: ExecutionContext;
  private messageManager: MessageManager;
  private toolManager: ToolManager;
  private currentPlan: any[] = [];
  private classificationResult: { is_simple_task: boolean; is_followup_task: boolean } | null = null;

  constructor(executionContext: ExecutionContext) {
    this.executionContext = executionContext;
    this.messageManager = executionContext.messageManager;
    this.toolManager = new ToolManager(executionContext);
    this._registerTools();
  }

  /**
   * Get EventProcessor from ExecutionContext when needed
   * This ensures we always use the correct EventProcessor instance
   */
  private get events(): EventProcessor {
    return this.executionContext.getEventProcessor();
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

      // Classify the task
      this.classificationResult = await this._classifyTask(task);
      this.events.taskClassified(this.classificationResult.is_simple_task);

      // Create appropriate plan generator based on task complexity
      const planGenerator = await this._createPlanGenerator(task);
      let was_done_tool_called = false;  // Set to true when done_tool is called
      let stepNumber = 0;

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        // Check if task is already complete before getting next step
        if (was_done_tool_called) break;
        
        const plan_generated = await planGenerator.next();
        
        // Extract generator result components
        // did_plan_generated_finish: true when generator has no more steps (e.g., planning failed)
        // next_step_of_plan: the actual PlanStep object with action and reasoning
        const did_plan_generated_finish = plan_generated.done;
        const next_step_of_plan = plan_generated.value;
        if (did_plan_generated_finish || !next_step_of_plan) break;
 
        // Execute the step and get AI response for the step
        this.messageManager.addSystem(generateStepExecutionPrompt());
        this.messageManager.addHuman(`Step: ${next_step_of_plan.action}`);

        let llm_response_for_step: AIMessage;
        try {
          stepNumber++;
          this.events.executingStep(stepNumber, next_step_of_plan.action);
          const messages = this.messageManager.getMessages();
          llm_response_for_step = await this._executeStep(next_step_of_plan, messages);
        } catch (error) {
          this.events.error(`Step execution failed: ${error instanceof Error ? error.message : String(error)}`);
          continue;
        }

        // Process any tool calls in the response
        if (llm_response_for_step.tool_calls && llm_response_for_step.tool_calls?.length > 0) {
          // If done tool is called, task is marked as complete.
          was_done_tool_called = await this._processToolCalls(llm_response_for_step.tool_calls);
        } else if (llm_response_for_step.content) {
          const content = JSON.stringify(llm_response_for_step.content);
          this.messageManager.addAI(content);
        }
      }

      if (!was_done_tool_called) {
        this.events.error('Max iterations reached without completing task');
        this.messageManager.addAI('Max iterations reached without completing the task');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.events.error(errorMessage, true);
      throw error;
    }
  }

  // Private helper methods
  private async _classifyTask(task: string): Promise<ClassificationResult> {
    this.events.analyzingTask();
    
    const classificationTool = this.toolManager.get('classification_tool');
    if (!classificationTool) {  // If classification tool not found, assume complex task
      return DEFAULT_CLASSIFICATION_RESULT;
    }

    const args = { task };
    let classification = DEFAULT_CLASSIFICATION_RESULT;
    let errorMessage = '';

    try {
      this.events.executingTool('classification_tool', args);
      const result = await classificationTool.func(args);
      this._updateMessageManagerWithToolCall('classification_tool', args, result);
      
      const parsedResult = JSON.parse(result);
      if (parsedResult.ok) {
        classification = JSON.parse(parsedResult.output);
        this.events.toolResult('classification_tool', true, 'Task analyzed');
      } else {
        errorMessage = parsedResult.error || 'Classification failed';
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Classification error';
    }

    if (errorMessage) {
      this.events.toolResult('classification_tool', false, errorMessage);
    }

    return classification;
  }

  private async _processToolCalls(toolCalls: any[]): Promise<boolean> {
    for (const toolCall of toolCalls) {
      const { name: toolName, args, id: toolCallId } = toolCall;
      
      // Get the tool
      const tool = this.toolManager.get(toolName);
      if (!tool) {
        const error = `Tool ${toolName} not found`;
        this.events.error(error);
        this._updateMessageManagerWithToolCall(toolName, args, JSON.stringify({ ok: false, error }), toolCallId);
        continue;
      }

      // Execute tool and handle result
      let result: string;
      try {
        this.events.executingTool(toolName, args);
        result = await tool.func(args);
      } catch (error) {
        result = JSON.stringify({ 
          ok: false, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }

      const parsedResult = JSON.parse(result);
      this.events.toolResult(toolName, parsedResult.ok, `Called ${toolName}`);
      this._updateMessageManagerWithToolCall(toolName, args, result, toolCallId);

      // Check for task completion
      if (toolName === 'done_tool' && parsedResult.ok) {
        this.events.complete('Task completed successfully');
        return true;
      }
    }
    return false;
  }

  // Helper method to record tool call and result in message manager
  private _updateMessageManagerWithToolCall(toolName: string, args: any, result: string, toolCallId?: string): void {
    const message = `Called ${toolName} tool and got result: ${result}`;
    this.messageManager.addTool(message, toolCallId || `${toolName}_result`);
  }

  // Generator methods
  private async _createPlanGenerator(task: string): Promise<AsyncGenerator<PlanStep>> {
    if (this.classificationResult?.is_simple_task) {
      // Simple task: infinite generator of the same step
      return this._simplePlanGenerator(task);
    } else {
      // Complex task: multi-step plan generator with re-planning
      return this._multiStepPlanGenerator(task);
    }
  }

  private async *_simplePlanGenerator(task: string): AsyncGenerator<PlanStep> {
    const step: PlanStep = {
      action: `${task} and then call done_tool to signal completion`,
      reasoning: "Direct execution of simple task with explicit completion"
    };
    
    // Yield the same step up to 5 times as a failsafe
    const MAX_SIMPLE_TASK_ATTEMPTS = 5;
    for (let i = 0; i < MAX_SIMPLE_TASK_ATTEMPTS; i++) {
      yield step;
    }

    // If we get here, the simple task failed to complete
    this.events.error('Simple task did not complete after maximum attempts');
  }

  private async *_multiStepPlanGenerator(task: string): AsyncGenerator<PlanStep> {
    while (true) {
      // Create multi-step plan
      const plan = await this._createMultiStepPlan(task);
      
      if (plan.length === 0) {
        this.events.error('Failed to create execution plan');
        return;  // End the generator
      }
      
      // Yield each step from the plan
      for (const step of plan) {
        yield step;
      }
      
      // After exhausting all steps, loop back to create a new plan
      this.events.info("Current plan completed, creating next set of steps");
    }
  }

  private async _createMultiStepPlan(task: string): Promise<PlanStep[]> {
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
        this.events.toolResult('planner_tool', true, `Created ${parsedResult.plan.steps.length}-step plan`);
        return parsedResult.plan.steps;
      } else {
        this.events.toolResult('planner_tool', false, parsedResult.error || 'Planning failed');
        this.events.error('Failed to create plan', false);
        return [];
      }
    } catch (error) {
      this.events.toolResult('planner_tool', false, error instanceof Error ? error.message : 'Planning error');
      this.events.error('Planning failed', false);
      return [];
    }
  }

  // Execute a single step from the plan using LLM with tool binding and streaming
  private async _executeStep(step: { action: string; reasoning: string }, messages: BaseMessage[]): Promise<AIMessage> {
    const llm = await this.executionContext.getLLM();
    const tools = this.toolManager.getAll();
    
    // Bind tools to LLM
    if (!llm.bindTools || typeof llm.bindTools !== 'function') {
      throw new Error('LLM does not support tool binding');
    }
    const llmWithTools = llm.bindTools(tools);
    
    // Start thinking event
    this.events.startThinking();
    
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
