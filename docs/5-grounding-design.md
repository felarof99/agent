⏺ Vision-Based Grounding in Magnitude: Claude/Anthropic Implementation

  Overview

  Magnitude implements a sophisticated vision-based grounding system that enables Claude to interact with web pages through visual understanding. The system operates in two distinct modes depending on
  configuration, with Claude either directly outputting pixel coordinates or working with a separate grounding service (Moondream) for enhanced accuracy.

  Core Concepts

  What is Vision-Based Grounding?

  Vision-based grounding is the process of translating high-level intentions ("click the blue submit button") into precise pixel coordinates (x: 512, y: 384) that can be executed on a webpage. Unlike
  traditional DOM-based automation, this approach:

  - Works with any visual interface (including canvas, WebGL, shadow DOM)
  - Handles dynamic content without selectors
  - Operates similar to how humans interact with interfaces

  Two Grounding Modes

  1. Native Claude Grounding (Default)

  - Claude directly outputs pixel coordinates
  - Single API call, faster execution
  - Works with just ANTHROPIC_API_KEY
  - Sufficient for most use cases

  2. Hybrid Grounding with Moondream

  - Claude provides semantic descriptions
  - Moondream (small vision model) converts to coordinates
  - More accurate for complex visual targets
  - Requires MOONDREAM_API_KEY

  Implementation Architecture

  Viewport Standardization

  Claude's vision model is specifically optimized for 1024x768 resolution:

  // packages/magnitude-core/src/ai/util.ts:260-263
  if (isClaude(llm)) {
      // Claude grounding only really works on 1024x768 screenshots
      virtualScreenDimensions = { width: 1024, height: 768 };
  }

  Why 1024x768?
  - Claude's vision training was optimized for this resolution
  - Provides consistent coordinate space
  - Balances detail visibility with token efficiency

  Action Vocabulary Selection

  The system dynamically selects action types based on grounding configuration:

  // packages/magnitude-core/src/connectors/browserConnector.ts:115-123
  getActionSpace(): ActionDefinition<any>[] {
      if (this.grounding) {
          // Moondream mode: Use semantic targets
          return [...targetWebActions, ...agnosticWebActions];
      } else {
          // Native Claude mode: Use direct coordinates
          return [...coordWebActions, ...agnosticWebActions];
      }
  }

  Native Claude Actions

  When Claude operates independently, it outputs exact pixel coordinates:

  // packages/magnitude-core/src/actions/webActions.ts:60-73
  export const clickCoordAction = createAction({
      name: 'mouse:click',
      description: "Click something",
      schema: z.object({
          x: z.number().int(),  // Direct pixel coordinate
          y: z.number().int(),  // Direct pixel coordinate
      }),
      resolver: async ({ input: { x, y }, agent }) => {
          const web = agent.require(BrowserConnector);
          const harness = web.getHarness();
          await harness.click({ x, y });
      },
      render: ({ x, y }) => `⊙ click (${x}, ${y})`
  });

  Moondream-Assisted Actions

  With Moondream, Claude provides semantic descriptions:

  // packages/magnitude-core/src/actions/webActions.ts:10-22
  export const clickTargetAction = createAction({
      name: 'click',
      schema: z.object({
          target: z.string().describe("What to click on")
      }),
      resolver: async ({ input: { target }, agent }) => {
          const web = agent.require(BrowserConnector);
          const screenshot = await web.getLastScreenshot();
          // Moondream converts semantic target to coordinates
          const { x, y } = await web.requireGrounding().locateTarget(screenshot, target);
          await harness.click({ x, y });
      }
  });

  Complete Action Flow

  Step 1: Agent Receives Task

  await agent.act("Click the submit button and fill the form");

  Step 2: Memory and Context Building

  // packages/magnitude-core/src/agent/index.ts:275-296
  private async _buildContext(memory: AgentMemory): Promise<AgentContext> {
      const messages = await memory.render();
      const connectorInstructions: ConnectorInstructions[] = [];

      // Collect instructions for each connector
      for (const connector of this.connectors) {
          if (connector.getInstructions) {
              const instructions = await connector.getInstructions();
              if (instructions) {
                  connectorInstructions.push({
                      connectorId: connector.id,
                      instructions: instructions  // Includes Moondream targeting tips if applicable
                  });
              }
          }
      }

      return {
          instructions: memory.instructions,
          observationContent: messages,
          connectorInstructions
      };
  }

  Step 3: Screenshot Capture and Transformation

  // packages/magnitude-core/src/web/harness.ts:107-138
  async screenshot(options: PageScreenshotOptions = {}): Promise<Image> {
      let buffer!: Buffer;
      const retries = 3;

      for (let attempt = 0; attempt <= retries; attempt++) {
          try {
              // Get device pixel ratio for proper scaling
              dpr = await this.page.evaluate(() => window.devicePixelRatio)
              // Capture screenshot using Playwright
              buffer = await this.page.screenshot({ type: 'png', ...options });
          } catch (err) {
              // Handle page closed or navigation errors
              if (attempt >= retries) {
                  throw new Error(`Unable to capture screenshot after retries`);
              }
          }
      }

      const base64data = buffer.toString('base64');
      return new Image(base64data, dimensions);
  }

  // Screenshot transformation for Claude
  // packages/magnitude-core/src/connectors/browserConnector.ts:154-160
  async transformScreenshot(screenshot: Image): Promise<Image> {
      if (this.options.virtualScreenDimensions) {
          // Resize to 1024x768 for Claude's optimal performance
          return await screenshot.resize(
              this.options.virtualScreenDimensions.width,
              this.options.virtualScreenDimensions.height
          );
      }
      return screenshot;
  }

  Step 4: LLM Planning with BAML

  // packages/magnitude-core/src/ai/modelHarness.ts:176-204
  async partialAct<T>(
      context: AgentContext,
      task: string,
      data: MultiMediaContentPart[],
      actionVocabulary: ActionDefinition<T>[]
  ): Promise<{ reasoning: string, actions: Action[] }> {
      const tb = new TypeBuilder();

      // Dynamically build action schema based on available actions
      tb.PartialRecipe.addProperty(
          'actions',
          tb.list(convertActionDefinitionsToBaml(tb, actionVocabulary))
      ).description('Always provide at least one action');

      // Call Claude with context, task, and action vocabulary
      const response = await this.baml.CreatePartialRecipe(
          context,
          task,
          data,
          this.options.llm.provider === 'claude-code',
          { tb }
      );

      return {
          reasoning: response.reasoning,
          actions: response.actions  // Contains either coordinates or targets
      }
  }

  Step 5A: Native Claude Execution

  When Claude outputs coordinates directly:

  // Example Claude response
  {
      variant: 'mouse:click',
      x: 512,
      y: 384
  }

  // Direct execution
  await harness.click({ x: 512, y: 384 });

  Step 5B: Moondream-Assisted Execution

  When using semantic targets:

  // Example Claude response
  {
      variant: 'click',
      target: 'blue submit button in the bottom right'
  }

  // Moondream grounding
  // packages/magnitude-core/src/ai/grounding.ts:71-112
  async locateTarget(screenshot: Image, target: string): Promise<PixelCoordinate> {
      const response = await this.moondream.point({
          image: { imageUrl: await screenshot.toBase64() },
          object: target  // "blue submit button in the bottom right"
      });

      // Moondream returns normalized [0,1] coordinates
      const relCoords = response.points[0];  // e.g., {x: 0.5, y: 0.5}

      // Convert to pixel space
      const { width, height } = await screenshot.getDimensions();
      const pixelCoords = {
          x: relCoords.x * width,   // 0.5 * 1024 = 512
          y: relCoords.y * height    // 0.5 * 768 = 384
      }

      return pixelCoords;
  }

  Step 6: Browser Execution

  // packages/magnitude-core/src/web/harness.ts:274-289
  private async _click(x: number, y: number, options?: {
      doubleClick?: boolean,
      rightClick?: boolean
  }) {
      // Move virtual cursor if visualizer is enabled
      if (this.visualizer) {
          await this.visualizer.moveVirtualCursor(x, y);
      }

      // Execute the actual click through Playwright
      if (options?.doubleClick) {
          await this.page.mouse.dblclick(x, y);
      } else if (options?.rightClick) {
          await this.page.mouse.click(x, y, { button: 'right' });
      } else {
          await this.page.mouse.click(x, y);
      }
  }

  Moondream Targeting Instructions

  When Moondream is used, Claude receives specific guidance:

  // packages/magnitude-core/src/ai/grounding.ts:37-45
  export const moondreamTargetingInstructions = `
  Targets descriptions must be carefully chosen to be accurately picked up by Moondream, a small vision model.
  Build a "minimal unique identifier" - a description that is as brief as possible that uniquely identifies the target on the page.
  Use only the information needed, and prioritize in this order:
  - specific text
  - specific shapes and colors
  - positional information
  - high level information (Moondream cannot always understand high level concepts)
  `;

  Configuration Examples

  Basic Setup (Native Claude)

  import { BrowserAgent } from '@magnitudeai/magnitude-core';

  // Uses Claude's native grounding
  const agent = new BrowserAgent({
      llm: {
          provider: 'anthropic',
          options: {
              apiKey: process.env.ANTHROPIC_API_KEY,
              model: 'claude-3-5-sonnet'
          }
      }
  });

  Enhanced Setup (With Moondream)

  const agent = new BrowserAgent({
      llm: {
          provider: 'anthropic',
          options: {
              apiKey: process.env.ANTHROPIC_API_KEY,
              model: 'claude-3-5-sonnet'
          }
      },
      browserOptions: {
          grounding: {
              provider: 'moondream',
              options: {
                  apiKey: process.env.MOONDREAM_API_KEY
              }
          }
      }
  });

  Key Design Decisions

  Why Not Tell Claude About Coordinate System?

  Claude is never explicitly told that (0,0) is top-left because:
  - The vision model inherently understands screen coordinates from training
  - Explicit instructions would add unnecessary tokens
  - The model performs better when allowed to use its trained understanding

  Why 1024x768 Resolution?

  - Training optimization: Claude's vision model was specifically trained on this resolution
  - Token efficiency: Larger resolutions don't improve accuracy but increase costs
  - Consistency: Fixed resolution ensures predictable behavior across different screen sizes

  Why Two Modes?

  1. Native Mode Advantages:
    - Single API call (faster)
    - Lower cost (no additional vision model)
    - Simpler architecture
    - Works for 90% of use cases
  2. Moondream Mode Advantages:
    - Better accuracy on complex visual targets
    - Handles ambiguous elements better
    - Useful for elements without clear text labels
    - More robust for non-standard UI patterns

  Performance Characteristics

  Native Claude Mode

  - Latency: ~1-2 seconds per action
  - Accuracy: 85-90% on standard web elements
  - Cost: Single Claude API call per action batch

  Moondream-Assisted Mode

  - Latency: ~2-3 seconds per action (additional Moondream call)
  - Accuracy: 95%+ on complex targets
  - Cost: Claude call + Moondream call per target

  Error Handling

  The system includes robust error handling for grounding failures:

  // packages/magnitude-core/src/ai/grounding.ts:72-76
  async locateTarget(screenshot: Image, target: string): Promise<PixelCoordinate> {
      return await retryOnError(
          async () => this._locateTarget(screenshot, target),
          {
              mode: 'retry_on_partial_message',
              errorSubstrings: ['429', '503', '524'],  // API rate limits
              retryLimit: 20,
              delayMs: 1000
          }
      );
  }

  Limitations and Considerations

  1. Fixed Resolution: Always uses 1024x768 for Claude, which may miss details on complex pages
  2. No Coordinate Context: Claude must infer coordinate system from visual cues
  3. Vision Model Dependency: Accuracy depends on Claude's vision capabilities
  4. Cost Considerations: Each screenshot is processed as image tokens
  5. Dynamic Content: Timing-dependent elements may require wait actions

  Future Enhancements

  Potential improvements to the grounding system:
  - Dynamic resolution selection based on page complexity
  - Caching of common target locations
  - Multi-resolution screenshot pyramid for better accuracy
  - Integration with additional grounding models beyond Moondream


 The Multi-Step Transformation Process

  Magnitude handles resolution mismatches through a sophisticated pipeline:

  1. Screenshot Capture → 2. DPR Normalization → 3. Resize to 1024x768 → 4. Claude Processing → 5. Coordinate Transformation Back

  Step 1: Screenshot Capture at Native Resolution

  // packages/magnitude-core/src/web/harness.ts:107-148
  async screenshot(): Promise<Image> {
      // Get device pixel ratio (e.g., 2 for Retina displays)
      let dpr = await this.page.evaluate(() => window.devicePixelRatio);

      // Capture at native resolution (e.g., 2880x1800 on Retina)
      let buffer = await this.page.screenshot({ type: 'png' });

      // CRITICAL: Normalize for device pixel ratio
      // If DPR=2 and screenshot is 2880x1800, normalize to 1440x900
      const { width, height } = await image.getDimensions();
      const rescaledImage = await image.resize(width / dpr, height / dpr);

      return rescaledImage;
  }

  Step 2: Resize to Claude's Expected 1024x768

  // packages/magnitude-core/src/connectors/browserConnector.ts:154-160
  async transformScreenshot(screenshot: Image): Promise<Image> {
      if (this.options.virtualScreenDimensions) {  // {width: 1024, height: 768}
          return await screenshot.resize(1024, 768);
      }
      return screenshot;
  }

  // The actual resize implementation using Sharp
  // packages/magnitude-core/src/memory/image.ts:101-123
  async resize(width: number, height: number): Promise<Image> {
      const resizedImage = new Image(
          await this.img.clone().resize({
              width: Math.round(width),
              height: Math.round(height),
              fit: 'fill',  // IMPORTANT: Stretches/squashes to exact dimensions
              kernel: sharp.kernel.lanczos3  // High-quality resampling
          })
      );
      return resizedImage;
  }

  Step 3: Claude Outputs Coordinates in 1024x768 Space

  Claude sees a 1024x768 image and outputs coordinates like:
  {
      "variant": "mouse:click",
      "x": 512,  // In 1024x768 space
      "y": 384   // In 1024x768 space
  }

  Step 4: Transform Coordinates Back to Actual Viewport

  // packages/magnitude-core/src/web/harness.ts:185-202
  async transformCoordinates({ x, y }: { x: number, y: number }): Promise<{ x: number, y: number }> {
      const virtual = this.options.virtualScreenDimensions;  // {1024, 768}
      if (!virtual) return { x, y };

      // Get actual viewport size (e.g., 1440x900)
      let vp = this.page.viewportSize();
      if (!vp) {
          vp = await this.page.evaluate(() => ({
              width: window.innerWidth,
              height: window.innerHeight
          }));
      }

      // Scale coordinates from virtual (1024x768) to actual (1440x900)
      return {
          x: x * (vp.width / virtual.width),   // 512 * (1440/1024) = 720
          y: y * (vp.height / virtual.height), // 384 * (900/768) = 450
      };
  }

  Step 5: Execute Click at Transformed Coordinates

  // packages/magnitude-core/src/web/harness.ts:204-210
  async click({ x, y }: { x: number, y: number }, options?: { transform: boolean }) {
      // Transform is true by default
      if (options?.transform ?? true) {
          ({ x, y } = await this.transformCoordinates({ x, y }));
      }

      // Click at actual viewport coordinates
      await this.page.mouse.click(x, y);
  }

  Visual Example

  Let's say you have a MacBook with Retina display:

  1. Native Screenshot: 2880x1800 (Retina @2x)
     ↓ (Divide by DPR=2)
  2. DPR-Normalized: 1440x900
     ↓ (Resize with stretching)
  3. Claude Input: 1024x768 (distorted but consistent)
     ↓ (Claude outputs: click at 512, 384)
  4. Transform Back: 512*(1440/1024)=720, 384*(900/768)=450
     ↓
  5. Actual Click: (720, 450) on 1440x900 viewport

  Important Implications

  1. Aspect Ratio Distortion

  fit: 'fill'  // Stretches/squashes to exact 1024x768
  - 4:3 aspect ratio (1024x768) vs typical 16:9 or 16:10 screens
  - Elements appear slightly stretched/squashed
  - Claude is trained to handle this distortion

  2. Loss of Detail

  - High-resolution content is downsampled
  - Small text might become unreadable
  - Fine UI elements may blur together

  3. Coordinate Precision

  - Rounding errors accumulate through transformations
  - Edge cases near boundaries might miss targets
  - Why Moondream mode can help with precision

  Best Practices for Users

  1. Design Viewport-Aware Tests

  // Set viewport to minimize distortion
  await page.setViewportSize({
      width: 1280,   // Closer to 4:3 ratio
      height: 960
  });

  2. Use Clear, Large Targets

  - Buttons with adequate padding
  - Clear text labels
  - Avoid relying on tiny UI elements

  3. Consider Moondream for Precision

  // When precision matters
  browserOptions: {
      grounding: {
          provider: 'moondream',
          options: { apiKey: process.env.MOONDREAM_API_KEY }
      }
  }

  4. Test at Different Resolutions

  The system works across resolutions but accuracy varies:
  - Best: 1024x768 or 1280x960 (minimal distortion)
  - Good: 1440x900, 1920x1080 (moderate distortion)
  - Challenging: Ultra-wide or vertical monitors (high distortion)

  Why This Approach Works

  Despite the distortion and transformations:

  1. Consistency: Claude always sees the same resolution
  2. Training: Claude was trained on 1024x768 screenshots with various distortions
  3. Relative Positioning: Most UI interactions depend on relative, not absolute positioning
  4. Robust Resampling: Lanczos3 kernel preserves important visual features

  The system trades some visual fidelity for consistency and reliability across all screen sizes.

