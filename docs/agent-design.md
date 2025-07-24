# BrowserAgent Design

## Overview

BrowserAgent is a plan-then-execute system for web automation. It uses a rolling-horizon planning approach where it:
1. Creates a plan of N steps (typically 3)
2. Executes those steps sequentially
3. Replans when needed (failures, environment changes, or plan completion)

The agent maintains strict control over conversation state - only the agent can write to MessageManager, while tools receive read-only access through MessageReader.

## Core Design Principles

1. **Plan-Then-Execute Model**: Agent creates multi-step plans and executes them sequentially
2. **Rolling-Horizon Planning**: Plan N steps (typically 3-5), execute, then replan as needed
3. **Message Control**: Only the agent writes to MessageManager; tools get read-only access
4. **JSON-Based Planning**: Plans are structured as JSON for simplicity and parseability
5. **Tool Registry**: Flexible tool registration and discovery using LangChain DynamicStructuredTool
6. **Simple, Clean Code**: No over-engineering, follow CLAUDE.md rules

## Architecture

### 1. MessageManagerReadOnly (Read-Only Interface)

```typescript
// src/lib/runtime/MessageReader.ts
export class MessageReader {
  constructor(private messageManager: MessageManager) {}
  
  getAll(): Message[] {
    return this.messageManager.getMessages()
  }
  
  getLastUser(): string | null {
    return this.messageManager.getLastHuman()
  }
  
  getLastAssistant(): string | null {
    return this.messageManager.getLastAI()
  }
  
  getConversationHistory(): string {
    return this.getAll()
      .map(m => `${m.role}: ${m.content}`)
      .join('\n')
  }
}
```

### 2. Tool Result Interface

```typescript
// src/lib/tools/tool.interface.ts
export interface ToolResult {
  ok: boolean
  output?: string
  error?: string
  data?: Record<string, unknown>
}
```

### 3. Tool Registry

```typescript
// src/lib/tools/base/ToolRegistry.ts
import { DynamicStructuredTool } from "@langchain/core/tools"

export class ToolRegistry {
  private tools: Map<string, DynamicStructuredTool> = new Map()
  
  register(tool: DynamicStructuredTool): void {
    this.tools.set(tool.name, tool)
  }
  
  get(name: string): DynamicStructuredTool | undefined {
    return this.tools.get(name)
  }
  
  getAllNames(): string[] {
    return Array.from(this.tools.keys())
  }
  
  getDescriptions(): string {
    return Array.from(this.tools.values())
      .map(t => `- ${t.name}: ${t.description}`)
      .join('\n')
  }
  
  getAllTools(): DynamicStructuredTool[] {
    return Array.from(this.tools.values())
  }
}
```

### 4. BrowserAgent Core

```typescript
// src/lib/agent/BrowserAgent.ts

// Constants
const MAX_ITERATIONS = 30
const ROLLING_HORIZON_STEPS = 3  // Plan N steps at a time

// Type definitions
type ToolInvocation = z.infer<typeof ToolInvocationSchema>
type Plan = z.infer<typeof PlanSchema>
type ToolResult = { ok: boolean; output?: string; error?: string }

// Schema for structured LLM output - what tool to call next
const ToolInvocationSchema = z.object({
  tool: z.string(),  // Tool name to invoke
  args: z.record(z.unknown()),  // Arguments for the tool
  reasoning: z.string()  // Why this tool is being called
})

// Schema for plan structure
const PlanSchema = z.object({
  steps: z.array(z.object({
    action: z.string(),  // What to do
    tool: z.string(),  // Which tool to use
    args: z.record(z.unknown()).optional()  // Tool arguments if known
  }))
})

export class BrowserAgent {
  private executionContext: ExecutionContext
  private messageManager: MessageManager
  private toolRegistry: ToolRegistry
  private llm: BaseChatModel | null = null
  private currentPlan: any[] = []
  private planIndex: number = 0
  
  constructor(executionContext: ExecutionContext) {
    this.executionContext = executionContext
    this.messageManager = executionContext.messageManager
    this.toolRegistry = new ToolRegistry()
    this._registerTools()
  }
  
  async execute(task: string): Promise<void> {
    // 1. Initialize conversation with system prompt
    const systemPrompt = generateSystemPrompt(this.toolRegistry.getDescriptions())
    this.messageManager.addSystemMessage(systemPrompt)
    
    // 2. Add user task
    this.messageManager.addHumanMessage(task)
    
    // 3. Main execution loop with rolling-horizon planning
    let iteration = 0
    let taskComplete = false
    
    while (!taskComplete && iteration < MAX_ITERATIONS) {
      iteration++
      
      // Check if we need to plan (no plan or completed current plan)
      if (this.currentPlan.length === 0 || this.planIndex >= this.currentPlan.length) {
        await this._createPlan(ROLLING_HORIZON_STEPS)
        this.planIndex = 0
      }
      
      // Execute steps from current plan
      while (this.planIndex < this.currentPlan.length && !taskComplete) {
        const step = this.currentPlan[this.planIndex]
        
        // Get browser state before each step
        const browserState = await this._getBrowserState()
        
        // Determine tool invocation for this step
        const invocation = await this._determineToolInvocation(step, browserState)
        
        // Execute the tool
        const result = await this._executeStep(invocation)
        
        // Update message manager
        this._updateMessages(invocation, result)
        
        // Check if done
        if (invocation.tool === 'done' && result.ok) {
          taskComplete = true
        }
        
        this.planIndex++
        
        // Check if we need to replan (failure or environment change)
        if (!result.ok && this._shouldReplan(result)) {
          break  // Exit inner loop to trigger replanning
        }
      }
    }
  }
  
  private async _createPlan(steps: number): Promise<void> {
    // Call planner tool to generate next N steps
    const reader = new MessageReader(this.messageManager)
    const browserState = await this._getBrowserState()
    
    // Get planner tool from registry
    const plannerTool = this.toolRegistry.get('planner')
    if (!plannerTool) {
      throw new Error('Planner tool not found in registry')
    }
    
    // Execute planner
    const result = await plannerTool.func({
      task: this.messageManager.getLastHuman() || '',
      max_steps: steps,
      browser_state: browserState
    })
    
    // Parse JSON plan
    try {
      const planData = JSON.parse(result)
      if (planData.ok && planData.plan) {
        this.currentPlan = planData.plan.steps
        this.messageManager.addAIMessage(`Created plan with ${this.currentPlan.length} steps`)
      }
    } catch (error) {
      this.currentPlan = []
    }
  }
  
  private async _determineToolInvocation(
    step: any,
    browserState: string
  ): Promise<ToolInvocation> {
    if (!this.llm) {
      this.llm = await this.executionContext.getLLM()
    }
    
    const structuredLLM = withStructuredOutput(this.llm, ToolInvocationSchema)
    
    // Build prompt
    const prompt = `Current step: ${step.action}
Suggested tool: ${step.tool}
Browser state: ${browserState}

Determine the exact tool invocation for this step.`
    
    const messages = this.messageManager.getMessages()
    messages.push({ role: 'user', content: prompt })
    
    return await structuredLLM.invoke(messages)
  }
  
  private async _executeStep(invocation: ToolInvocation): Promise<ToolResult> {
    const tool = this.toolRegistry.get(invocation.tool)
    
    if (!tool) {
      return { ok: false, error: `Unknown tool: ${invocation.tool}` }
    }
    
    // Execute tool using LangChain DynamicStructuredTool
    try {
      const result = await tool.func(invocation.args)
      return typeof result === 'string' ? JSON.parse(result) : result
    } catch (error) {
      return { ok: false, error: error.message }
    }
  }
  
  private _updateMessages(invocation: ToolInvocation, result: ToolResult): void {
    // Agent controls what goes into message history
    const toolMessage = `Tool: ${invocation.tool}
Reasoning: ${invocation.reasoning}
Result: ${result.ok ? result.output || 'Success' : result.error}`
    
    this.messageManager.addAIMessage(toolMessage)
  }
  
  private _shouldReplan(result: ToolResult): boolean {
    // Replan on failures or significant environment changes
    return !result.ok || result.error?.includes('page changed')
  }
  
  private async _getBrowserState(): Promise<string> {
    return await this.executionContext.browserContext.getBrowserStateString()
  }
  
  private _registerTools(): void {
    // Register LangChain DynamicStructuredTools
    this.toolRegistry.register(createPlannerTool(this.executionContext))
    this.toolRegistry.register(createNavigationTool(this.executionContext.browserContext.getCurrentPage()))
    this.toolRegistry.register(createDoneTool())
  }
}
```

### 5. Tool Implementations

#### PlannerTool

```typescript
// src/lib/tools/planner/PlannerTool.ts
import { z } from "zod"
import { DynamicStructuredTool } from "@langchain/core/tools"
import { ExecutionContext } from "@/lib/runtime/ExecutionContext"
import { MessageReader } from "@/lib/runtime/MessageReader"
import { withStructuredOutput } from "@/lib/llm/utils/structuredOutput"
import { toolSuccess, toolError } from "@/lib/tools/tool.interface"

// Input schema for planner
const PlannerInputSchema = z.object({
  task: z.string(),  // Task to plan for
  max_steps: z.number().default(3),  // Number of steps to plan
  browser_state: z.string()  // Current browser state
})

// Schema for plan output
const PlanSchema = z.object({
  steps: z.array(z.object({
    action: z.string(),  // What to do
    tool: z.string(),  // Which tool to use
    args: z.record(z.unknown()).optional()  // Tool arguments if known
  }))
})

// LangChain wrapper factory function
export function createPlannerTool(executionContext: ExecutionContext): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: "planner",
    description: "Create a step-by-step plan in JSON format",
    schema: PlannerInputSchema,
    func: async (args): Promise<string> => {
      try {
        const llm = await executionContext.getLLM()
        const reader = new MessageReader(executionContext.messageManager)
        
        // Get prompts
        const systemPrompt = generatePlannerSystemPrompt()
        const taskPrompt = generatePlannerTaskPrompt(
          args.task,
          args.max_steps,
          reader.getConversationHistory(),
          args.browser_state
        )
        
        // Get structured response
        const structuredLLM = withStructuredOutput(llm, PlanSchema)
        const plan = await structuredLLM.invoke([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: taskPrompt }
        ])
        
        return JSON.stringify({
          ok: true,
          plan: plan,
          output: `Created plan with ${plan.steps.length} steps`
        })
      } catch (error) {
        return JSON.stringify(toolError(`Planning failed: ${error.message}`))
      }
    }
  })
}
```

```typescript
// src/lib/tools/planner/PlannerTool.prompt.ts
export function generatePlannerSystemPrompt(): string {
  return `You are a concise web task planner.
Output a JSON plan with clear, actionable steps.

Rules:
- Create 1-5 steps maximum
- Each step should be a single, clear action
- Include the tool to use for each step
- Always end with a "done" tool step
- Be specific about what to do`
}

export function generatePlannerTaskPrompt(
  task: string,
  maxSteps: number,
  conversationHistory: string,
  browserState: string
): string {
  return `Task: ${task}

Current browser state:
${browserState}

Conversation history:
${conversationHistory}

Create a plan with up to ${maxSteps} steps to accomplish this task.
Output a JSON object with a 'steps' array where each step has:
- action: what to do
- tool: which tool to use
- args: optional arguments for the tool`
}
```

#### NavigationTool

```typescript
// src/lib/tools/navigation/NavigationTool.ts
// Already exists - just import the factory function
import { createNavigationTool } from "@/lib/tools/navigation/NavigationTool"

// Usage in BrowserAgent:
const navigationTool = createNavigationTool(browserPage)
```

#### DoneTool

```typescript
// src/lib/tools/utils/DoneTool.ts
import { z } from "zod"
import { DynamicStructuredTool } from "@langchain/core/tools"
import { toolSuccess } from "@/lib/tools/tool.interface"

const DoneInputSchema = z.object({
  summary: z.string().optional()  // Optional completion summary
})

export function createDoneTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: "done",
    description: "Mark task as complete",
    schema: DoneInputSchema,
    func: async (args): Promise<string> => {
      const summary = args.summary || "Task completed successfully"
      return JSON.stringify(toolSuccess(summary))
    }
  })
}
```

### 6. Prompts

```typescript
// src/lib/agent/BrowserAgent.prompt.ts
export function generateSystemPrompt(toolDescriptions: string): string {
  return `You are BrowserAgent, a web automation assistant.

Available tools:
${toolDescriptions}

WORKFLOW:
1. Analyze the user's task
2. If complex, use 'planner' to create steps
3. Execute steps sequentially using appropriate tools
4. Call 'done' when complete

RULES:
- One tool call at a time
- Be concise in reasoning
- Follow your plan if you have one
- Always complete tasks before calling done`
}
```

## Execution Flow

### Initialization Phase
1. Set system prompt from BrowserAgent.prompt.ts
2. Add user task as Human message
3. Register tools in ToolRegistry (planner, navigate, done, etc.)

### Main Loop (Rolling-Horizon Planning)
```
while (!done && iterations < MAX_ITERATIONS):
  1. Check if need to plan:
     - No current plan OR
     - Completed all steps in current plan
     
  2. If planning needed:
     - Get browser state
     - Call planner tool to generate next N steps (typically 3)
     - Parse JSON plan into step array
     - Reset plan index to 0
     
  3. Execute current plan:
     for each step in plan:
       a. Get fresh browser state
       b. Determine exact tool invocation from step
       c. Execute tool with args
       d. Agent appends result to MessageManager
       e. If tool == 'done': break
       f. If failure && should_replan: break inner loop
       
  4. Increment iteration counter
```

### Tool Execution Detail
```
For each tool call:
1. Agent gets tool from registry
2. Creates MessageReader (read-only view)
3. Executes tool.func(args) 
4. Tool returns JSON result
5. Agent decides what to add to MessageManager
6. Only agent writes to message history
```

### Replanning Triggers
- Plan completed (all steps executed)
- Tool execution failure
- Significant environment change
- Maximum steps per plan reached

## Key Benefits

1. **Clean Separation**: Tools can't pollute message history
2. **Sequential Control**: Simple for-loop execution model
3. **Extensible**: Easy to add new tools via registry
4. **Type Safe**: Zod schemas for all LLM outputs
5. **Testable**: Each component is isolated

## Example Execution

### Task: "Go to google.com"

```
1. Initialize:
   - System: "You are BrowserAgent..."
   - Human: "Go to google.com"
   
2. First iteration - Need to plan:
   - Call planner tool with task
   - Planner returns JSON:
     {
       "steps": [
         {"action": "Navigate to Google", "tool": "navigate", "args": {"url": "google.com"}},
         {"action": "Mark task complete", "tool": "done"}
       ]
     }
   
3. Execute step 1:
   - Tool invocation: navigate with url="google.com"
   - Result: {"ok": true, "output": "Navigated to https://google.com"}
   - Agent adds: "Tool: navigate\nReasoning: Navigate to Google\nResult: Navigated to https://google.com"
   
4. Execute step 2:
   - Tool invocation: done
   - Result: {"ok": true, "output": "Task completed successfully"}
   - Exit loop
```

## Future Extensions

1. **Sub-agents**: Tools that fork MessageManager for specialized tasks
2. **Parallel Steps**: Execute independent steps concurrently
3. **Conversation Memory**: Check for follow-up tasks
4. **Tool Composition**: Tools that call other tools internally
5. **Dynamic Tool Loading**: Load tools based on task requirements
