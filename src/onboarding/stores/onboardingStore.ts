import { create } from 'zustand'

const TOTAL_STEPS = 5  // Welcome, Step 1, Step 2, Step 3, Video, Completion

interface OnboardingState {
  currentStep: number  // 0 = welcome, 1-3 = steps, 4 = video, 5 = completion
  videoSkipped: boolean
  completedSteps: Set<number>

  // Navigation methods
  nextStep: () => void
  previousStep: () => void
  goToStep: (step: number) => void
  skipVideo: () => void
  completeOnboarding: () => Promise<void>

  // State checks
  canGoNext: () => boolean
  canGoPrevious: () => boolean
  isComplete: () => boolean
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  currentStep: 0,
  videoSkipped: false,
  completedSteps: new Set<number>(),

  nextStep: () => {
    const { currentStep, completedSteps } = get()
    if (currentStep < TOTAL_STEPS) {
      const newCompletedSteps = new Set(completedSteps)
      newCompletedSteps.add(currentStep)
      set({
        currentStep: currentStep + 1,
        completedSteps: newCompletedSteps
      })
    }
  },

  previousStep: () => {
    const { currentStep } = get()
    if (currentStep > 0) {
      set({ currentStep: currentStep - 1 })
    }
  },

  goToStep: (step: number) => {
    if (step >= 0 && step <= TOTAL_STEPS) {
      set({ currentStep: step })
    }
  },

  skipVideo: () => {
    set({ videoSkipped: true })
    get().nextStep()
  },

  completeOnboarding: async () => {
    // Mark onboarding as completed in chrome storage
    await chrome.storage.local.set({ hasCompletedOnboarding: true })

    // Mark all steps as completed
    const allSteps = new Set<number>()
    for (let i = 0; i <= TOTAL_STEPS; i++) {
      allSteps.add(i)
    }
    set({
      completedSteps: allSteps,
      currentStep: TOTAL_STEPS
    })
  },

  canGoNext: () => {
    const { currentStep } = get()
    return currentStep < TOTAL_STEPS
  },

  canGoPrevious: () => {
    const { currentStep } = get()
    return currentStep > 0
  },

  isComplete: () => {
    const { currentStep } = get()
    return currentStep === TOTAL_STEPS
  }
}))
