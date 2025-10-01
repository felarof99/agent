import React, { useEffect, useState } from 'react'
import { Wand2, Play, Trash2 } from 'lucide-react'
import { Button } from '@/sidepanel/components/ui/button'
import { useTeachModeStore } from './teachmode.store'
import { cn } from '@/sidepanel/lib/utils'
import { getFeatureFlags } from '@/lib/utils/featureFlags'
import { BrowserUpgradeNotice } from './BrowserUpgradeNotice'

const UPGRADE_NOTICE_DISMISSED_KEY = 'teachmode_upgrade_notice_dismissed'

export function TeachModeHome() {
  const { recordings, prepareRecording, setActiveRecording, deleteRecording, executeRecording, setMode, loadRecordings, isPortMessagingInitialized } = useTeachModeStore()
  const [showUpgradeNotice, setShowUpgradeNotice] = useState(false)
  const [browserVersion, setBrowserVersion] = useState<string | null>(null)

  // Load recordings only after port messaging is initialized
  useEffect(() => {
    if (isPortMessagingInitialized) {
      loadRecordings()
    }
  }, [isPortMessagingInitialized, loadRecordings])

  // Check feature flag for teach mode
  useEffect(() => {
    const checkTeachModeSupport = async () => {
      const dismissed = localStorage.getItem(UPGRADE_NOTICE_DISMISSED_KEY)
      if (dismissed === 'true') {
        setShowUpgradeNotice(false)
        return
      }

      const featureFlags = getFeatureFlags()
      await featureFlags.initialize()

      const isEnabled = featureFlags.isEnabled('TEACH_MODE')
      const currentVersion = featureFlags.getVersion()

      setBrowserVersion(currentVersion)
      setShowUpgradeNotice(!isEnabled)
    }

    checkTeachModeSupport()
  }, [])

  const handleDismissUpgradeNotice = () => {
    localStorage.setItem(UPGRADE_NOTICE_DISMISSED_KEY, 'true')
    setShowUpgradeNotice(false)
  }

  const handleCreateNew = () => {
    prepareRecording()
  }

  const handleRecordingClick = (recording: typeof recordings[0]) => {
    setActiveRecording(recording)
    setMode('ready')
  }

  const handleRun = async (recordingId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const recording = recordings.find(r => r.id === recordingId)
    if (recording) {
      setActiveRecording(recording)
      await executeRecording(recordingId)
    }
  }

  const handleDelete = (recordingId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    deleteRecording(recordingId)
  }

  const hasWorkflows = recordings.length > 0

  return (
    <div className="h-full flex flex-col bg-background-alt overflow-hidden">
      {hasWorkflows ? (
        <>
          {/* Header Section - Compact when workflows exist */}
          <div className="flex flex-col items-center px-6 pt-6 pb-5 border-b border-border">
            {/* BrowserOS Branding */}
            <div className="flex items-center justify-center mb-3">
              <h2 className="text-2xl font-bold text-muted-foreground flex items-center gap-2 text-center">
                <span>Teach</span>
                <span className="text-brand">BrowserOS</span>
                <img
                  src="/assets/browseros.svg"
                  alt="BrowserOS"
                  className="w-6 h-6 inline-block ml-1"
                />
              </h2>
            </div>

            {/* Subtitle */}
            <p className="text-base text-muted-foreground mb-4">
              Show it once, automate forever
            </p>

            {/* Create Button */}
            <Button
              onClick={handleCreateNew}
              size="default"
              variant="outline"
              className="gap-2 border-[hsl(var(--brand))] text-[hsl(var(--brand))] hover:bg-[hsl(var(--brand))] hover:text-white transition-colors"
            >
              <Wand2 className="w-4 h-4" />
              Create New Workflow
            </Button>
          </div>

          {/* Workflows Section - Scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="space-y-4 pb-4">
              {/* Workflows Header */}
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-medium text-foreground">
                  Your Workflows
                </h3>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {recordings.length}
                </span>
              </div>

              {/* Simplified Workflow Cards */}
              <div className="space-y-3">
                {recordings.map((recording) => (
                  <div
                    key={recording.id}
                    onClick={() => handleRecordingClick(recording)}
                    className={cn(
                      "group relative flex items-center gap-3 p-4 rounded-lg border border-border",
                      "bg-card hover:bg-muted hover:border-border hover:shadow-sm",
                      "transition-all duration-200 cursor-pointer"
                    )}
                  >
                    {/* Icon */}
                    <div className="text-2xl flex-shrink-0">
                      {recording.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-foreground truncate">
                        {recording.name}
                      </h4>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{recording.steps.length} steps</span>
                        {recording.runCount > 0 && (
                          <>
                            <span>•</span>
                            <span>Run {recording.runCount} times</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => handleRun(recording.id, e)}
                        className="h-8 w-8 p-0 border-[hsl(var(--brand))] text-[hsl(var(--brand))] hover:bg-[hsl(var(--brand))] hover:text-white transition-colors"
                      >
                        <Play className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => handleDelete(recording.id, e)}
                        className="h-8 w-8 p-0 border-destructive text-destructive hover:bg-destructive hover:text-white transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Empty state - matches Agent Mode layout */
        <>
          {/* Main centered content */}
          <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-8 text-center">
            <div className="relative z-0 flex flex-col items-center justify-center min-h-0 max-w-lg w-full">

              {/* Title Section */}
              <div className="flex flex-col items-center justify-center -mt-4">
                <h2 className="text-3xl font-bold text-muted-foreground animate-fade-in-up text-center px-2 leading-tight">
                  <div className="flex items-center justify-center gap-2">
                    <span>Teach</span>
                    <span className="text-brand">BrowserOS</span>
                    <img
                      src="/assets/browseros.svg"
                      alt="BrowserOS"
                      className="w-8 h-8 inline-block align-middle animate-fade-in-up"
                    />
                  </div>
                </h2>
                <p className="text-lg text-muted-foreground mt-4">
                  Show it once, automate forever
                </p>
              </div>

              {/* Question */}
              <div className="mb-8 mt-2">
                <h3 className="text-lg font-semibold text-foreground mb-6 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
                  What would you like to do?
                </h3>

                {/* Popular Workflows as buttons */}
                <div className="flex flex-col items-center max-w-lg w-full space-y-3">
                  {[
                    { icon: "📧", text: "Unsubscribe from emails" },
                    { icon: "📊", text: "Extract data from websites" },
                    { icon: "🛍️", text: "Find best deals online" }
                  ].map((workflow, index) => (
                    <Button
                      key={index}
                      type="button"
                      variant="outline"
                      className="group relative text-sm h-auto py-3 px-4 whitespace-normal bg-background/50 backdrop-blur-sm border-2 border-brand/30 hover:border-brand hover:bg-brand/5 smooth-hover smooth-transform hover:scale-105 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none overflow-hidden w-full message-enter"
                      onClick={() => {
                        // Future: This could trigger a pre-built workflow template
                        handleCreateNew()
                      }}
                    >
                      {/* Animated background */}
                      <div className="absolute inset-0 bg-gradient-to-r from-brand/0 via-brand/5 to-brand/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>

                      {/* Content */}
                      <div className="relative z-10 flex items-center justify-center gap-2 font-medium text-foreground group-hover:text-brand transition-colors duration-300">
                        <span className="text-base">{workflow.icon}</span>
                        <span>{workflow.text}</span>
                      </div>

                      {/* Glow effect */}
                      <div className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-brand/20 to-transparent"></div>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Material Card - replaces input area */}
          <div className="px-6 pb-4">
            <div className="bg-card border-2 border-border rounded-lg p-4 shadow-sm flex items-center justify-between">
              {/* How it works - horizontal layout */}
              <div className="flex items-center gap-6 text-sm text-muted-foreground">
                <span className="font-medium uppercase text-xs tracking-wider">How it works</span>
                <div className="flex gap-5">
                  <span className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">1</span>
                    <span>Record</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">2</span>
                    <span>Narrate</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">3</span>
                    <span>Run</span>
                  </span>
                </div>
              </div>

              {/* Create button */}
              <Button
                onClick={handleCreateNew}
                size="default"
                className="gap-2 bg-brand text-white hover:bg-brand/90 transition-colors"
              >
                <Wand2 className="w-4 h-4" />
                Create New Workflow
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Browser upgrade notice - Bottom */}
      {showUpgradeNotice && (
        <div className="px-6 pb-4 pt-2">
          <BrowserUpgradeNotice
            currentVersion={browserVersion}
            onDismiss={handleDismissUpgradeNotice}
          />
        </div>
      )}
    </div>
  )
}
