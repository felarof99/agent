import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { ExecutionContext } from "@/lib/runtime/ExecutionContext";

// NTN: Using ToolManager instead of ToolRegistry as requested
// NTN: Only adding necessary methods as requested, can expand later
export class ToolManager {
  private tools: Map<string, DynamicStructuredTool> = new Map();
  private executionContext?: ExecutionContext;

  constructor(executionContext?: ExecutionContext) {
    this.executionContext = executionContext;
  }

  register(tool: DynamicStructuredTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): DynamicStructuredTool | undefined {
    return this.tools.get(name);
  }

  getAll(): DynamicStructuredTool[] {
    return Array.from(this.tools.values());
  }

  getDescriptions(): string {
    const tools = this.getAll();
    if (tools.length === 0) {
      return "No tools available.";
    }

    const toolDescriptions = tools.map(tool => {
      return `- ${tool.name}: ${tool.description}`;
    }).join("\n");

    return `Available tools:\n${toolDescriptions}`;
  }

  _registerPlannerTool(): void {
    if (!this.executionContext) {
      throw new Error("ExecutionContext required for planner tool");
    }
    
    // Placeholder planner tool until actual implementation
    const plannerTool = new DynamicStructuredTool({
      name: "planner_tool",
      description: "Generate 3-5 upcoming steps for the task",
      schema: z.object({
        task: z.string(),
        max_steps: z.number().default(3)
      }),
      func: async () => {
        // Placeholder implementation
        return JSON.stringify({
          ok: true,
          plan: { steps: [] },
          output: "Planner tool placeholder"
        });
      }
    });
    
    this.register(plannerTool);
  }

  _registerDoneTool(): void {
    // Placeholder done tool until actual implementation
    const doneTool = new DynamicStructuredTool({
      name: "done",
      description: "Mark task as complete",
      schema: z.object({
        summary: z.string().optional()
      }),
      func: async (args) => {
        return JSON.stringify({
          ok: true,
          output: args.summary || "Task completed successfully"
        });
      }
    });
    
    this.register(doneTool);
  }
}