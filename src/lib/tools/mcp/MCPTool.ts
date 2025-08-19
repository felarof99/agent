import { z } from "zod"
import { DynamicStructuredTool } from "@langchain/core/tools"
import { ExecutionContext } from "@/lib/runtime/ExecutionContext"
import { toolSuccess, toolError, type ToolOutput } from "@/lib/tools/Tool.interface"
import { KlavisAPIManager } from "@/lib/mcp/KlavisAPIManager"

// Input schema for MCP operations - runtime only
const MCPToolInputSchema = z.object({
  action: z.enum(['getUserInstances', 'listTools', 'callTool']).describe('The action to perform'),
  instanceId: z.string().optional().describe('Instance ID for listTools and callTool'),
  toolName: z.string().optional().describe('Tool name for callTool'),
  toolArgs: z.any().optional().describe('Arguments for callTool')
})

export type MCPToolInput = z.infer<typeof MCPToolInputSchema>

/**
 * MCPTool - Interacts with installed MCP servers at runtime
 * Following the FindElementTool pattern
 */
export class MCPTool {
  private manager: KlavisAPIManager
  private instancesCache: Map<string, { id: string; name: string }> = new Map()

  constructor(private executionContext: ExecutionContext) {
    this.manager = this.executionContext.getKlavisAPIManager()
  }

  async execute(input: MCPToolInput): Promise<ToolOutput> {
    try {
      switch (input.action) {
        case 'getUserInstances':
          return await this._getUserInstances()
        
        case 'listTools':
          return await this._listTools(input.instanceId)
        
        case 'callTool':
          return await this._callTool(input.instanceId, input.toolName, input.toolArgs)
        
        default:
          return toolError(`Unknown action: ${input.action}`)
      }
    } catch (error) {
      return toolError(`MCP operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get all installed MCP servers for the current user
   */
  private async _getUserInstances(): Promise<ToolOutput> {
    try {
      const instances = await this.manager.getInstalledServers()
      
      if (instances.length === 0) {
        return toolSuccess(JSON.stringify({
          instances: [],
          message: 'No MCP servers installed. Please install servers in Settings > Integrations.'
        }))
      }

      // Store instances in cache for later use
      instances.forEach(instance => {
        this.instancesCache.set(instance.id, { id: instance.id, name: instance.name })
      })
      
      // Format instances for easy consumption
      const formattedInstances = instances.map(instance => ({
        id: instance.id,
        name: instance.name,
        authenticated: instance.isAuthenticated,
        authNeeded: instance.authNeeded,
        toolCount: instance.tools?.length || 0
      }))

      return toolSuccess(JSON.stringify({
        instances: formattedInstances,
        count: formattedInstances.length
      }))
    } catch (error) {
      return toolError(`Failed to get user instances: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * List available tools for a specific MCP server
   */
  private async _listTools(instanceId?: string): Promise<ToolOutput> {
    if (!instanceId) {
      return toolError('instanceId is required for listTools action')
    }

    // Get instance details from cache
    const instance = this.instancesCache.get(instanceId)
    if (!instance) {
      return toolError(`Instance ${instanceId} not found. Please run getUserInstances first.`)
    }

    try {
      const tools = await this.manager.client.listTools(instanceId, instance.name)
      
      if (!tools || tools.length === 0) {
        return toolSuccess(JSON.stringify({
          tools: [],
          message: 'No tools available for this server'
        }))
      }

      // Extract tool names and descriptions
      const formattedTools = tools.map(tool => ({
        name: tool.name || 'unnamed',
        description: tool.description || 'No description',
        // Include input schema if available
        inputSchema: tool.inputSchema || null
      }))

      return toolSuccess(JSON.stringify({
        tools: formattedTools,
        count: formattedTools.length,
        instanceId
      }))
    } catch (error) {
      return toolError(`Failed to list tools: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Execute a tool on an MCP server
   */
  private async _callTool(
    instanceId?: string,
    toolName?: string,
    toolArgs?: any
  ): Promise<ToolOutput> {
    // Validate required parameters
    if (!instanceId) {
      return toolError('instanceId is required for callTool action')
    }
    if (!toolName) {
      return toolError('toolName is required for callTool action')
    }
    
    // Get instance details from cache
    const instance = this.instancesCache.get(instanceId)
    if (!instance) {
      return toolError(`Instance ${instanceId} not found. Please run getUserInstances first.`)
    }

    try {
      // Call the tool
      const result = await this.manager.client.callTool(
        instanceId,
        instance.name,
        toolName,
        toolArgs || {}
      )

      if (!result.success) {
        return toolError(result.error || 'Tool execution failed')
      }

      // Format successful result
      const output = {
        success: true,
        toolName,
        result: result.result?.content || result.result,
        instanceId
      }

      return toolSuccess(JSON.stringify(output))
    } catch (error) {
      return toolError(`Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

/**
 * Factory function to create MCPTool for LangChain integration
 */
export function createMCPTool(executionContext: ExecutionContext): DynamicStructuredTool {
  const mcpTool = new MCPTool(executionContext)

  return new DynamicStructuredTool({
    name: "mcp_tool",
    description: `Interact with installed MCP servers (Gmail, GitHub, Slack, etc.). 
    Actions:
    - getUserInstances: Get all installed MCP servers with their instance IDs
    - listTools: List available tools for a server (requires instanceId)
    - callTool: Execute a tool on a server (requires instanceId, toolName, toolArgs)`,

    schema: MCPToolInputSchema,
    func: async (args): Promise<string> => {
      const result = await mcpTool.execute(args)
      return JSON.stringify(result)
    }
  })
}