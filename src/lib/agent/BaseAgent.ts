import { z } from "zod";
import { IAgent, AgentInput, AgentOutput } from "./IAgent";
import { StreamEventBus } from "@/lib/events";
import { ExecutionContext } from "@/lib/runtime/ExecutionContext";
import { Logging } from "@/lib/utils/Logging";

/**
 * Base abstract class for all agents
 * Provides common functionality and structure
 */
export abstract class BaseAgent implements IAgent {
  abstract name: string;
  abstract description: string;
  
  /**
   * Execute the agent's task
   * Wraps the concrete implementation with error handling and logging
   */
  async execute(
    input: AgentInput,
    executionContext: ExecutionContext,
    eventBus?: StreamEventBus,
    signal?: AbortSignal
  ): Promise<AgentOutput> {
    try {
      // Log agent start
      Logging.log(this.name, `Starting execution with query: ${input.query}`);
      
      // Send start event
      eventBus?.emit("agent.start", {
        agent: this.name,
        query: input.query,
      });
      
      // Check for abort
      if (signal?.aborted) {
        throw new Error("Execution aborted");
      }
      
      // Execute the concrete implementation
      const result = await this.executeAgent(input, executionContext, eventBus, signal);
      
      // Send completion event
      eventBus?.emit("agent.complete", {
        agent: this.name,
        success: result.success,
        message: result.message,
      });
      
      // Log completion
      Logging.log(this.name, `Execution completed: ${result.success ? "success" : "failed"}`);
      
      return result;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Send error event
      eventBus?.emit("agent.error", {
        agent: this.name,
        error: errorMessage,
      });
      
      // Log error
      Logging.log(this.name, `Execution error: ${errorMessage}`, "error");
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
  
  /**
   * Abstract method to be implemented by concrete agents
   * This is where the actual agent logic goes
   */
  protected abstract executeAgent(
    input: AgentInput,
    executionContext: ExecutionContext,
    eventBus?: StreamEventBus,
    signal?: AbortSignal
  ): Promise<AgentOutput>;
}