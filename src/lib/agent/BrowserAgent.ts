import { ExecutionContext } from '@/lib/runtime/ExecutionContext';
import { MessageManager, MessageManagerReadOnly } from '@/lib/runtime/MessageManager';
import { ToolManager } from '@/lib/tools/base/ToolManager';
import { createPlannerTool } from '@/lib/tools/planning/PlannerTool';
import { createDoneTool } from '@/lib/tools/utils/DoneTool';
import { createNavigationTool } from '@/lib/tools/navigation/NavigationTool';
import { generateSystemPrompt } from './BrowserAgent.prompt';
import { DynamicStructuredTool } from '@langchain/core/tools';

const MAX_ITERATIONS = 20;
const HORIZON = 3;

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
        const plannerTool = this.toolManager.get('planner');
        if (!plannerTool) {
          this.messageManager.addAI(`Error: Tool "planner" not found. Cannot continue.`);
          break;
        }

        const planResult = await plannerTool.func({ 
          task: `Based on the history, continue with the main goal: ${task}`,
          max_steps: HORIZON
        });
        
        const parsedResult = JSON.parse(planResult);
        if (parsedResult.ok && parsedResult.plan) {
          // Convert plan steps to executable format
          this.currentPlan = parsedResult.plan.steps.map((step: any) => ({
            tool: this._inferToolFromAction(step.action),
            args: this._inferArgsFromAction(step.action),
            reasoning: step.reasoning
          }));
          this.messageManager.addAI(`I have created a new ${parsedResult.plan.steps.length}-step plan.`);
        } else {
          this.messageManager.addAI(`Error: Failed to create plan. ${parsedResult.error || 'Unknown error'}`);
          break;
        }
      }

      // 2. EXECUTE: Execute the next step from the current plan
      const step = this.currentPlan.shift(); // Get and remove the first step
      if (!step) continue;

      const tool = this.toolManager.get(step.tool);
      if (!tool) {
        this.messageManager.addAI(`Error: Tool "${step.tool}" not found. Re-planning.`);
        this.currentPlan = []; // Clear plan to trigger re-planning
        continue;
      }

      // Execute the tool
      let result: {ok: boolean, output?: string, error?: string};
      try {
        const toolResult = await tool.func(step.args);
        result = typeof toolResult === 'string' ? JSON.parse(toolResult) : toolResult;
      } catch (error) {
        result = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }

      // Add tool message to conversation
      this.messageManager.addTool(
        JSON.stringify(result),
        `${step.tool}_${i}` // Simple tool call ID
      );

      // Add AI reasoning message
      this.messageManager.addAI(`Tool: ${step.tool}\nReasoning: ${step.reasoning}`);

      // Check if task is done
      if (step.tool === 'done' && result.ok) {
        console.log("Task complete.");
        taskComplete = true;
        break;
      }

      // Check if we need to replan due to error
      if (!result.ok || result.error?.includes('page changed')) {
        this.currentPlan = []; // Clear plan to trigger re-planning
      }
    }

    if (!taskComplete) {
      console.log("Task failed to complete within the maximum loops.");
      this.messageManager.addAI('Max iterations reached');
    }
  }


  // Helper method to infer tool name from action description
  private _inferToolFromAction(action: string): string {
    const actionLower = action.toLowerCase();
    
    if (actionLower.includes('navigate') || actionLower.includes('go to')) {
      return 'browser_navigation';
    } else if (actionLower.includes('search')) {
      return 'search';
    } else if (actionLower.includes('click') || actionLower.includes('select')) {
      return 'interact';
    } else if (actionLower.includes('extract') || actionLower.includes('get')) {
      return 'extract';
    } else if (actionLower.includes('done') || actionLower.includes('complete')) {
      return 'done';
    }
    
    // Default to browser_navigation if unclear
    return 'browser_navigation';
  }

  // Helper method to infer args from action description
  private _inferArgsFromAction(action: string): any {
    const actionLower = action.toLowerCase();
    
    // For navigation actions, extract URL if present
    if (actionLower.includes('navigate') || actionLower.includes('go to')) {
      // Try to extract URL from the action text
      const urlMatch = action.match(/(?:to|navigate to|go to)\s+(\S+)/i);
      if (urlMatch) {
        return {
          action: 'navigate',
          url: urlMatch[1]
        };
      }
      return {
        action: 'navigate',
        url: action // Fallback to full action as URL
      };
    }
    
    // For done actions
    if (actionLower.includes('done') || actionLower.includes('complete')) {
      return {
        summary: action
      };
    }
    
    // Default args for other tools
    return {
      intent: action
    };
  }
}