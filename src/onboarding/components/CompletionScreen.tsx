import React, { useEffect } from 'react'
import { useOnboardingStore } from '../stores/onboardingStore'

export function CompletionScreen() {
  const { completeOnboarding } = useOnboardingStore()

  // Mark onboarding as completed when this screen is shown
  useEffect(() => {
    completeOnboarding()
  }, [completeOnboarding])

  const handleOpenSidePanel = async () => {
    try {
      // Get the current tab
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true })

      // Close any open import settings tabs to prevent switching to them
      const allTabs = await chrome.tabs.query({ currentWindow: true })
      const importSettingsTabs = allTabs.filter(tab =>
        tab.url?.includes('chrome://settings/importData') && tab.id !== currentTab?.id
      )

      // Close import settings tabs
      for (const tab of importSettingsTabs) {
        if (tab.id) {
          await chrome.tabs.remove(tab.id)
        }
      }

      // Open the side panel
      if (currentTab?.id) {
        await chrome.sidePanel.open({ tabId: currentTab.id })
      }

      // Redirect to newtab instead of closing the window
      setTimeout(() => {
        const newtabUrl = chrome.runtime.getURL('newtab.html')
        window.location.href = newtabUrl
      }, 500)
    } catch (error) {
      console.error('Failed to open side panel:', error)
      // Fallback: redirect to newtab
      const newtabUrl = chrome.runtime.getURL('newtab.html')
      window.location.href = newtabUrl
    }
  }

  const handleOpenSettings = () => {
    chrome.tabs.create({ url: 'chrome://settings/browseros' })
  }

  return (
    <div className="flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in zoom-in duration-700">
      {/* Success animation */}
      <div className="relative">
        <div className="absolute inset-0 bg-brand/20 rounded-full blur-3xl animate-pulse" />
        <div className="relative w-24 h-24 bg-gradient-to-br from-brand to-orange-500 rounded-full flex items-center justify-center shadow-2xl p-6 animate-in zoom-in duration-500">
          <img
            src="/assets/product_logo_svg.svg"
            alt="BrowserOS"
            className="w-full h-full object-contain animate-in zoom-in duration-500 delay-300"
          />
        </div>
      </div>

      {/* Heading */}
      <div className="space-y-4">
        <h1 className="text-4xl sm:text-5xl font-bold">
          You're All Set! 🎉
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Welcome to BrowserOS. Start automating your web tasks with AI-powered agents.
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-4 pt-4">
        <button
          onClick={handleOpenSidePanel}
          className="px-10 py-4 bg-gradient-to-r from-brand to-orange-500 hover:from-brand/90 hover:to-orange-500/90 text-white font-bold rounded-xl transition-all duration-300 shadow-lg shadow-brand/25 hover:shadow-xl hover:shadow-brand/40 hover:scale-105 active:scale-95"
        >
          Open AI Agent Panel
        </button>
        <button
          onClick={handleOpenSettings}
          className="px-10 py-4 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-bold rounded-xl transition-all duration-300 border-2 border-border hover:scale-105 active:scale-95"
        >
          Go to Settings
        </button>
      </div>

      {/* Quick links */}
      <div className="pt-8 max-w-2xl mx-auto w-full">
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <svg
              className="w-5 h-5 text-brand"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
            Helpful Resources
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href="https://github.com/browseros-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 bg-muted/30 hover:bg-muted/50 border border-border hover:border-brand/50 rounded-lg transition-all duration-200 group"
            >
              <svg
                className="w-5 h-5 text-muted-foreground group-hover:text-brand transition-colors"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              <div className="text-left">
                <p className="text-sm font-medium">GitHub</p>
                <p className="text-xs text-muted-foreground">Source code & docs</p>
              </div>
            </a>

            <a
              href="https://discord.gg/browseros"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 bg-muted/30 hover:bg-muted/50 border border-border hover:border-brand/50 rounded-lg transition-all duration-200 group"
            >
              <svg
                className="w-5 h-5 text-muted-foreground group-hover:text-brand transition-colors"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026 13.83 13.83 0 0 0 1.226-1.963.074.074 0 0 0-.041-.104 13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z" />
              </svg>
              <div className="text-left">
                <p className="text-sm font-medium">Discord</p>
                <p className="text-xs text-muted-foreground">Join our community</p>
              </div>
            </a>

            <a
              href="https://twitter.com/browseros_ai"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 bg-muted/30 hover:bg-muted/50 border border-border hover:border-brand/50 rounded-lg transition-all duration-200 group"
            >
              <svg
                className="w-5 h-5 text-muted-foreground group-hover:text-brand transition-colors"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <div className="text-left">
                <p className="text-sm font-medium">Twitter/X</p>
                <p className="text-xs text-muted-foreground">Follow for updates</p>
              </div>
            </a>

            <a
              href="https://docs.browseros.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 bg-muted/30 hover:bg-muted/50 border border-border hover:border-brand/50 rounded-lg transition-all duration-200 group"
            >
              <svg
                className="w-5 h-5 text-muted-foreground group-hover:text-brand transition-colors"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
              <div className="text-left">
                <p className="text-sm font-medium">Documentation</p>
                <p className="text-xs text-muted-foreground">Learn more</p>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
