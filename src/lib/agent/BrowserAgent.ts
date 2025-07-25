import { ExecutionContext } from '@/lib/runtime/ExecutionContext';
import { MessageManager, MessageManagerReadOnly } from '@/lib/runtime/MessageManager';
import { ToolManager } from '@/lib/tools/base/ToolManager';
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
    // Register planner tool
    this.toolManager.register(createPlannerTool(this.executionContext));
    
    // Register done tool
    this.toolManager.register(createDoneTool());
    
    // Register navigation tool - now it accepts ExecutionContext
    this.toolManager.register(createNavigationTool(this.executionContext));
    
    // Add other tools as needed in the future
  }

  async execute(task: string): Promise<void> {
    // Initialize with system prompt
    const systemPrompt = generateSystemPrompt(this.toolManager.getDescriptions());
    this.messageManager.addSystem(systemPrompt);
    this.messageManager.addHuman(task);

    let taskComplete = false;

    // NTN: Using for loop as requested, structure similar to nanobrowser reference
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      // 1. PLAN: If the current plan is empty, create a new one
      if (this.currentPlan.length === 0) {
        const plannerTool = this.toolManager.get('planner_tool');
        if (!plannerTool) {
          this.messageManager.addAI(`Error: Tool "planner_tool" not found. Cannot continue.`);
          break;
        }

        const planResult = await plannerTool.func({ 
          task: `Based on the history, continue with the main goal: ${task}`,
          max_steps: NUM_STEPS_SHORT_PLAN
        });
        
        const parsedResult = JSON.parse(planResult);
        if (parsedResult.ok && parsedResult.plan) {
          // Store plan steps directly - no need to infer tools anymore
          this.currentPlan = parsedResult.plan.steps;
          this.currentStepOfPlan = 0;
          this.messageManager.addAI(`I have created a new ${parsedResult.plan.steps.length}-step plan.`);
        } else {
          this.messageManager.addAI(`Error: Failed to create plan. ${parsedResult.error || 'Unknown error'}`);
          break;
        }
      }

      // 2. EXECUTE: Execute the next step from the current plan
      const step = this.currentPlan.shift(); // Get and remove the first step
      if (!step) continue;
      
      this.currentStepOfPlan++;

      // Execute step using LLM with tool binding
      let aiResponse: AIMessage;
      try {
        aiResponse = await this._executeStep(step);
      } catch (error) {
        this.messageManager.addAI(`Error executing step: ${error instanceof Error ? error.message : String(error)}`);
        this.currentPlan = []; // Clear plan to trigger re-planning
        continue;
      }

      // Process tool calls from the AI response
      if (aiResponse.tool_calls && Array.isArray(aiResponse.tool_calls) && aiResponse.tool_calls.length > 0) {
        for (const toolCall of aiResponse.tool_calls) {
          const { name: toolName, args, id: toolCallId } = toolCall;
          
          // Record tool call
          this._updateMessageManagerWithToolCall(toolName, args, toolCallId);
          
          // Get the tool
          const tool = this.toolManager.get(toolName);
          if (!tool) {
            this._updateMessageManagerWithToolResult(toolName, { ok: false, error: `Tool ${toolName} not found` }, true, toolCallId);
            this.currentPlan = []; // Clear plan to trigger re-planning
            continue;
          }

          // Execute the tool
          let result: any;
          try {
            const toolResult = await tool.func(args);
            result = typeof toolResult === 'string' ? JSON.parse(toolResult) : toolResult;
          } catch (error) {
            result = { ok: false, error: error instanceof Error ? error.message : String(error) };
          }

          // Record tool result
          this._updateMessageManagerWithToolResult(toolName, result, !result.ok, toolCallId);

          // Check if task is done
          if (toolName === 'done' && result.ok) {
            console.log("Task complete.");
            taskComplete = true;
            break;
          }

          // Check if we need to replan due to error
          if (!result.ok || result.error?.includes('page changed')) {
            this.currentPlan = []; // Clear plan to trigger re-planning
          }
        }
        
        if (taskComplete) break;
      } else {
        // No tool calls in response - log the content if any
        if (aiResponse.content) {
          // Handle both string and complex content
          const contentStr = typeof aiResponse.content === 'string' 
            ? aiResponse.content 
            : JSON.stringify(aiResponse.content);
          this.messageManager.addAI(contentStr);
        }
      }
    }

    if (!taskComplete) {
      console.log("Task failed to complete within the maximum loops.");
      this.messageManager.addAI('Max iterations reached');
    }
  }


  // Helper method to record tool call in message manager
  private _updateMessageManagerWithToolCall(toolName: string, args: any, toolCallId?: string): void {
    // Record tool invocation as AI message showing intent
    const toolCallMessage = `Calling tool: ${toolName}${toolCallId ? ` (${toolCallId})` : ''}\nArguments: ${JSON.stringify(args, null, 2)}`;
    this.messageManager.addAI(toolCallMessage);
  }

  // Helper method to record tool result in message manager
  private _updateMessageManagerWithToolResult(toolName: string, result: any, isError: boolean = false, toolCallId?: string): void {
    // Record tool result with appropriate formatting
    const resultString = typeof result === 'string' ? result : JSON.stringify(result);
    
    // Add as tool message for proper conversation tracking
    this.messageManager.addTool(resultString, toolCallId || `${toolName}_result`);
  }

  // Execute a single step from the plan using LLM with tool binding
  private async _executeStep(step: { action: string; reasoning: string }): Promise<AIMessage> {
    // Get LLM instance from execution context
    const llm = await this.executionContext.getLLM();
    
    // Get all available tools from tool manager
    const tools = this.toolManager.getAll();
    
    // Bind tools to LLM for tool calling
    // Check if bindTools method exists
    if (!llm.bindTools || typeof llm.bindTools !== 'function') {
      throw new Error('LLM does not support tool binding');
    }
    const llmWithTools = llm.bindTools(tools);
    
    // Build messages for this step execution
    const messages = [
      new SystemMessage(generateStepExecutionPrompt()),
      new HumanMessage(`Step: ${step.action}`)
    ];
    
    // Invoke LLM with bound tools
    const response = await llmWithTools.invoke(messages);
    
    // Log the raw AI response for debugging
    this.messageManager.addAI(`Step execution - Action: ${step.action}, Reasoning: ${step.reasoning}`);
    
    return response as AIMessage;
  }

}