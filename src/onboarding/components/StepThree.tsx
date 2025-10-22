import React, { useState } from 'react'
import { useOnboardingStore } from '../stores/onboardingStore'

export function StepThree() {
  const { nextStep, previousStep } = useOnboardingStore()
  const [executingExample, setExecutingExample] = useState<string | null>(null)

  const exampleQueries = [
    {
      id: 'summarize',
      title: 'Summarize Current Page',
      description: 'Get a quick AI summary of any webpage',
      query: 'Summarize the main points of this page',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      ),
      gradient: 'from-blue-500 to-blue-600',
      bgGradient: 'from-blue-500/10 to-blue-600/10',
      hoverBorder: 'hover:border-blue-500/60'
    },
    {
      id: 'extract',
      title: 'Extract Information',
      description: 'Pull specific data from webpages',
      query: 'Extract all email addresses from this page',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
          />
        </svg>
      ),
      gradient: 'from-green-500 to-green-600',
      bgGradient: 'from-green-500/10 to-green-600/10',
      hoverBorder: 'hover:border-green-500/60'
    },
    {
      id: 'search',
      title: 'Smart Web Search',
      description: 'Find and aggregate information',
      query: 'Search for the latest news about AI',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      ),
      gradient: 'from-purple-500 to-purple-600',
      bgGradient: 'from-purple-500/10 to-purple-600/10',
      hoverBorder: 'hover:border-purple-500/60'
    },
    {
      id: 'navigate',
      title: 'Navigate & Interact',
      description: 'Browse and interact automatically',
      query: 'Go to GitHub and show me trending repositories',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      ),
      gradient: 'from-brand to-orange-500',
      bgGradient: 'from-brand/10 to-orange-500/10',
      hoverBorder: 'hover:border-brand/60'
    }
  ]

  const handleTryExample = async (example: typeof exampleQueries[0]) => {
    try {
      setExecutingExample(example.id)

      // Create a new tab for the query execution
      const newTab = await chrome.tabs.create({
        url: 'https://www.google.com',
        active: true
      })

      if (!newTab?.id) {
        setExecutingExample(null)
        return
      }

      // Wait for the tab to load
      await new Promise(resolve => setTimeout(resolve, 1000))

      await chrome.runtime.sendMessage({
        type: 'NEWTAB_EXECUTE_QUERY',
        tabId: newTab.id,
        query: example.query,
        metadata: {
          source: 'onboarding',
          executionMode: 'dynamic'
        }
      })

      await chrome.sidePanel.open({ tabId: newTab.id })

      setTimeout(() => {
        setExecutingExample(null)
      }, 500)
    } catch (error) {
      console.error('[Onboarding] Error executing example:', error)
      setExecutingExample(null)
    }
  }

  return (
    <div className="flex flex-col space-y-10 max-w-5xl mx-auto px-4">
      {/* Header */}
      <div className="text-center space-y-4 pt-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
          Experience the AI Agent
        </h2>
        <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          BrowserOS Agent uses AI to understand natural language commands and execute complex web tasks. From simple page summaries to multi-step workflows, just describe what you need.
        </p>
      </div>

      {/* Example Queries - Single Column for Better Readability */}
      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
        <div className="text-center space-y-2">
          <h3 className="text-2xl font-bold flex items-center justify-center gap-2">
            <span className="text-2xl">✨</span>
            Try These Examples
          </h3>
          <p className="text-sm text-muted-foreground">Click any card to see the agent in action</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {exampleQueries.map((example, index) => (
            <button
              key={example.id}
              onClick={() => handleTryExample(example)}
              disabled={executingExample === example.id}
              className={`group relative flex flex-col bg-gradient-to-br ${example.bgGradient} border-2 border-border/60 ${example.hoverBorder} rounded-2xl p-6 text-left transition-all duration-300 hover:shadow-xl hover:shadow-brand/10 hover:-translate-y-1 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 animate-in fade-in zoom-in duration-500`}
              style={{ animationDelay: `${index * 80 + 300}ms` }}
            >
              {/* Icon & Title Row */}
              <div className="flex items-start gap-4 mb-3">
                <div className={`flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br ${example.gradient} flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                  {example.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-base sm:text-lg mb-1">{example.title}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {example.description}
                  </p>
                </div>
              </div>

              {/* Query Preview */}
              <div className="mt-2 p-3 bg-background/60 backdrop-blur-sm border border-border/50 rounded-lg">
                <p className="text-xs font-mono text-muted-foreground">
                  "{example.query}"
                </p>
              </div>

              {/* Action Indicator */}
              <div className="absolute top-4 right-4">
                {executingExample === example.id ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-brand/20 text-brand rounded-full text-xs font-semibold border border-brand/40">
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Opening...
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-background/80 border border-border/50 rounded-full text-xs font-semibold text-muted-foreground group-hover:text-brand group-hover:border-brand/40 group-hover:bg-brand/10 transition-all duration-200">
                    Try it
                    <svg
                      className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                      />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Help Text */}
      <div className="text-center p-4 bg-muted/30 border border-border/50 rounded-xl animate-in fade-in duration-700 delay-200">
        <p className="text-sm text-muted-foreground">
          💡 <span className="font-semibold">Tip:</span> After trying an example, the AI agent panel will open showing the execution in real-time
        </p>
      </div>

      {/* Navigation - Glass morphism style */}
      <div className="flex justify-between items-center pt-4">
        <button
          onClick={previousStep}
          className="group flex items-center gap-2 px-8 py-3 backdrop-blur-md bg-orange-50/40 dark:bg-orange-950/40 border-2 border-orange-300/60 dark:border-orange-700/60 text-orange-600 dark:text-orange-400 font-bold rounded-xl transition-all duration-300 shadow-md shadow-orange-500/20 hover:bg-orange-100/50 dark:hover:bg-orange-900/50 hover:border-orange-400/70 dark:hover:border-orange-600/70 hover:shadow-lg hover:shadow-orange-500/30 hover:scale-105 active:scale-95"
        >
          <svg className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Previous
        </button>
        <button
          onClick={nextStep}
          className="group relative px-10 py-4 backdrop-blur-md bg-orange-50/40 dark:bg-orange-950/40 border-2 border-orange-300/60 dark:border-orange-700/60 text-orange-600 dark:text-orange-400 font-bold rounded-xl transition-all duration-300 shadow-lg shadow-orange-500/20 hover:bg-orange-100/50 dark:hover:bg-orange-900/50 hover:border-orange-400/70 dark:hover:border-orange-600/70 hover:shadow-xl hover:shadow-orange-500/30 hover:scale-105 active:scale-95 overflow-hidden"
        >
          <span className="relative z-10 flex items-center gap-3">
            Complete Setup
            <svg className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
        </button>
      </div>
    </div>
  )
}
