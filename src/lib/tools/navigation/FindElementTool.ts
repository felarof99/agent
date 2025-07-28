import { z } from "zod"
import { DynamicStructuredTool } from "@langchain/core/tools"
import { ExecutionContext } from "@/lib/runtime/ExecutionContext"
import { toolSuccess, toolError, type ToolOutput } from "@/lib/tools/Tool.interface"
import { HumanMessage, SystemMessage } from "@langchain/core/messages"
import { withFlexibleStructuredOutput } from "@/lib/llm/utils/structuredOutput"
import { findElementPrompt } from "./FindElementTool.prompt"

// Input schema for find element operations
export const FindElementInputSchema = z.object({
  elementDescription: z.string(),  // Natural language description of element
  intent: z.string().optional(),  // Optional context about why finding this element
})

export type FindElementInput = z.infer<typeof FindElementInputSchema>

// Schema for LLM structured output
const FindElementLLMSchema = z.object({
  found: z.boolean().describe("Whether a matching element was found"),
  index: z.number().optional().describe("The index number of the best matching element"),
  confidence: z.enum(["high", "medium", "low"]).optional().describe("Confidence level in the match"),
  reasoning: z.string().describe("Brief explanation of the decision"),
})

export class FindElementTool {
  constructor(private executionContext: ExecutionContext) {}

  async execute(input: FindElementInput): Promise<ToolOutput> {
    try {
      // Get browser state
      const browserState = await this.executionContext.browserContext.getBrowserState()
      
      if (!browserState.clickableElements.length && !browserState.typeableElements.length) {
        return toolError("No interactive elements found on the current page")
      }

      // Find element using LLM
      const result = await this._findElementWithLLM(
        input.elementDescription,
        browserState.clickableElementsString + '\n' + browserState.typeableElementsString
      )

      if (!result.found || result.index === undefined) {
        return toolError(result.reasoning || `No element found matching "${input.elementDescription}"`)
      }

      // Verify element exists
      const foundInClickable = browserState.clickableElements.find(el => el.nodeId === result.index)
      const foundInTypeable = browserState.typeableElements.find(el => el.nodeId === result.index)
      
      if (!foundInClickable && !foundInTypeable) {
        return toolError(`Invalid index ${result.index} returned - element not found`)
      }

      const element = foundInClickable || foundInTypeable
      const elementType = foundInClickable ? "clickable" : "typeable"
      
      return toolSuccess({
        index: result.index,
        confidence: result.confidence,
        elementType,
        tag: element?.tag || "unknown",
        text: element?.text || "",
        message: `Found ${input.elementDescription} at index ${result.index} (${result.confidence} confidence)`
      })
    } catch (error) {
      return toolError(`Failed to find element: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async _findElementWithLLM(description: string, domContent: string) {
    // Get LLM with low temperature for consistency
    const llm = await this.executionContext.llmProvider.createInstance({ 
      modelName: this.executionContext.llmProvider.getModelName(),
      temperature: 0.1 
    })
    
    // Create structured LLM
    const structuredLLM = await withFlexibleStructuredOutput(llm, FindElementLLMSchema)
    
    // Invoke LLM
    const result = await structuredLLM.invoke([
      new SystemMessage(findElementPrompt),
      new HumanMessage(`Find the element matching this description: "${description}"

Interactive elements on the page:
${domContent}`)
    ])

    return result
  }
}

// LangChain wrapper factory function
export function createFindElementTool(executionContext: ExecutionContext): DynamicStructuredTool {
  const findElementTool = new FindElementTool(executionContext)
  
  return new DynamicStructuredTool({
    name: "find_element",
    description: "Find an element on the page using a natural language description. Returns the element index to use with the interact tool.",
    schema: FindElementInputSchema,
    func: async (args): Promise<string> => {
      const result = await findElementTool.execute(args)
      return JSON.stringify(result)
    }
  })
}