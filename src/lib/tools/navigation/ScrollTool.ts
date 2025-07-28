import { z } from "zod"
import { DynamicStructuredTool } from "@langchain/core/tools"
import { ExecutionContext } from "@/lib/runtime/ExecutionContext"
import { toolSuccess, toolError, type ToolOutput } from "@/lib/tools/Tool.interface"

// Constants
const DEFAULT_VIEWPORT_COUNT = 1

// Input schema for scroll operations
export const ScrollInputSchema = z.object({
  operationType: z.enum(["scroll_down", "scroll_up", "scroll_to_element"]),  // Operation to perform
  amount: z.number().optional(),  // Number of viewports for scroll_down/up
  index: z.number().optional(),  // Element index for scroll_to_element
  intent: z.string().optional(),  // Optional description of intent
})

export type ScrollInput = z.infer<typeof ScrollInputSchema>

export class ScrollTool {
  constructor(private executionContext: ExecutionContext) {}

  async execute(input: ScrollInput): Promise<ToolOutput> {
    // Validate input
    if (input.operationType === "scroll_to_element" && input.index === undefined) {
      return toolError("scroll_to_element operation requires index parameter")
    }

    try {
      const page = await this.executionContext.browserContext.getCurrentPage()
      
      switch (input.operationType) {
        case "scroll_down":
          return await this._scrollDown(page, input.amount)
        case "scroll_up":
          return await this._scrollUp(page, input.amount)
        case "scroll_to_element":
          return await this._scrollToElement(page, input.index!)
      }
    } catch (error) {
      return toolError(`Scroll operation failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async _scrollDown(page: any, amount?: number): Promise<ToolOutput> {
    const viewports = amount || DEFAULT_VIEWPORT_COUNT
    await page.scrollDown(viewports)
    
    return toolSuccess({
      operationType: "scroll_down",
      message: `Scrolled down ${viewports} viewport${viewports > 1 ? 's' : ''}`,
      viewports
    })
  }

  private async _scrollUp(page: any, amount?: number): Promise<ToolOutput> {
    const viewports = amount || DEFAULT_VIEWPORT_COUNT
    await page.scrollUp(viewports)
    
    return toolSuccess({
      operationType: "scroll_up",
      message: `Scrolled up ${viewports} viewport${viewports > 1 ? 's' : ''}`,
      viewports
    })
  }

  private async _scrollToElement(page: any, index: number): Promise<ToolOutput> {
    const element = await page.getElementByIndex(index)
    
    if (!element) {
      return toolError(`Element with index ${index} not found`)
    }

    const success = await page.scrollToElement(element.nodeId)
    
    if (!success) {
      return toolError(`Could not scroll to element ${index}`)
    }

    return toolSuccess({
      operationType: "scroll_to_element",
      message: `Scrolled to element ${index}`,
      elementFound: true,
      element: {
        tag: element.tag || "unknown",
        text: element.text || ""
      }
    })
  }
}

// LangChain wrapper factory function
export function createScrollTool(executionContext: ExecutionContext): DynamicStructuredTool {
  const scrollTool = new ScrollTool(executionContext)
  
  return new DynamicStructuredTool({
    name: "scroll",
    description: "Perform scrolling operations: scroll_down/up (by viewports) or scroll_to_element (by index). Pass amount for number of viewports (default 1).",
    schema: ScrollInputSchema,
    func: async (args): Promise<string> => {
      const result = await scrollTool.execute(args)
      return JSON.stringify(result)
    }
  })
}