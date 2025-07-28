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
import { generateSystemPrompt } from './BrowserAgent.prompt';
import { AIMessage, AIMessageChunk } from '@langchain/core/messages';
import { EventProcessor } from '@/lib/events/EventProcessor';

// Type Definitions
interface Plan {
  steps: PlanStep[];
}

interface PlanStep {
  action: string;
  reasoning: string;
}

interface ClassificationResult {
  is_simple_task: boolean;
}

export class BrowserAgent {
  // Constants for explicit control
  private static readonly MAX_SIMPLE_ATTEMPTS = 3;
  private static readonly MAX_TOTAL_STEPS = 20;
  private static readonly STEPS_PER_PLAN = 3;

  private readonly executionContext: ExecutionContext;
  private readonly toolManager: ToolManager;

  constructor(executionContext: ExecutionContext) {
    this.executionContext = executionContext;
    this.toolManager = new ToolManager(executionContext);
    this._registerTools();
  }

  // Getters to access context components (maintains original structure)
  private get messageManager(): MessageManager { 
    return this.executionContext.messageManager; 
  }
  
  private get events(): EventProcessor { 
    return this.executionContext.getEventProcessor(); 
  }

  /**
   * Main entry point.
   * Orchestrates classification and delegates to the appropriate execution strategy.
   */
  async execute(task: string): Promise<void> {
    try {
      // 1. SETUP: Initialize system prompt and user task
      this._initializeExecution(task);

      // 2. CLASSIFY: Determine the task type
      const classification = await this._classifyTask(task);
      this.events.taskClassified(classification.is_simple_task);

      // 3. DELEGATE: Route to the correct execution strategy
      if (classification.is_simple_task) {
        await this._executeSimpleTaskStrategy(task);
      } else {
        await this._executeMultiStepStrategy(task);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.events.error(errorMessage, true);  // Mark as fatal error
      throw error;
    }
  }

  private _initializeExecution(task: string): void {
    // Clear previous system prompts
    this.messageManager.removeSystemMessages();

    const systemPrompt = generateSystemPrompt(this.toolManager.getDescriptions());
    this.messageManager.addSystem(systemPrompt);
    this.messageManager.addHuman(task);
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

  private async _classifyTask(task: string): Promise<ClassificationResult> {
    this.events.analyzingTask();
    
    const classificationTool = this.toolManager.get('classification_tool');
    if (!classificationTool) {
      // Default to complex task if classification tool not found
      return { is_simple_task: false };
    }

    const args = { task };
    
    try {
      this.events.executingTool('classification_tool', args);
      const result = await classificationTool.func(args);
      const parsedResult = JSON.parse(result);
      
      if (parsedResult.ok) {
        const classification = JSON.parse(parsedResult.output);
        this.events.toolResult('classification_tool', true, 'Task analyzed');
        return { is_simple_task: classification.is_simple_task };
      }
    } catch (error) {
      this.events.toolResult('classification_tool', false, 'Classification failed');
    }
    
    // Default to complex task on any failure
    return { is_simple_task: false };
  }

  // ===================================================================
  //  Execution Strategy 1: Simple Tasks (No Planning)
  // ===================================================================
  private async _executeSimpleTaskStrategy(task: string): Promise<void> {
    this.events.info(`Executing as a simple task. Max attempts: ${BrowserAgent.MAX_SIMPLE_ATTEMPTS}`);

    for (let attempt = 1; attempt <= BrowserAgent.MAX_SIMPLE_ATTEMPTS; attempt++) {
      const instruction = `This is attempt ${attempt}/${BrowserAgent.MAX_SIMPLE_ATTEMPTS}. The user's goal is: "${task}". Please take the next best action to complete this goal and call the 'done_tool' when finished.`;
      this.events.executingStep(attempt, 'Attempting to complete task directly.');

      const isTaskCompleted = await this._executeSingleTurn(instruction);

      if (isTaskCompleted) {
        this.events.complete('Simple task completed successfully.');
        return;  // SUCCESS
      }
      
      if (attempt < BrowserAgent.MAX_SIMPLE_ATTEMPTS) {
        this.events.info(`Attempt ${attempt} did not complete the task. Retrying.`);
      }
    }

    throw new Error(`Simple task failed to complete after ${BrowserAgent.MAX_SIMPLE_ATTEMPTS} attempts.`);
  }

  // ===================================================================
  //  Execution Strategy 2: Multi-Step Tasks (Plan -> Execute -> Repeat)
  // ===================================================================
  private async _executeMultiStepStrategy(task: string): Promise<void> {
    this.events.info('Executing as a multi-step task.');
    let totalStepsExecuted = 0;

    while (totalStepsExecuted < BrowserAgent.MAX_TOTAL_STEPS) {
      // 1. PLAN: Create a new plan for the next few steps
      const plan = await this._createMultiStepPlan(task);
      if (plan.steps.length === 0) {
        throw new Error('Planning failed. Could not generate next steps.');
      }
      this.events.info(`Created new ${plan.steps.length}-step plan.`);

      // 2. EXECUTE: Execute the steps from the current plan
      for (const step of plan.steps) {
        if (totalStepsExecuted >= BrowserAgent.MAX_TOTAL_STEPS) break;  // Exit if we hit the global limit

        totalStepsExecuted++;
        this.events.executingStep(totalStepsExecuted, step.action);
        
        const isTaskCompleted = await this._executeSingleTurn(step.action);

        if (isTaskCompleted) {
          this.events.complete('Multi-step task completed successfully.');
          return;  // SUCCESS
        }
      }
      this.events.info('Current plan segment complete. Re-planning for next steps.');
    }

    throw new Error(`Task did not complete within the maximum of ${BrowserAgent.MAX_TOTAL_STEPS} steps.`);
  }

  // ===================================================================
  //  Shared Core & Helper Logic
  // ===================================================================
  /**
   * Executes a single "turn" with the LLM, including streaming and tool processing.
   * @returns {Promise<boolean>} - True if the `done_tool` was successfully called.
   */
  private async _executeSingleTurn(instruction: string): Promise<boolean> {
    this.messageManager.addHuman(instruction);
    
    // This method encapsulates the streaming logic
    const llmResponse = await this._invokeLLMWithStreaming();

    let wasDoneToolCalled = false;
    if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
      this.messageManager.addAI('');  // Add empty AI message when tools are called
      wasDoneToolCalled = await this._processToolCalls(llmResponse.tool_calls);
    } else if (llmResponse.content) {
      // If the AI responds with text, just add it to the history
      this.messageManager.addAI(llmResponse.content as string);
    }

    return wasDoneToolCalled;
  }

  private async _invokeLLMWithStreaming(): Promise<AIMessage> {
    const llm = await this.executionContext.getLLM();
    const llmWithTools = llm.bindTools(this.toolManager.getAll());
    
    this.events.startThinking();
    const stream = await llmWithTools.stream(this.messageManager.getMessages());
    
    let accumulatedChunk: AIMessageChunk | undefined;
    let accumulatedText = '';

    for await (const chunk of stream) {
      if (chunk.content && typeof chunk.content === 'string') {
        this.events.streamThought(chunk.content);
        accumulatedText += chunk.content;
      }
      accumulatedChunk = !accumulatedChunk ? chunk : accumulatedChunk.concat(chunk);
    }
    
    this.events.finishThinking(accumulatedText);
    
    if (!accumulatedChunk) return new AIMessage({ content: '' });
    
    // Convert the final chunk back to a standard AIMessage
    return new AIMessage({
      content: accumulatedChunk.content,
      tool_calls: accumulatedChunk.tool_calls,
    });
  }

  private async _processToolCalls(toolCalls: any[]): Promise<boolean> {
    let wasDoneToolCalled = false;
    for (const toolCall of toolCalls) {
      const { name: toolName, args, id: toolCallId } = toolCall;
      const tool = this.toolManager.get(toolName);
      
      if (!tool) {
        // Handle tool not found
        continue;
      }

      this.events.executingTool(toolName, args);
      const result = await tool.func(args);
      this.events.toolResult(toolName, JSON.parse(result).ok, `Called ${toolName}`);

      // Add the result back to the message history for context
      this.messageManager.addTool(result, toolCallId);

      if (toolName === 'done_tool' && JSON.parse(result).ok) {
        wasDoneToolCalled = true;
      }
    }
    return wasDoneToolCalled;
  }

  private async _createMultiStepPlan(task: string): Promise<Plan> {
    const plannerTool = this.toolManager.get('planner_tool')!;
    const args = {
      task: `Based on the history, continue with the main goal: ${task}`,
      max_steps: BrowserAgent.STEPS_PER_PLAN
    };

    this.events.executingTool('planner_tool', args);
    const result = await plannerTool.func(args);
    this.events.toolResult('planner_tool', JSON.parse(result).ok, 'Planning complete');

    // Add the planning action to the message history for full context
    this.messageManager.addAI('');  // Add empty AI message
    this.messageManager.addTool(result, 'planner_call');

    const parsedResult = JSON.parse(result);
    if (parsedResult.ok && parsedResult.plan?.steps) {
      return { steps: parsedResult.plan.steps };
    }
    return { steps: [] };  // Return an empty plan on failure
  }
}
