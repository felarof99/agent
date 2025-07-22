import { z } from "zod";
import { StreamEventBus } from "@/lib/events";
import { ExecutionContext } from "@/lib/runtime/ExecutionContext";

/**
 * Agent input schema
 */
export const AgentInputSchema = z.object({
  query: z.string(),  // The user's query to process
  context: z.record(z.any()).optional(),  // Optional context data
});

export type AgentInput = z.infer<typeof AgentInputSchema>;

/**
 * Agent output schema
 */
export const AgentOutputSchema = z.object({
  success: z.boolean(),  // Whether the agent completed successfully
  message: z.string().optional(),  // Optional message to user
  data: z.any().optional(),  // Optional data returned by agent
  error: z.string().optional(),  // Error message if failed
});

export type AgentOutput = z.infer<typeof AgentOutputSchema>;

/**
 * Interface for all agents in the system
 */
export interface IAgent {
  name: string;  // Agent name for identification
  description: string;  // Agent description
  
  /**
   * Execute the agent's task
   * @param input - The agent input
   * @param executionContext - The execution context
   * @param eventBus - Event bus for streaming updates
   * @param signal - Abort signal for cancellation
   * @returns The agent output
   */
  execute(
    input: AgentInput,
    executionContext: ExecutionContext,
    eventBus?: StreamEventBus,
    signal?: AbortSignal
  ): Promise<AgentOutput>;
}