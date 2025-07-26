import { ExecutionContext } from '@/lib/runtime/ExecutionContext';
import { MessageManager } from '@/lib/runtime/MessageManager';
import { ToolManager } from '@/lib/tools/ToolManager';
import { createPlannerTool } from '@/lib/tools/planning/PlannerTool';
import { createDoneTool } from '@/lib/tools/utils/DoneTool';
import { createNavigationTool } from '@/lib/tools/navigation/NavigationTool';
import { createTabOperationsTool } from '@/lib/tools/tab/TabOperationsTool';
import { createClassificationTool } from '@/lib/tools/classification/ClassificationTool';
import { generateSystemPrompt, generateStepExecutionPrompt } from './BrowserAgent.prompt';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

const MAX_ITERATIONS = 20;
const NUM_STEPS_SHORT_PLAN = 3;

export class BrowserAgent {
  private executionContext: ExecutionContext;
  private messageManager: MessageManager;
  private toolManager: ToolManager;
  private currentPlan: any[] = [];
  private currentStepOfPlan: number = 0;  // NTN: Using this variable name as requested
  private classificationResult: { is_simple_task: boolean; is_followup_task: boolean } | null = null;

  constructor(executionContext: ExecutionContext) {
    this.executionContext = executionContext;
    this.messageManager = executionContext.messageManager;
    this.toolManager = new ToolManager(executionContext);
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
  private async _classifyTask(task: string): Promise<void> {
    const classificationTool = this.toolManager.get('classification_tool');
    if (!classificationTool) {
      // If classification tool not found, assume complex task
      this.classificationResult = { is_simple_task: false, is_followup_task: false };
      return;
    }

    try {
      const args = { task };
      const result = await classificationTool.func(args);
      this._updateMessageManagerWithToolCall('classification_tool', args, result);
      
      const parsedResult = JSON.parse(result);
      if (parsedResult.ok) {
        const classification = JSON.parse(parsedResult.output);
        this.classificationResult = classification;
      } else {
        // If classification fails, assume complex task
        this.classificationResult = { is_simple_task: false, is_followup_task: false };
      }
    } catch (error) {
      // If any error occurs, assume complex task
      this.classificationResult = { is_simple_task: false, is_followup_task: false };
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
      this.messageManager.addAI('Classified as simple task - executing directly without planning');
      return;
    }

    // Complex task - use planner as normal
    const plannerTool = this.toolManager.get('planner_tool')!;  // Always exists
    const args = { 
      task: `Based on the history, continue with the main goal: ${task}`,
      max_steps: NUM_STEPS_SHORT_PLAN
    };

    const planResult = await plannerTool.func(args);
    this._updateMessageManagerWithToolCall('planner_tool', args, planResult);
    
    const parsedResult = JSON.parse(planResult);
    if (parsedResult.ok && parsedResult.plan) {
      this.currentPlan = parsedResult.plan.steps;
      this.currentStepOfPlan = 0;
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
        this._updateMessageManagerWithToolCall(toolName, args, result, toolCallId);
        this.currentPlan = [];  // Trigger re-planning
        continue;
      }

      try {
        const toolResult = await tool.func(args);
        result = typeof toolResult === 'string' ? JSON.parse(toolResult) : toolResult;
      } catch (error) {
        result = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }

      // Record tool call and result
      this._updateMessageManagerWithToolCall(toolName, args, result, toolCallId);

      // Check if done
      if (toolName === 'done_tool' && result.ok) {
        return true;
      }

      // Check if we need to replan
      if (!result.ok || result.error?.includes('page changed')) {
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
