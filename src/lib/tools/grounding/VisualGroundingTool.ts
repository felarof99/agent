import { z } from 'zod'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { ExecutionContext } from '@/lib/runtime/ExecutionContext'
import { Logging } from '@/lib/utils/Logging'
import { jsonParseToolOutput } from '@/lib/utils/utils'

// Tool input schema
const VisualGroundingInputSchema = z.object({
  target_description: z.string().describe('Natural language description of what to find on the page')
})

/**
 * Creates a visual grounding tool that uses Claude's vision capabilities
 * to find elements on the page and show a visual indicator at the location
 */
export function createVisualGroundingTool(context: ExecutionContext): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'visual_grounding',
    description: 'Find element location on the page using visual understanding and show indicator',
    schema: VisualGroundingInputSchema,
    func: async (input) => {
      try {
        Logging.log('VisualGroundingTool', `Finding element: "${input.target_description}"`)
        
        // Get the current page
        const page = await context.browserContext.getCurrentPage()
        if (!page) {
          throw new Error('No active page available')
        }
        
        // Take screenshot (large size for better Claude performance)
        const screenshotDataUrl = await page.takeScreenshot('large')
        if (!screenshotDataUrl) {
          throw new Error('Failed to capture screenshot')
        }
        
        Logging.log('VisualGroundingTool', 'Screenshot captured, sending to Claude for analysis')
        
        // Get LLM instance
        const llm = await context.getLLM({ temperature: 0 })
        
        // Ask Claude for coordinates with simplified prompt
        const response = await llm.invoke([
          {
            role: 'system',
            content: `You are a vision model that outputs exact pixel coordinates. Find the requested element and return ONLY JSON: {"x": number, "y": number}`
          },
          {
            role: 'user',
            content: [
              { 
                type: 'text', 
                text: `Find this element on the page: "${input.target_description}"`
              },
              { 
                type: 'image_url', 
                image_url: { url: screenshotDataUrl } 
              }
            ]
          }
        ])
        
        // Parse coordinates from response
        let coords: { x: number, y: number }
        try {
          // Extract JSON from response (handle various response formats)
          const responseText = typeof response.content === 'string' 
            ? response.content 
            : JSON.stringify(response.content)
          
          // Find JSON in the response
          const jsonMatch = responseText.match(/\{[^}]*"x"\s*:\s*\d+[^}]*"y"\s*:\s*\d+[^}]*\}/)
          if (jsonMatch) {
            coords = JSON.parse(jsonMatch[0])
          } else {
            throw new Error('No coordinates found in response')
          }
        } catch (parseError) {
          Logging.log('VisualGroundingTool', `Failed to parse coordinates: ${parseError}`, 'error')
          throw new Error(`Failed to parse coordinates from Claude response: ${parseError}`)
        }
        
        Logging.log('VisualGroundingTool', `Claude found element at (${coords.x}, ${coords.y})`)
        
        // Show visual indicator at the coordinates
        await chrome.scripting.executeScript({
          target: { tabId: page.tabId },
          func: (x: number, y: number) => {
            // Remove any existing indicators
            document.querySelectorAll('.nxtscape-visual-indicator').forEach(el => el.remove())
            
            // Create pulsing red dot indicator
            const indicator = document.createElement('div')
            indicator.className = 'nxtscape-visual-indicator'
            indicator.style.cssText = `
              position: fixed;
              left: ${x - 15}px;
              top: ${y - 15}px;
              width: 30px;
              height: 30px;
              border: 3px solid #ff0000;
              background: rgba(255, 0, 0, 0.3);
              border-radius: 50%;
              pointer-events: none;
              z-index: 2147483647;
              animation: nxtscape-pulse 1s infinite;
            `
            
            // Add crosshair lines for better visibility
            const horizontalLine = document.createElement('div')
            horizontalLine.className = 'nxtscape-visual-indicator'
            horizontalLine.style.cssText = `
              position: fixed;
              left: 0;
              top: ${y}px;
              width: 100%;
              height: 1px;
              background: rgba(255, 0, 0, 0.3);
              pointer-events: none;
              z-index: 2147483646;
            `
            
            const verticalLine = document.createElement('div')
            verticalLine.className = 'nxtscape-visual-indicator'
            verticalLine.style.cssText = `
              position: fixed;
              left: ${x}px;
              top: 0;
              width: 1px;
              height: 100%;
              background: rgba(255, 0, 0, 0.3);
              pointer-events: none;
              z-index: 2147483646;
            `
            
            // Add animation keyframes if not already present
            if (!document.querySelector('#nxtscape-grounding-styles')) {
              const style = document.createElement('style')
              style.id = 'nxtscape-grounding-styles'
              style.textContent = `
                @keyframes nxtscape-pulse {
                  0% { transform: scale(1); opacity: 1; }
                  50% { transform: scale(1.2); opacity: 0.7; }
                  100% { transform: scale(1); opacity: 1; }
                }
              `
              document.head.appendChild(style)
            }
            
            // Add all elements to the page
            document.body.appendChild(indicator)
            document.body.appendChild(horizontalLine)
            document.body.appendChild(verticalLine)
            
            // Auto-remove after 5 seconds
            setTimeout(() => {
              indicator.remove()
              horizontalLine.remove()
              verticalLine.remove()
            }, 5000)
            
            console.log(`[VisualGroundingTool] Indicator placed at (${x}, ${y})`)
          },
          args: [coords.x, coords.y]
        })
        
        // Return success result
        return JSON.stringify({
          ok: true,
          found_at: coords,
          message: `✅ Found "${input.target_description}" at (${coords.x}, ${coords.y}). Visual indicator shown.`
        })
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        Logging.log('VisualGroundingTool', `Error: ${errorMessage}`, 'error')
        
        return JSON.stringify({
          ok: false,
          error: errorMessage,
          message: `❌ Failed to find "${input.target_description}": ${errorMessage}`
        })
      }
    }
  })
}