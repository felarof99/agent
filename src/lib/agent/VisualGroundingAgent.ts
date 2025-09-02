import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { ToolManager } from '@/lib/tools/ToolManager'
import { createVisualGroundingTool } from '@/lib/tools/grounding/VisualGroundingTool'
import { PubSub } from '@/lib/pubsub'
import { Logging } from '@/lib/utils/Logging'
import { AbortError } from '@/lib/utils/Abortable'
import { Subscription } from '@/lib/pubsub/types'

/**
 * VisualGroundingAgent - Specialized agent for visual element detection
 * Takes user descriptions and uses Claude's vision to find elements on the page
 */
export class VisualGroundingAgent {
  private readonly executionContext: ExecutionContext
  private readonly toolManager: ToolManager
  private statusSubscription?: Subscription  // Subscription to execution status events

  constructor(executionContext: ExecutionContext) {
    this.executionContext = executionContext
    this.toolManager = new ToolManager(executionContext)
    
    // Register only the visual grounding tool
    this._registerTools()
    this._subscribeToExecutionStatus()
  }

  /**
   * Register the visual grounding tool
   */
  private _registerTools(): void {
    this.toolManager.register(createVisualGroundingTool(this.executionContext))
    Logging.log('VisualGroundingAgent', 'Registered visual grounding tool')
  }

  /**
   * Subscribe to execution status events and handle cancellation
   */
  private _subscribeToExecutionStatus(): void {
    this.statusSubscription = this.pubsub.subscribe((event) => {
      if (event.type === 'execution-status') {
        const { status } = event.payload
        
        if (status === 'cancelled') {
          this.pubsub.publishMessage(
            PubSub.createMessageWithId(
              'pause_message_id',
              '✋ Visual grounding paused. Type your next request to continue!',
              'assistant'
            )
          )
          this.executionContext.cancelExecution(true)
        }
      }
    })
  }

  /**
   * Check abort signal and throw if aborted
   */
  private _checkAborted(): void {
    if (this.executionContext.abortController.signal.aborted) {
      throw new AbortError()
    }
  }

  /**
   * Get pubsub instance
   */
  private get pubsub(): PubSub {
    return this.executionContext.getPubSub()
  }

  /**
   * Cleanup method to properly unsubscribe when agent is being destroyed
   */
  public cleanup(): void {
    if (this.statusSubscription) {
      this.statusSubscription.unsubscribe()
      this.statusSubscription = undefined
    }
  }

  /**
   * Main execution entry point - directly calls visual grounding tool
   * @param query - The user's description of what element to find
   */
  async execute(query: string): Promise<void> {
    try {
      this._checkAborted()
      
      Logging.log('VisualGroundingAgent', `Executing visual grounding for: "${query}"`)
      
      // Get the visual grounding tool
      const tool = this.toolManager.get('visual_grounding')
      if (!tool) {
        throw new Error('Visual grounding tool not found')
      }
      
      // Notify user that we're processing
      const processingMsgId = PubSub.generateId('visual_grounding_processing')
      this.pubsub.publishMessage(
        PubSub.createMessageWithId(
          processingMsgId,
          '🔍 Analyzing the page to find the element...',
          'assistant'
        )
      )
      
      // Execute the tool with user's query as the target description
      const result = await tool.func({ target_description: query })
      
      // Parse the result
      let parsedResult: any
      try {
        parsedResult = JSON.parse(result)
      } catch (parseError) {
        Logging.log('VisualGroundingAgent', `Failed to parse tool result: ${parseError}`, 'error')
        throw new Error('Invalid response from visual grounding tool')
      }
      
      // Publish the result message (replaces processing message)
      const messageType = parsedResult.ok ? 'assistant' : 'error'
      const message = parsedResult.message || 
        (parsedResult.ok 
          ? `Found element at (${parsedResult.found_at?.x}, ${parsedResult.found_at?.y})`
          : 'Failed to find the element')
      
      this.pubsub.publishMessage(
        PubSub.createMessage(message, messageType)
      )
      
      // Log metrics
      Logging.logMetric('visual_grounding_execution', {
        query: query.substring(0, 100),  // Truncate long queries
        success: parsedResult.ok,
        coordinates: parsedResult.found_at
      })
      
      Logging.log('VisualGroundingAgent', 
        parsedResult.ok 
          ? `Successfully found element at (${parsedResult.found_at?.x}, ${parsedResult.found_at?.y})`
          : `Failed to find element: ${parsedResult.error}`
      )
      
    } catch (error) {
      if (error instanceof AbortError) {
        Logging.log('VisualGroundingAgent', 'Execution aborted by user')
        // Don't publish message here - already handled in _subscribeToExecutionStatus
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const errorType = error instanceof Error ? error.name : 'UnknownError'
        
        // Log error metric
        Logging.logMetric('visual_grounding_error', {
          error: errorMessage,
          error_type: errorType,
          query: query.substring(0, 100)
        })
        
        Logging.log('VisualGroundingAgent', `Execution failed: ${errorMessage}`, 'error')
        
        // Publish user-facing error
        this.pubsub.publishMessage(
          PubSub.createMessage(`❌ Visual grounding failed: ${errorMessage}`, 'error')
        )
      }
      throw error
    } finally {
      // Cleanup status subscription
      if (this.statusSubscription) {
        this.statusSubscription.unsubscribe()
        this.statusSubscription = undefined
      }
    }
  }
}