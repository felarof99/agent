import { StreamEventBus } from '@/lib/events/StreamEventBus';

/**
 * High-level event processor for BrowserAgent
 * Provides clear, semantic methods for agent operations
 */
export class EventProcessor {
  private eventBus: StreamEventBus;
  private currentSegmentId: number = 0;
  private currentMessageId: string = '';

  constructor(eventBus: StreamEventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Emit that agent is analyzing/classifying the task
   */
  analyzingTask(): void {
    this.eventBus.emitThinking('Analyzing task complexity...', 'analysis', 'BrowserAgent');
  }

  /**
   * Emit task classification result
   */
  taskClassified(isSimple: boolean): void {
    const message = isSimple 
      ? 'Task classified as simple - executing directly'
      : 'Task classified as complex - creating execution plan';
    this.eventBus.emitSystemMessage(message, 'info', 'BrowserAgent');
  }

  /**
   * Emit that agent is planning
   */
  planningSteps(numSteps: number = 3): void {
    this.eventBus.emitThinking(
      `Creating ${numSteps}-step execution plan...`,
      'planning',
      'BrowserAgent'
    );
  }

  /**
   * Emit current step being executed
   */
  executingStep(stepNumber: number, action: string): void {
    this.eventBus.emitSystemMessage(
      `Step ${stepNumber}: ${action}`,
      'info',
      'BrowserAgent'
    );
  }

  /**
   * Start agent thinking/response (returns messageId for streaming)
   */
  startThinking(): string {
    this.currentSegmentId++;
    this.currentMessageId = this._generateMessageId();
    this.eventBus.emitSegmentStart(
      this.currentSegmentId,
      this.currentMessageId,
      'BrowserAgent'
    );
    return this.currentMessageId;
  }

  /**
   * Stream agent response content
   */
  streamThought(content: string): void {
    if (!this.currentMessageId) return;
    
    this.eventBus.emitSegmentChunk(
      this.currentSegmentId,
      content,
      this.currentMessageId,
      'BrowserAgent'
    );
  }

  /**
   * Complete agent thinking/response
   */
  finishThinking(fullContent: string): void {
    if (!this.currentMessageId) return;
    
    this.eventBus.emitSegmentEnd(
      this.currentSegmentId,
      fullContent,
      this.currentMessageId,
      'BrowserAgent'
    );
  }

  /**
   * Emit tool execution start
   */
  executingTool(toolName: string, args?: any): void {
    const displayInfo = this._getToolDisplayInfo(toolName, args);
    
    this.eventBus.emitToolStart({
      toolName,
      displayName: displayInfo.name,
      icon: displayInfo.icon,
      description: displayInfo.description,
      args: args || {}
    }, 'BrowserAgent');
  }

  /**
   * Emit tool execution result
   */
  toolResult(toolName: string, success: boolean, summary?: string): void {
    const displayName = this._getToolDisplayInfo(toolName).name;
    
    this.eventBus.emitToolEnd({
      toolName,
      displayName,
      result: summary || (success ? 'Completed' : 'Failed'),
      rawResult: {},
      success
    }, 'BrowserAgent');
  }

  /**
   * Emit progress message
   */
  progress(message: string): void {
    this.eventBus.emitSystemMessage(message, 'info', 'BrowserAgent');
  }

  /**
   * Emit completion
   */
  complete(message?: string): void {
    this.eventBus.emitComplete(true, message || 'Task completed successfully', 'BrowserAgent');
  }

  /**
   * Emit error
   */
  error(message: string, fatal: boolean = false): void {
    this.eventBus.emitError(message, undefined, fatal, 'BrowserAgent');
  }

  // Private helper methods
  private _generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private _getToolDisplayInfo(toolName: string, args?: any): {
    name: string;
    icon: string;
    description: string;
  } {
    // Tool display mapping
    const toolInfo: Record<string, { name: string; icon: string; description?: (args: any) => string }> = {
      'classification_tool': {
        name: 'Task Analysis',
        icon: '🔍',
        description: () => 'Analyzing task complexity'
      },
      'planner_tool': {
        name: 'Planning',
        icon: '📋',
        description: (args) => `Creating ${args?.max_steps || 3}-step plan`
      },
      'navigation_tool': {
        name: 'Navigation',
        icon: '🌐',
        description: (args) => args?.url ? `Navigating to ${args.url}` : 'Navigating to page'
      },
      'tab_operations_tool': {
        name: 'Tab Operations',
        icon: '📑',
        description: (args) => args?.operation || 'Managing tabs'
      },
      'done_tool': {
        name: 'Completion',
        icon: '✅',
        description: () => 'Marking task as complete'
      }
    };

    const info = toolInfo[toolName] || {
      name: toolName,
      icon: '🔧',
      description: () => `Executing ${toolName}`
    };

    return {
      name: info.name,
      icon: info.icon,
      description: info.description ? info.description(args) : `Executing ${info.name}`
    };
  }
}