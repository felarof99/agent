import { LLMProvider, TestResult } from '../types/llm-settings'
import { MessageType } from '@/lib/types/messaging'
import { PortMessage } from '@/lib/runtime/PortMessaging'

// Export convenience function
export async function testLLMProvider(provider: LLMProvider): Promise<TestResult> {
  const service = LLMTestService.getInstance()
  return service.testProvider(provider)
}

export class LLMTestService {
  private static instance: LLMTestService

  static getInstance(): LLMTestService {
    if (!LLMTestService.instance) {
      LLMTestService.instance = new LLMTestService()
    }
    return LLMTestService.instance
  }

  async testProvider(provider: LLMProvider): Promise<TestResult> {
    return new Promise((resolve) => {
      const port = chrome.runtime.connect({ name: 'options' })
      const messageId = `test-${Date.now()}`
      let timeoutTimer: NodeJS.Timeout | null = null

      const cleanup = () => {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer)
          timeoutTimer = null
        }
        try {
          port.onMessage.removeListener(listener)
          port.disconnect()
        } catch (e) {
          // Port might already be disconnected
        }
      }

      const listener = (msg: PortMessage) => {
        if (msg.id === messageId && msg.type === MessageType.SETTINGS_TEST_PROVIDER_RESPONSE) {
          cleanup()
          const payload = msg.payload as any

          // Convert the response to TestResult format
          resolve({
            status: payload.success ? 'success' : 'error',
            responseTime: payload.latency,
            response: payload.response,  // Include AI response message
            error: payload.error,
            timestamp: payload.timestamp
          })
        } else if (msg.id === messageId && msg.type === MessageType.ERROR) {
          cleanup()
          const payload = msg.payload as any
          resolve({
            status: 'error',
            error: payload.error || 'Unknown error',
            timestamp: new Date().toISOString()
          })
        }
      }

      port.onMessage.addListener(listener)

      port.postMessage({
        type: MessageType.SETTINGS_TEST_PROVIDER,
        payload: { provider },
        id: messageId
      })

      timeoutTimer = setTimeout(() => {
        cleanup()
        resolve({
          status: 'error',
          error: 'Test timeout after 30 seconds',
          timestamp: new Date().toISOString()
        })
      }, 30000)
    })
  }

  /**
   * Store test results in localStorage (not BrowserOS prefs as these are temporary)
   */
  async storeTestResults(providerId: string, results: TestResult): Promise<boolean> {
    const data = {
      providerId,
      testResult: results,
      timestamp: new Date().toISOString()
    }

    try {
      // Use localStorage for temporary test results
      localStorage.setItem(`llm_test_results_${providerId}`, JSON.stringify(data))
      return true
    } catch (error) {
      console.error('Failed to store test results:', error)
      return false
    }
  }

  async getStoredResults(providerId: string): Promise<{ testResult: TestResult } | null> {
    try {
      // Get from localStorage
      const stored = localStorage.getItem(`llm_test_results_${providerId}`)
      if (stored) {
        const data = JSON.parse(stored)
        return data
      }
      return null
    } catch (error) {
      console.error('Failed to get stored results:', error)
      return null
    }
  }
}