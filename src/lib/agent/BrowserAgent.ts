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
import { MessageManager, MessageType } from '@/lib/runtime/MessageManager';
import { ToolManager } from '@/lib/tools/ToolManager';
import { createPlannerTool } from '@/lib/tools/planning/PlannerTool';
import { createDoneTool } from '@/lib/tools/utils/DoneTool';
import { createNavigationTool } from '@/lib/tools/navigation/NavigationTool';
import { createFindElementTool } from '@/lib/tools/navigation/FindElementTool';
import { createInteractionTool } from '@/lib/tools/navigation/InteractionTool';
import { createScrollTool } from '@/lib/tools/navigation/ScrollTool';
import { createSearchTool } from '@/lib/tools/navigation/SearchTool';
import { createRefreshStateTool } from '@/lib/tools/navigation/RefreshStateTool';
import { createTabOperationsTool } from '@/lib/tools/tab/TabOperationsTool';
import { createGroupTabsTool } from '@/lib/tools/tab/GroupTabsTool';
import { createClassificationTool } from '@/lib/tools/classification/ClassificationTool';
import { createValidatorTool } from '@/lib/tools/validation/ValidatorTool';
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
    
    // Navigation tools
    this.toolManager.register(createNavigationTool(this.executionContext));
    this.toolManager.register(createFindElementTool(this.executionContext));
    this.toolManager.register(createInteractionTool(this.executionContext));
    this.toolManager.register(createScrollTool(this.executionContext));
    this.toolManager.register(createSearchTool(this.executionContext));
    this.toolManager.register(createRefreshStateTool(this.executionContext));
    
    // Tab tools
    this.toolManager.register(createTabOperationsTool(this.executionContext));
    this.toolManager.register(createGroupTabsTool(this.executionContext));
    
    // Validation tool
    this.toolManager.register(createValidatorTool(this.executionContext));
    
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
      
      // 3. VALIDATE: Check if task is complete after plan segment
      const validationResult = await this._validateTaskCompletion(task);
      if (validationResult.isComplete) {
        this.events.complete(`Task validated as complete: ${validationResult.reasoning}`);
        return;
      }
      
      // 4. CONTINUE: Add validation result to message manager for planner
      if (validationResult.suggestions.length > 0) {
        const validationMessage = `Validation result: ${validationResult.reasoning}\nSuggestions: ${validationResult.suggestions.join(', ')}`;
        this.messageManager.addAI(validationMessage);
        
        // Emit validation result to debug events
        this.events.debug(`Validation result: ${JSON.stringify(validationResult, null, 2)}`);
      }
      
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
    if (!llm.bindTools || typeof llm.bindTools !== 'function') {
      throw new Error('This LLM does not support tool binding');
    }

    const message_history = this.messageManager.getMessages();

    const llmWithTools = llm.bindTools(this.toolManager.getAll());
    const stream = await llmWithTools.stream(message_history);
    
    let accumulatedChunk: AIMessageChunk | undefined;
    let accumulatedText = '';

    this.events.startThinking();
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
      const parsedResult = JSON.parse(result);
      this.events.toolResult(toolName, parsedResult.ok, `Called ${toolName}`);

      // Special handling for refresh_browser_state tool, add the browser state to the message history
      if (toolName === 'refresh_browser_state' && parsedResult.ok) {
        // Remove previous browser state messages
        this.messageManager.removeMessagesByType(MessageType.BROWSER_STATE);
        this.messageManager.addBrowserState(parsedResult.output);
      }

      // Add the result back to the message history for context
      this.messageManager.addTool(result, toolCallId);

      if (toolName === 'done_tool' && parsedResult.ok) {
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

  private async _validateTaskCompletion(task: string): Promise<{
    isComplete: boolean;
    reasoning: string;
    suggestions: string[];
  }> {
    const validatorTool = this.toolManager.get('validator_tool');
    if (!validatorTool) {
      return {
        isComplete: true,
        reasoning: 'Validation skipped - tool not available',
        suggestions: []
      };
    }

    const args = { task };
    try {
      this.events.executingTool('validator_tool', args);
      const result = await validatorTool.func(args);
      const parsedResult = JSON.parse(result);
      this.events.toolResult('validator_tool', parsedResult.ok, 'Validation complete');
      
      if (parsedResult.ok) {
        // Parse the validation data from output
        const validationData = JSON.parse(parsedResult.output);
        return {
          isComplete: validationData.isComplete,
          reasoning: validationData.reasoning,
          suggestions: validationData.suggestions || []
        };
      }
    } catch (error) {
      this.events.toolResult('validator_tool', false, 'Validation failed');
    }
    
    return {
      isComplete: true,
      reasoning: 'Validation failed - continuing execution',
      suggestions: []
    };
  }
}
