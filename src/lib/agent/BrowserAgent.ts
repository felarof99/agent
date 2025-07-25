import { ExecutionContext } from '@/lib/runtime/ExecutionContext';
import { MessageManager, MessageManagerReadOnly } from '@/lib/runtime/MessageManager';
import { ToolManager } from '@/lib/tools/ToolManager';
import { createPlannerTool } from '@/lib/tools/planning/PlannerTool';
import { createDoneTool } from '@/lib/tools/utils/DoneTool';
import { createNavigationTool } from '@/lib/tools/navigation/NavigationTool';
import { generateSystemPrompt, generateStepExecutionPrompt } from './BrowserAgent.prompt';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

const MAX_ITERATIONS = 20;
const NUM_STEPS_SHORT_PLAN = 3;

export class BrowserAgent {
  private executionContext: ExecutionContext;
  private messageManager: MessageManager;
  private toolManager: ToolManager;
  private currentPlan: any[] = [];
  private currentStepOfPlan: number = 0;  // NTN: Using this variable name as requested

  constructor(executionContext: ExecutionContext) {
    this.executionContext = executionContext;
    this.messageManager = executionContext.messageManager;
    this.toolManager = new ToolManager(executionContext);
    this._registerTools();
  }

  private _registerTools(): void {
    this.toolManager.register(createPlannerTool(this.executionContext));
    this.toolManager.register(createDoneTool());
    this.toolManager.register(createNavigationTool(this.executionContext));
  }

  // Simple getter to check if plan was created (for testing)
  getPlanSteps(): any[] {
    return this.currentPlan;
  }

  async execute(task: string): Promise<void> {
    // Initialize with system prompt
    const systemPrompt = generateSystemPrompt(this.toolManager.getDescriptions());
    this.messageManager.addSystem(systemPrompt);
    this.messageManager.addHuman(task);

    let taskComplete = false;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      // Create a new plan if needed
      if (this.currentPlan.length === 0) {
        await this._createNewPlan(task);
        if (this.currentPlan.length === 0) break;  // Failed to create plan
      }

      // Execute the next step
      const step = this.currentPlan.shift();
      if (!step) continue;
      
      this.currentStepOfPlan++;

      // Get AI response for this step
      let aiResponse: AIMessage;
      try {
        aiResponse = await this._executeStep(step);
      } catch (error) {
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
      this.messageManager.addAI('Max iterations reached');
    }
  }

  // Private helper methods
  private async _createNewPlan(task: string): Promise<void> {
    const plannerTool = this.toolManager.get('planner_tool')!;  // Always exists
    const args = { 
      task: `Based on the history, continue with the main goal: ${task}`,
      max_steps: NUM_STEPS_SHORT_PLAN
    };

    this._updateMessageManagerWithToolCall('planner_tool', args);
    const planResult = await plannerTool.func(args);
    this._updateMessageManagerWithToolResult('planner_tool', planResult, false);
    
    const parsedResult = JSON.parse(planResult);
    if (parsedResult.ok && parsedResult.plan) {
      this.currentPlan = parsedResult.plan.steps;
      this.currentStepOfPlan = 0;
    }
  }

  private async _processToolCalls(toolCalls: any[]): Promise<boolean> {
    for (const toolCall of toolCalls) {
      const { name: toolName, args, id: toolCallId } = toolCall;
      
      // Record tool call
      this._updateMessageManagerWithToolCall(toolName, args, toolCallId);
      
      // Execute the tool
      const tool = this.toolManager.get(toolName);
      if (!tool) {
        this._updateMessageManagerWithToolResult(toolName, { ok: false, error: `Tool ${toolName} not found` }, true, toolCallId);
        this.currentPlan = [];  // Trigger re-planning
        continue;
      }

      let result: any;
      try {
        const toolResult = await tool.func(args);
        result = typeof toolResult === 'string' ? JSON.parse(toolResult) : toolResult;
      } catch (error) {
        result = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }

      // Record result
      this._updateMessageManagerWithToolResult(toolName, result, !result.ok, toolCallId);

      // Check if done
      if (toolName === 'done' && result.ok) {
        return true;
      }

      // Check if we need to replan
      if (!result.ok || result.error?.includes('page changed')) {
        this.currentPlan = [];
      }
    }
    return false;
  }

  // Helper method to record tool call in message manager
  private _updateMessageManagerWithToolCall(toolName: string, args: any, toolCallId?: string): void {
    // Keep minimal logging - just tool name and key args
    const toolCallMessage = `Using ${toolName}`;
    this.messageManager.addAI(toolCallMessage);
  }

  // Helper method to record tool result in message manager
  private _updateMessageManagerWithToolResult(toolName: string, result: any, isError: boolean = false, toolCallId?: string): void {
    const resultString = typeof result === 'string' ? result : JSON.stringify(result);
    this.messageManager.addTool(resultString, toolCallId || `${toolName}_result`);
  }

  // Execute a single step from the plan using LLM with tool binding
  private async _executeStep(step: { action: string; reasoning: string }): Promise<AIMessage> {
    const llm = await this.executionContext.getLLM();
    const tools = this.toolManager.getAll();
    
    // Bind tools to LLM
    if (!llm.bindTools || typeof llm.bindTools !== 'function') {
      throw new Error('LLM does not support tool binding');
    }
    const llmWithTools = llm.bindTools(tools);
    
    // Execute step
    const messages = [
      new SystemMessage(generateStepExecutionPrompt()),
      new HumanMessage(`Step: ${step.action}`)
    ];
    
    return await llmWithTools.invoke(messages) as AIMessage;
  }

}
