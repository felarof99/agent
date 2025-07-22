import { z } from "zod";
import { ITool, ToolResult } from "./ITool";
import { ExecutionContext } from "@/lib/runtime/ExecutionContext";
import { Logging } from "@/lib/utils/Logging";

/**
 * Schema for navigation tool parameters
 */
export const NavigationParametersSchema = z.object({
  url: z.string().url(),  // The URL to navigate to
  waitUntil: z.enum(["load", "domcontentloaded", "networkidle0", "networkidle2"]).optional().default("load"),  // When to consider navigation complete
});

export type NavigationParameters = z.infer<typeof NavigationParametersSchema>;

/**
 * Tool for navigating to URLs in the browser
 */
export class NavigationTool implements ITool {
  name = "navigate";
  description = "Navigate to a specified URL in the browser";
  parametersSchema = NavigationParametersSchema;
  
  async execute(parameters: NavigationParameters, context: ExecutionContext): Promise<ToolResult> {
    try {
      // Validate parameters
      const validatedParams = NavigationParametersSchema.parse(parameters);
      const { url, waitUntil } = validatedParams;
      
      Logging.log("NavigationTool", `Navigating to ${url} with waitUntil: ${waitUntil}`);
      
      // Get the current browser page
      const browserContext = context.browserContext;
      const page = await browserContext.getCurrentPage();
      
      if (!page) {
        throw new Error("No active browser page available");
      }
      
      // Navigate to the URL
      await page.goto(url, { waitUntil });
      
      // Get the final URL after any redirects
      const finalUrl = page.url();
      const title = await page.title();
      
      Logging.log("NavigationTool", `Successfully navigated to ${finalUrl}`);
      
      return {
        success: true,
        data: {
          url: finalUrl,
          title,
          message: `Successfully navigated to ${title || finalUrl}`,
        },
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logging.log("NavigationTool", `Navigation failed: ${errorMessage}`, "error");
      
      return {
        success: false,
        error: `Failed to navigate: ${errorMessage}`,
      };
    }
  }
}