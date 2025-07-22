import { z } from "zod";
import { ExecutionContext } from "@/lib/runtime/ExecutionContext";

/**
 * Base tool result schema
 */
export const ToolResultSchema = z.object({
  success: z.boolean(),  // Whether the tool executed successfully
  data: z.any().optional(),  // Tool-specific return data
  error: z.string().optional(),  // Error message if failed
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

/**
 * Interface for all tools in the system
 */
export interface ITool {
  name: string;  // Tool name for identification
  description: string;  // Tool description for LLM
  
  /**
   * The Zod schema for the tool's parameters
   */
  parametersSchema: z.ZodSchema<any>;
  
  /**
   * Execute the tool
   * @param parameters - The tool parameters (validated by schema)
   * @param context - The execution context
   * @returns The tool result
   */
  execute(parameters: any, context: ExecutionContext): Promise<ToolResult>;
}