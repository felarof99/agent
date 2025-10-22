import React from 'react'
import { useOnboardingStore } from '../stores/onboardingStore'

export function WelcomeStep() {
  const { skipVideo } = useOnboardingStore()

  return (
    <div className="flex flex-col items-center justify-center text-center space-y-10 max-w-5xl mx-auto px-4 py-8">
      {/* Logo with glow effect */}
      <div className="flex items-center justify-center mb-2">
        <div className="relative">
          <div className="absolute inset-0 bg-brand/10 blur-3xl rounded-full animate-pulse" />
          <img
            src="/assets/product_logo_svg.svg"
            alt="BrowserOS Logo"
            className="h-24 w-auto relative z-10 drop-shadow-2xl transition-transform duration-300 hover:scale-110"
          />
        </div>
      </div>

      {/* Hero heading with staggered animation */}
      <div className="space-y-4">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight px-4">
          Welcome to{' '}
          <span className="inline-block bg-gradient-to-r from-brand via-orange-500 to-brand bg-clip-text text-transparent">
            BrowserOS
          </span>
        </h1>
        <p className="text-lg sm:text-xl lg:text-2xl text-muted-foreground max-w-2xl mx-auto font-medium px-4">
          The Open-Source Agentic Browser
        </p>
        <p className="text-sm sm:text-base text-muted-foreground/80 max-w-xl mx-auto leading-relaxed px-4">
          Automate web tasks with AI-powered agents. Privacy-first, secure, and built for everyone.
        </p>
      </div>

      {/* Feature highlights with enhanced cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto pt-6 px-4">
        <div className="group flex flex-col items-center text-center space-y-3 p-6 rounded-2xl border-2 border-border/60 bg-card/80 hover:bg-card hover:border-brand/50 transition-all duration-300 hover:shadow-xl hover:shadow-brand/10 hover:-translate-y-1">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-brand/20 to-orange-500/20 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300">
            <svg
              className="w-7 h-7 text-brand"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <h3 className="font-bold text-base">AI-Powered</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Automate tasks with intelligent agents
          </p>
        </div>

        <div className="group flex flex-col items-center text-center space-y-3 p-6 rounded-2xl border-2 border-border/60 bg-card/80 hover:bg-card hover:border-brand/50 transition-all duration-300 hover:shadow-xl hover:shadow-brand/10 hover:-translate-y-1">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-brand/20 to-orange-500/20 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300">
            <svg
              className="w-7 h-7 text-brand"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h3 className="font-bold text-base">Privacy First</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your data stays local and secure
          </p>
        </div>

        <div className="group flex flex-col items-center text-center space-y-3 p-6 rounded-2xl border-2 border-border/60 bg-card/80 hover:bg-card hover:border-brand/50 transition-all duration-300 hover:shadow-xl hover:shadow-brand/10 hover:-translate-y-1">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-brand/20 to-orange-500/20 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300">
            <svg
              className="w-7 h-7 text-brand"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
              />
            </svg>
          </div>
          <h3 className="font-bold text-base">Open Source</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Built by the community, for everyone
          </p>
        </div>
      </div>

      {/* Navigation button with glass morphism */}
      <div className="pt-10">
        <button
          onClick={skipVideo}
          className="group relative px-10 py-4 backdrop-blur-md bg-orange-50/40 dark:bg-orange-950/40 border-2 border-orange-300/60 dark:border-orange-700/60 text-orange-600 dark:text-orange-400 font-bold rounded-xl transition-all duration-300 shadow-lg shadow-orange-500/20 hover:bg-orange-100/50 dark:hover:bg-orange-900/50 hover:border-orange-400/70 dark:hover:border-orange-600/70 hover:shadow-xl hover:shadow-orange-500/30 hover:scale-105 active:scale-95 overflow-hidden"
        >
          <span className="relative z-10 flex items-center gap-2">
            Get Started
            <svg
              className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1"
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
          </span>
          {/* Shine effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
        </button>
      </div>
    </div>
  )
}
