import { describe, it, expect, beforeEach } from 'vitest';
import { BrowserAgent } from './BrowserAgent';
import { ExecutionContext } from '@/lib/runtime/ExecutionContext';
import { MessageManager } from '@/lib/runtime/MessageManager';
import { BrowserContext } from '@/lib/browser/BrowserContext';
import { BrowserPage } from '@/lib/browser/BrowserPage';

describe('BrowserAgent Integration', () => {
  it('should create BrowserAgent instance with required dependencies', async () => {
    // Create real instances (not mocks) to test integration
    const messageManager = new MessageManager();
    const browserContext = new BrowserContext();
    
    // Create a minimal execution context
    const executionContext = {
      messageManager,
      browserContext,
      getLLM: async () => ({
        withStructuredOutput: () => ({
          invoke: async () => ({ steps: [] })
        })
      })
    } as any as ExecutionContext;

    // Create BrowserAgent
    const browserAgent = new BrowserAgent(executionContext);
    
    // Verify it was created successfully
    expect(browserAgent).toBeDefined();
    expect(browserAgent).toBeInstanceOf(BrowserAgent);
  });

  it('should register required tools during initialization', () => {
    // Create minimal dependencies
    const messageManager = new MessageManager();
    const browserContext = new BrowserContext();
    
    const executionContext = {
      messageManager,
      browserContext,
      getLLM: async () => ({
        withStructuredOutput: () => ({
          invoke: async () => ({ steps: [] })
        })
      })
    } as any as ExecutionContext;

    // Create BrowserAgent
    const browserAgent = new BrowserAgent(executionContext);
    
    // Access private toolManager to verify tools (for testing purposes)
    const toolManager = (browserAgent as any).toolManager;
    
    // Verify essential tools are registered
    expect(toolManager.get('planner')).toBeDefined();
    expect(toolManager.get('done')).toBeDefined();
    expect(toolManager.get('navigate')).toBeDefined();
  });

  it('should handle a simple task execution flow', async () => {
    // Create dependencies
    const messageManager = new MessageManager();
    const browserContext = new BrowserContext();
    
    // Mock LLM to return a simple plan
    const executionContext = {
      messageManager,
      browserContext,
      getLLM: async () => ({
        withStructuredOutput: () => ({
          invoke: async () => ({
            steps: [
              { action: 'Mark task as done', reasoning: 'Simple test task' }
            ]
          })
        })
      })
    } as any as ExecutionContext;

    // Create BrowserAgent
    const browserAgent = new BrowserAgent(executionContext);
    
    // Execute a simple task
    await browserAgent.execute('Test task');
    
    // Verify messages were added
    const messages = messageManager.getMessages();
    expect(messages.length).toBeGreaterThan(0);
    
    // Verify system prompt was added
    const systemMessage = messages.find(m => m._getType() === 'system');
    expect(systemMessage).toBeDefined();
    
    // Verify human message was added
    const humanMessage = messages.find(m => m._getType() === 'human');
    expect(humanMessage).toBeDefined();
    expect(humanMessage?.content).toBe('Test task');
  });
});