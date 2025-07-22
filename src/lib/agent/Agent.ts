import { BaseAgent } from "./BaseAgent";
import { AgentInput, AgentOutput } from "./IAgent";
import { StreamEventBus } from "@/lib/events";
import { ExecutionContext } from "@/lib/runtime/ExecutionContext";
import { NavigationTool } from "@/lib/tools/NavigationTool";
import { Logging } from "@/lib/utils/Logging";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

/**
 * Schema for LLM response when analyzing navigation requests
 */
const NavigationAnalysisSchema = z.object({
  shouldNavigate: z.boolean(),  // Whether the query requires navigation
  url: z.string().url().optional(),  // The URL to navigate to if needed
  reasoning: z.string(),  // Explanation of the decision
});

/**
 * Main agent that handles user queries and executes tasks
 */
export class Agent extends BaseAgent {
  name = "Agent";
  description = "Agent that handles web browsing and other tasks";
  
  private llm: BaseChatModel;
  private navigationTool: NavigationTool;
  
  constructor() {
    super();
    
    // Initialize the navigation tool
    this.navigationTool = new NavigationTool();
    
    // Initialize LLM (using Claude by default)
    // In a real implementation, this would come from configuration
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.LITELLM_API_KEY;
    if (!apiKey) {
      throw new Error("No API key found for LLM");
    }
    
    this.llm = new ChatAnthropic({
      apiKey,
      model: "claude-3-5-sonnet-20241022",
      temperature: 0,
    });
  }
  
  protected async executeAgent(
    input: AgentInput,
    executionContext: ExecutionContext,
    eventBus?: StreamEventBus,
    signal?: AbortSignal
  ): Promise<AgentOutput> {
    try {
      const { query } = input;
      
      // Send status update
      eventBus?.emit("agent.status", {
        agent: this.name,
        status: "Analyzing request...",
      });
      
      // Use LLM to analyze if the query requires navigation
      const analysis = await this.analyzeNavigationRequest(query);
      
      if (!analysis.shouldNavigate) {
        return {
          success: true,
          message: analysis.reasoning,
        };
      }
      
      if (!analysis.url) {
        return {
          success: false,
          error: "Navigation required but no URL provided",
        };
      }
      
      // Send status update
      eventBus?.emit("agent.status", {
        agent: this.name,
        status: `Navigating to ${analysis.url}...`,
      });
      
      // Execute navigation
      const result = await this.navigationTool.execute(
        { url: analysis.url, waitUntil: "load" },
        executionContext
      );
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }
      
      return {
        success: true,
        message: result.data?.message || "Navigation completed",
        data: result.data,
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
  
  /**
   * Use LLM to analyze if the query requires navigation and extract URL
   */
  private async analyzeNavigationRequest(query: string): Promise<z.infer<typeof NavigationAnalysisSchema>> {
    const systemPrompt = `You are a web browsing assistant. Analyze the user's request and determine if it requires navigating to a URL.

If the request mentions a specific website or URL, extract it and format it properly.
If the request is asking to go to a website but doesn't specify the exact URL, infer the most likely URL.
If the request doesn't require navigation, explain why.

Respond in JSON format with:
- shouldNavigate: boolean
- url: string (only if shouldNavigate is true)  
- reasoning: string (explanation of your decision)`;

    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(query),
    ];
    
    try {
      const response = await this.llm.invoke(messages);
      const content = response.content.toString();
      
      // Extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in LLM response");
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      return NavigationAnalysisSchema.parse(parsed);
      
    } catch (error) {
      Logging.log(this.name, `Failed to analyze navigation request: ${error}`, "error");
      
      // Fallback: try to extract URL from query directly
      const urlMatch = query.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        return {
          shouldNavigate: true,
          url: urlMatch[0],
          reasoning: "Found URL in query",
        };
      }
      
      return {
        shouldNavigate: false,
        reasoning: "Could not determine navigation requirement from query",
      };
    }
  }
}