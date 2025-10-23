import React from 'react'
import { useOnboardingStore } from '../stores/onboardingStore'

export function VideoStep() {
  const { nextStep, previousStep } = useOnboardingStore()

  return (
    <div className="flex flex-col space-y-8 max-w-5xl mx-auto px-4">
      {/* Header */}
      <div className="text-center space-y-4 pt-16">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
          Why switch to BrowserOS?
        </h2>
        <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Watch our launch video to understand the vision of BrowserOS and key features!
        </p>
      </div>

      {/* Video Container */}
      <div>
        <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl shadow-brand/20 border-2 border-border/50 bg-card">
          {/* 16:9 Aspect Ratio Container */}
          <div className="relative pb-[56.25%]">
            <iframe
              className="absolute top-0 left-0 w-full h-full"
              src="https://www.youtube.com/embed/J-lFhTP-7is?si=nc95xNUSAhKUXLJl&autoplay=1&mute=1"
              title="BrowserOS Launch Video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>
      </div>

      {/* Info Card */}
      <div className="text-center p-4 bg-muted/30 border border-border/50 rounded-xl">
        <p className="text-sm text-muted-foreground">
          🎬 <span className="font-semibold">Tip:</span> This video showcases the key features and capabilities of BrowserOS. You can skip it if you prefer to jump right in!
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

        <div className="flex gap-3">
          <button
            onClick={nextStep}
            className="px-8 py-3 backdrop-blur-md bg-muted/40 border-2 border-border/60 text-muted-foreground font-semibold rounded-xl transition-all duration-300 hover:bg-muted/60 hover:border-border hover:scale-105 active:scale-95"
          >
            Skip Video
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
    </div>
  )
}
