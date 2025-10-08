import { useState, useEffect, useCallback } from 'react'
import { LLMProvider } from '../types/llm-settings'
import { MessageType } from '@/lib/types/messaging'
import { PortMessage } from '@/lib/runtime/PortMessaging'
import { BrowserOSProvidersConfig } from '@/lib/llm/settings/browserOSTypes'

const DEFAULT_BROWSEROS_PROVIDER: LLMProvider = {
  id: 'browseros',
  name: 'BrowserOS',
  type: 'browseros',
  isBuiltIn: true,
  isDefault: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}

export function useBrowserOSPrefs() {
  const [providers, setProviders] = useState<LLMProvider[]>([DEFAULT_BROWSEROS_PROVIDER])
  const [defaultProvider, setDefaultProviderState] = useState<string>('browseros')
  const [isLoading, setIsLoading] = useState(true)
  const [port, setPort] = useState<chrome.runtime.Port | null>(null)


  // Setup persistent port connection
  useEffect(() => {
    const newPort = chrome.runtime.connect({ name: 'options' })

    const listener = (msg: PortMessage) => {
      // Handle provider config responses and broadcasts
      if (msg.type === MessageType.WORKFLOW_STATUS) {
        const payload = msg.payload as any
        if (payload?.status === 'error') {
          console.error('[useBrowserOSPrefs] Error from background:', payload.error)
        }
        if (payload?.data?.providersConfig) {
          const config = payload.data.providersConfig as BrowserOSProvidersConfig
          // Ensure all providers have isDefault field (migration for old data)
          const migratedProviders = config.providers.map(p => ({
            ...p,
            isDefault: p.isDefault !== undefined ? p.isDefault : (p.id === 'browseros')
          }))
          setProviders(migratedProviders)
          setDefaultProviderState(config.defaultProviderId || 'browseros')
          setIsLoading(false)
        }
      }
    }

    newPort.onMessage.addListener(listener)
    setPort(newPort)

    // Track if port is still connected
    let isPortConnected = true
    const handleDisconnect = () => {
      isPortConnected = false
    }
    newPort.onDisconnect.addListener(handleDisconnect)

    // Add delay to ensure port is ready before sending message
    const initialTimeout = setTimeout(() => {
      if (isPortConnected) {
        try {
          newPort.postMessage({
            type: MessageType.GET_LLM_PROVIDERS,
            payload: {},
            id: `get-providers-${Date.now()}`
          })
        } catch (error) {
          console.error('[useBrowserOSPrefs] Failed to send initial message:', error)
        }
      }
    }, 100)

    // Also request again after a bit more time in case first one fails
    const retryTimeout = setTimeout(() => {
      if (isLoading && isPortConnected) {
        try {
          newPort.postMessage({
            type: MessageType.GET_LLM_PROVIDERS,
            payload: {},
            id: `get-providers-retry-${Date.now()}`
          })
        } catch (error) {
          // Silently fail, port disconnected
        }
      }
    }, 500)

    return () => {
      isPortConnected = false
      clearTimeout(initialTimeout)
      clearTimeout(retryTimeout)
      newPort.onMessage.removeListener(listener)
      newPort.onDisconnect.removeListener(handleDisconnect)
      newPort.disconnect()
      setPort(null)
    }
  }, [])

  const saveProvidersConfig = useCallback(async (updatedProviders: LLMProvider[], newDefaultId?: string) => {
    if (!port) {
      console.error('[useBrowserOSPrefs] Port not connected')
      return false
    }

    const config: BrowserOSProvidersConfig = {
      defaultProviderId: newDefaultId || defaultProvider,
      providers: updatedProviders
    }

    // Send via persistent port - broadcast will update state automatically
    port.postMessage({
      type: MessageType.SAVE_LLM_PROVIDERS,
      payload: config,
      id: `save-providers-${Date.now()}`
    })

    return true
  }, [port, defaultProvider])

  const setDefaultProvider = useCallback(async (providerId: string) => {
    setDefaultProviderState(providerId)
    const normalizedProviders = providers.map(provider => ({
      ...provider,
      isDefault: provider.id === providerId
    }))
    setProviders(normalizedProviders)
    await saveProvidersConfig(normalizedProviders, providerId)
  }, [providers, saveProvidersConfig])

  const addProvider = useCallback(async (provider: LLMProvider) => {
    // Check for duplicate provider based on type, modelId, and baseUrl
    const isDuplicate = providers.some(existingProvider => {
      // Skip BrowserOS built-in provider check
      if (existingProvider.id === 'browseros' || provider.type === 'browseros') {
        return false
      }

      // Check if same type
      if (existingProvider.type !== provider.type) {
        return false
      }

      // For providers with modelId, check if modelId matches
      if (provider.modelId && existingProvider.modelId) {
        if (existingProvider.modelId === provider.modelId) {
          // For custom providers with baseUrl, also check baseUrl
          if (provider.baseUrl && existingProvider.baseUrl) {
            return existingProvider.baseUrl === provider.baseUrl
          }
          return true
        }
      }

      // For Ollama or custom providers without modelId, check baseUrl
      if (provider.baseUrl && existingProvider.baseUrl) {
        return existingProvider.baseUrl === provider.baseUrl
      }

      return false
    })

    if (isDuplicate) {
      throw new Error('A provider with the same configuration already exists')
    }

    const newProvider = {
      ...provider,
      id: provider.id || crypto.randomUUID(),
      isDefault: false,  // Ensure isDefault is always set
      isBuiltIn: provider.isBuiltIn || false,
      createdAt: provider.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    const updatedProviders = [...providers, newProvider]
    setProviders(updatedProviders)
    await saveProvidersConfig(updatedProviders)
    return newProvider
  }, [providers, saveProvidersConfig])

  const updateProvider = useCallback(async (provider: LLMProvider) => {
    const updatedProvider = {
      ...provider,
      isDefault: provider.id === defaultProvider,
      updatedAt: new Date().toISOString()
    }
    const updatedProviders = providers.map(p =>
      p.id === provider.id
        ? updatedProvider
        : { ...p, isDefault: p.id === defaultProvider }
    )
    setProviders(updatedProviders)
    await saveProvidersConfig(updatedProviders)
    return updatedProvider
  }, [providers, defaultProvider, saveProvidersConfig])

  const deleteProvider = useCallback(async (providerId: string) => {
    const remainingProviders = providers.filter(p => p.id !== providerId)

    let nextDefaultId = defaultProvider
    if (providerId === defaultProvider) {
      const browserOSProvider = remainingProviders.find(p => p.id === 'browseros')
      nextDefaultId = browserOSProvider?.id || remainingProviders[0]?.id || 'browseros'
      setDefaultProviderState(nextDefaultId)
    }

    const normalizedProviders = remainingProviders.map(p => ({
      ...p,
      isDefault: p.id === nextDefaultId
    }))

    setProviders(normalizedProviders)
    await saveProvidersConfig(normalizedProviders, nextDefaultId)
  }, [providers, defaultProvider, saveProvidersConfig])

  return {
    providers,
    defaultProvider,
    isLoading,
    setDefaultProvider,
    addProvider,
    updateProvider,
    deleteProvider
  }
}