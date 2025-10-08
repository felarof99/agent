import React, { useState } from 'react'
import { ThemeProvider } from './components/ThemeProvider'
import { SettingsLayout } from './components/SettingsLayout'
import { LLMProvidersSection } from './components/LLMProvidersSection'
import { ProviderTemplates } from './components/ProviderTemplates'
import { ConfiguredModelsList } from './components/ConfiguredModelsList'
import { AddProviderModal } from './components/AddProviderModal'
import { useBrowserOSPrefs } from './hooks/useBrowserOSPrefs'
import { useOptionsStore } from './stores/optionsStore'
import { testLLMProvider } from './services/llm-test-service'
import { LLMProvider, TestResult } from './types/llm-settings'
import './styles.css'

export function OptionsNew() {
  const { providers, defaultProvider, setDefaultProvider, addProvider, updateProvider, deleteProvider } = useBrowserOSPrefs()
  const [isAddingProvider, setIsAddingProvider] = useState(false)
  const [editingProvider, setEditingProvider] = useState<LLMProvider | null>(null)
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})

  const handleUseTemplate = (template: LLMProvider) => {
    setEditingProvider(template)
    setIsAddingProvider(true)
  }

  const handleSaveProvider = async (provider: Partial<LLMProvider>) => {
    try {
      if (editingProvider?.id) {
        await updateProvider(provider as LLMProvider)
      } else {
        await addProvider(provider as LLMProvider)
      }
      setIsAddingProvider(false)
      setEditingProvider(null)
    } catch (error) {
      // Show error to user - the error will be displayed in the modal
      throw error
    }
  }

  const handleTestProvider = async (providerId: string) => {
    const provider = providers.find(p => p.id === providerId)
    if (!provider) return

    // Set loading state
    setTestResults(prev => ({
      ...prev,
      [providerId]: { status: 'loading', timestamp: new Date().toISOString() }
    }))

    try {
      const result = await testLLMProvider(provider)
      setTestResults(prev => ({
        ...prev,
        [providerId]: result
      }))
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [providerId]: {
          status: 'error',
          error: error instanceof Error ? error.message : 'Test failed',
          timestamp: new Date().toISOString()
        }
      }))
    }
  }

  return (
    <ThemeProvider>
      <SettingsLayout>
        <div className="space-y-6">
          <LLMProvidersSection
            defaultProvider={defaultProvider}
            providers={providers}
            onDefaultChange={setDefaultProvider}
            onAddProvider={() => setIsAddingProvider(true)}
          />

          <ProviderTemplates onUseTemplate={handleUseTemplate} />

          <ConfiguredModelsList
            providers={providers}
            defaultProvider={defaultProvider}
            testResults={testResults}
            onSetDefault={setDefaultProvider}
            onTest={handleTestProvider}
            onEdit={(provider) => {
              setEditingProvider(provider)
              setIsAddingProvider(true)
            }}
            onDelete={deleteProvider}
            onClearTestResult={(providerId) => {
              setTestResults(prev => {
                const newResults = { ...prev }
                delete newResults[providerId]
                return newResults
              })
            }}
          />
        </div>

        <AddProviderModal
          isOpen={isAddingProvider}
          onClose={() => {
            setIsAddingProvider(false)
            setEditingProvider(null)
          }}
          onSave={handleSaveProvider}
          editProvider={editingProvider}
        />
      </SettingsLayout>
    </ThemeProvider>
  )
}