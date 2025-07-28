import { z } from "zod"
import { DynamicStructuredTool } from "@langchain/core/tools"
import { ExecutionContext } from "@/lib/runtime/ExecutionContext"
import { toolSuccess, toolError, type ToolOutput } from "@/lib/tools/Tool.interface"

// Constants
const INTERACTION_WAIT_MS = 1000

// Input schema for interaction operations
export const InteractionInputSchema = z.object({
  operationType: z.enum(["click", "input_text", "clear", "send_keys"]),  // Operation to perform
  index: z.number().optional(),  // Element index for click/input_text/clear
  text: z.string().optional(),  // Text for input_text operation
  keys: z.string().optional(),  // Keys for send_keys operation
  intent: z.string().optional(),  // Optional description of intent
})

export type InteractionInput = z.infer<typeof InteractionInputSchema>

export class InteractionTool {
  constructor(private executionContext: ExecutionContext) {}

  async execute(input: InteractionInput): Promise<ToolOutput> {
    // Validate inputs
    const validation = this._validateInput(input)
    if (!validation.valid) {
      return toolError(validation.error!)
    }

    try {
      switch (input.operationType) {
        case "click":
          return await this._clickElement(input.index!)
        case "input_text":
          return await this._inputText(input.index!, input.text!)
        case "clear":
          return await this._clearElement(input.index!)
        case "send_keys":
          return await this._sendKeys(input.keys!)
      }
    } catch (error) {
      return toolError(`Interaction failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private _validateInput(input: InteractionInput): { valid: boolean; error?: string } {
    const requiresIndex = ["click", "input_text", "clear"]
    
    if (requiresIndex.includes(input.operationType) && input.index === undefined) {
      return { valid: false, error: `${input.operationType} operation requires index parameter` }
    }
    
    if (input.operationType === "input_text" && !input.text) {
      return { valid: false, error: "input_text operation requires text parameter" }
    }
    
    if (input.operationType === "send_keys" && !input.keys) {
      return { valid: false, error: "send_keys operation requires keys parameter" }
    }

    return { valid: true }
  }

  private async _clickElement(index: number): Promise<ToolOutput> {
    const page = await this.executionContext.browserContext.getCurrentPage()
    const element = await page.getElementByIndex(index)
    
    if (!element) {
      return toolError(`Element with index ${index} not found`)
    }

    // Check for file uploader
    if (page.isFileUploader(element)) {
      return toolError(`Element ${index} opens a file upload dialog. File uploads are not supported.`)
    }

    // Track initial state
    const initialTabIds = await this.executionContext.browserContext.getAllTabIds()
    
    // Click element
    await page.clickElement(element.nodeId)
    await new Promise(resolve => setTimeout(resolve, INTERACTION_WAIT_MS))
    
    // Check for new tabs
    const currentTabIds = await this.executionContext.browserContext.getAllTabIds()
    const newTabOpened = currentTabIds.size > initialTabIds.size
    
    if (newTabOpened) {
      const newTabId = Array.from(currentTabIds).find(id => !initialTabIds.has(id))
      if (newTabId) {
        await this.executionContext.browserContext.switchTab(newTabId)
      }
    }

    return toolSuccess({
      operationType: "click",
      message: `Clicked element ${index}`,
      element: {
        tag: element.attributes?.["html-tag"] || element.tag || "unknown",
        text: element.name || element.text || ""
      },
      newTabOpened
    })
  }

  private async _inputText(index: number, text: string): Promise<ToolOutput> {
    const page = await this.executionContext.browserContext.getCurrentPage()
    const element = await page.getElementByIndex(index)
    
    if (!element) {
      return toolError(`Element with index ${index} not found`)
    }

    await page.inputText(element.nodeId, text)
    
    return toolSuccess({
      operationType: "input_text",
      message: `Entered text into element ${index}`,
      element: {
        tag: element.attributes?.["html-tag"] || element.tag || "unknown",
        value: text
      }
    })
  }

  private async _clearElement(index: number): Promise<ToolOutput> {
    const page = await this.executionContext.browserContext.getCurrentPage()
    const element = await page.getElementByIndex(index)
    
    if (!element) {
      return toolError(`Element with index ${index} not found`)
    }

    await page.clearElement(element.nodeId)
    
    return toolSuccess({
      operationType: "clear",
      message: `Cleared element ${index}`,
      element: {
        tag: element.attributes?.["html-tag"] || element.tag || "unknown",
        value: ""
      }
    })
  }

  private async _sendKeys(keys: string): Promise<ToolOutput> {
    const page = await this.executionContext.browserContext.getCurrentPage()
    await page.sendKeys(keys)
    
    return toolSuccess({
      operationType: "send_keys",
      message: `Sent keys: ${keys}`
    })
  }
}

// LangChain wrapper factory function
export function createInteractionTool(executionContext: ExecutionContext): DynamicStructuredTool {
  const interactionTool = new InteractionTool(executionContext)
  
  return new DynamicStructuredTool({
    name: "interact",
    description: "Perform element interactions: click, input_text (type text), clear (clear field), or send_keys (keyboard keys). For dropdowns, click to open then click the option.",
    schema: InteractionInputSchema,
    func: async (args): Promise<string> => {
      const result = await interactionTool.execute(args)
      return JSON.stringify(result)
    }
  })
}