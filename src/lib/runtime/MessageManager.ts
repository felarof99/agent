import {
  type BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";

// Constants for token approximation
const CHARS_PER_TOKEN = 4;
const TOKENS_PER_MESSAGE = 3;

// Read-only view for tools
export class MessageManagerReadOnly {
  constructor(private messageManager: MessageManager) {}

  getAll(): BaseMessage[] {
    return this.messageManager.getMessages();
  }
  
  // NTN: Only minimal methods added as requested
}

export class MessageManager {
  private messages: BaseMessage[] = [];
  private maxTokens: number;
  
  constructor(maxTokens = 8192) {
    this.maxTokens = maxTokens;
  }

  // Add message and auto-trim if needed
  add(message: BaseMessage): void {
    this.messages.push(message);
    this._trimIfNeeded();
  }

  // Convenience methods
  addHuman(content: string): void {
    this.add(new HumanMessage(content));
  }

  addAI(content: string): void {
    this.add(new AIMessage(content));
  }

  addSystem(content: string): void {
    this._removeSystemMessages();
    this.add(new SystemMessage(content));
  }

  addTool(content: string, toolCallId: string): void {
    this.add(new ToolMessage(content, toolCallId));
  }

  // Get messages
  getMessages(): BaseMessage[] {
    return [...this.messages];
  }

  // Get current token count - simple approximation
  getTokenCount(): number {
    if (this.messages.length === 0) return 0;
    
    let totalTokens = 0;
    
    for (const msg of this.messages) {
      // Add per-message overhead
      totalTokens += TOKENS_PER_MESSAGE;
      
      // Count content tokens
      if (typeof msg.content === 'string') {
        totalTokens += Math.ceil(msg.content.length / CHARS_PER_TOKEN);
      } else if (msg.content) {
        // For complex content (arrays, objects), stringify and count
        const contentStr = JSON.stringify(msg.content);
        totalTokens += Math.ceil(contentStr.length / CHARS_PER_TOKEN);
      }
      
      // Count additional fields for AI messages (tool calls)
      if (msg instanceof AIMessage && msg.tool_calls) {
        const toolCallsStr = JSON.stringify(msg.tool_calls);
        totalTokens += Math.ceil(toolCallsStr.length / CHARS_PER_TOKEN);
      }
      
      // Count tool message IDs
      if (msg instanceof ToolMessage && msg.tool_call_id) {
        totalTokens += Math.ceil(msg.tool_call_id.length / CHARS_PER_TOKEN);
      }
    }
    
    return totalTokens;
  }

  // Get remaining tokens
  remaining(): number {
    return Math.max(0, this.maxTokens - this.getTokenCount());
  }

  // Clear all
  clear(): void {
    this.messages = [];
  }

  // Remove last message
  removeLast(): boolean {
    return this.messages.pop() !== undefined;
  }

  // Private: Auto-trim to fit token budget
  private _trimIfNeeded(): void {
    // Simple trimming by removing oldest non-system messages
    while (this.getTokenCount() > this.maxTokens && this.messages.length > 1) {
      const indexToRemove = this.messages.findIndex(msg => !(msg instanceof SystemMessage));
      if (indexToRemove !== -1) {
        this.messages.splice(indexToRemove, 1);
      } else {
        // All remaining messages are system messages, remove the oldest one
        this.messages.shift();
      }
    }
  }

  // Private: Remove system messages
  private _removeSystemMessages(): void {
    this.messages = this.messages.filter(msg => !(msg instanceof SystemMessage));
  }

  // Fork the message manager with optional history
  fork(includeHistory: boolean = true): MessageManager {
    const newMM = new MessageManager(this.maxTokens);
    if (includeHistory) {
      newMM.messages = [...this.messages];
    }
    return newMM;
  }
}