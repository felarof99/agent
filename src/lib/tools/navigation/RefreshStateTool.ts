import { z } from "zod"
import { DynamicStructuredTool } from "@langchain/core/tools"
import { ExecutionContext } from "@/lib/runtime/ExecutionContext"
import { toolSuccess, toolError, type ToolOutput } from "@/lib/tools/Tool.interface"

// Input schema - no inputs needed
export const RefreshStateInputSchema = z.object({})

export type RefreshStateInput = z.infer<typeof RefreshStateInputSchema>

export class RefreshStateTool {
  constructor(private executionContext: ExecutionContext) {}

  async execute(_input: RefreshStateInput): Promise<ToolOutput> {
    try {
      const browserContext = this.executionContext.browserContext
      const messageManager = this.executionContext.messageManager
      
      if (!browserContext || !messageManager) {
        return toolError("Browser context or message manager not available")
      }

      // Get current page
      const currentPage = await browserContext.getCurrentPage()
      if (!currentPage) {
        return toolError("No active page to refresh state from")
      }

      // Remove old browser state messages
      messageManager.removeBrowserStateMessages()

      // Get fresh browser state
      const browserState = await browserContext.getBrowserStateString()
      
      // Add fresh state to messages
      messageManager.addBrowserStateMessage(browserState)

      // Count actions since last browser state
      const messages = messageManager.getMessagesWithMetadata()
      let actionCount = 0
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i]
        if (msg.metadata.messageType === "tool") {
          actionCount++
        }
      }

      const url = currentPage.url()
      return toolSuccess({
        message: `Browser state refreshed successfully. Current page: ${url}`,
        actionCount,
        url
      })
    } catch (error) {
      return toolError(`Failed to refresh browser state: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

// LangChain wrapper factory function
export function createRefreshStateTool(executionContext: ExecutionContext): DynamicStructuredTool {
  const refreshStateTool = new RefreshStateTool(executionContext)
  
  return new DynamicStructuredTool({
    name: "refresh_browser_state",
    description: refreshStatePrompt,
    schema: RefreshStateInputSchema,
    func: async (args): Promise<string> => {
      const result = await refreshStateTool.execute(args)
      return JSON.stringify(result)
    }
  })
}

const refreshStatePrompt = `CRITICAL TOOL - Updates the browser state in your conversation context to reflect the current page after navigation or interactions.

WHEN TO USE:
- IMMEDIATELY AFTER: Major page changes (navigation, form submission, clicking links)
- BEFORE: Planning or validation steps if browser state seems outdated
- WHEN: You need to verify the current page matches your expectations
- IF STRUGGLING: When actions are failing repeatedly - refresh to get accurate page information

WHY IT'S CRITICAL:
Without calling this tool regularly, you will be working with STALE, OUTDATED page information that no longer reflects reality.

Remember: The browser state in your context does NOT update automatically. You MUST call this tool to see changes.`