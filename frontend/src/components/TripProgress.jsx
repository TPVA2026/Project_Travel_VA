import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSelectedPlan, getSelectedPlanId } from '../services/planSelection.js'

const TRIP_STEPS = [
  {
    title: 'Trip details',
    description: 'Add your travel preferences',
    to: '/',
  },
  {
    title: 'Build itinerary',
    description: 'Choose activities and routes',
    to: '/results',
  },
  {
    title: 'Review & save',
    description: 'Review and save your trip',
    to: '/selected',
  },
]

function hasSavedTripRequest() {
  try {
    return typeof window !== 'undefined' && Boolean(window.sessionStorage?.getItem('tpva-travel-request'))
  } catch {
    return false
  }
}

function hasSelectedPlan() {
  try {
    return Boolean(getSelectedPlan() || getSelectedPlanId())
  } catch {
    return false
  }
}

export function TripProgress({ currentStep, variant = 'bar' }) {
  const slotRef = useRef(null)
  const [floating, setFloating] = useState(false)
  const [box, setBox] = useState({ left: 0, width: 0, height: 0 })
  const [unlocks, setUnlocks] = useState(() => ({
    step2: hasSavedTripRequest(),
    step3: hasSelectedPlan(),
  }))
  const isSidebar = variant === 'sidebar'
  const progressPercentage = (currentStep / TRIP_STEPS.length) * 100
  const currentStepData = TRIP_STEPS[currentStep - 1]

  useEffect(() => {
    const syncUnlocks = () => {
      setUnlocks({ step2: hasSavedTripRequest(), step3: hasSelectedPlan() })
    }
    syncUnlocks()
    window.addEventListener('tpva-trip-saved', syncUnlocks)
    window.addEventListener('tpva-plan-selected', syncUnlocks)
    window.addEventListener('storage', syncUnlocks)
    return () => {
      window.removeEventListener('tpva-trip-saved', syncUnlocks)
      window.removeEventListener('tpva-plan-selected', syncUnlocks)
      window.removeEventListener('storage', syncUnlocks)
    }
  }, [currentStep])

  const isStepLocked = (stepNumber) => {
    if (stepNumber === 2) return currentStep < 2 && !unlocks.step2
    if (stepNumber === 3) return currentStep < 3 && !unlocks.step3
    return false
  }

  useLayoutEffect(() => {
    if (isSidebar) return
    const slot = slotRef.current
    if (!slot) return

    const measure = () => {
      const bar = slot.firstElementChild
      const rect = slot.getBoundingClientRect()
      const height = bar ? bar.offsetHeight : rect.height
      setBox((prev) =>
        prev.left === rect.left && prev.width === rect.width && prev.height === height
          ? prev
          : { left: rect.left, width: rect.width, height },
      )
    }

    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(slot)
    window.addEventListener('resize', measure)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [isSidebar])

  useEffect(() => {
    if (isSidebar) return
    const slot = slotRef.current
    if (!slot) return

    let frame = 0
    const update = () => {
      frame = 0
      const bar = slot.firstElementChild
      const offset = bar ? parseFloat(window.getComputedStyle(bar).top) || 0 : 0
      setFloating(slot.getBoundingClientRect().top <= offset)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [isSidebar])

  if (isSidebar) {
    return (
      <section className="trip-progress trip-progress--sidebar" aria-label="Trip planning progress">
        <div className="trip-progress-sidebar-head">
          <strong>Step {currentStep} of {TRIP_STEPS.length}</strong>
          <span>{currentStepData.title}</span>
        </div>
        <ol className="progress-steps progress-steps--vertical">
          {TRIP_STEPS.map((step, index) => {
            const stepNumber = index + 1
            const isCurrent = stepNumber === currentStep
            const isComplete = stepNumber < currentStep
            const isLocked = isStepLocked(stepNumber)
            const lockHint = stepNumber === 2 ? 'Complete trip details first' : 'Choose an itinerary first'

            return (
              <li
                key={step.title}
                className={[isComplete ? 'complete' : '', isCurrent ? 'current' : '', isLocked ? 'locked' : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                {isLocked ? (
                  <span
                    className="progress-step is-disabled"
                    aria-disabled="true"
                    title={lockHint}
                  >
                    <span className="progress-step-num">{stepNumber}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <small>{step.description}</small>
                    </div>
                  </span>
                ) : (
                  <Link
                    to={step.to}
                    className="progress-step"
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    <span className="progress-step-num">{stepNumber}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <small>{step.description}</small>
                    </div>
                  </Link>
                )}
              </li>
            )
          })}
        </ol>
      </section>
    )
  }

  return (
    <div
      className="trip-progress-slot"
      ref={slotRef}
      style={floating ? { height: `${box.height}px` } : undefined}
    >
      <section
        className={`trip-progress${floating ? ' is-floating' : ''}`}
        style={floating ? { left: `${box.left}px`, width: `${box.width}px` } : undefined}
        aria-label="Trip planning progress"
      >
      <div className="progress-summary">
        <div>
          <span>YOUR PROGRESS</span>

          <strong>
            Step {currentStep} of {TRIP_STEPS.length}
          </strong>
        </div>

        <small>
          Current step: <b>{currentStepData.title}</b>
        </small>
      </div>

      <div
        className="progress-track"
        role="progressbar"
        aria-label={`Step ${currentStep} of ${TRIP_STEPS.length}: ${currentStepData.title}`}
        aria-valuemin={1}
        aria-valuemax={TRIP_STEPS.length}
        aria-valuenow={currentStep}
      >
        <span className="progress-fill" style={{ width: `${progressPercentage}%` }} />
      </div>

      <ol className="progress-steps">
        {TRIP_STEPS.map((step, index) => {
          const stepNumber = index + 1
          const isCurrent = stepNumber === currentStep
          const isComplete = stepNumber < currentStep
          const isLocked = isStepLocked(stepNumber)
          const lockHint = stepNumber === 2 ? 'Complete trip details first' : 'Choose an itinerary first'

          let status = 'Up next'

          if (isComplete) {
            status = 'Completed'
          }

          if (isCurrent) {
            status = 'Current step'
          }

          return (
            <li
              key={step.title}
              className={[isComplete ? 'complete' : '', isCurrent ? 'current' : '', isLocked ? 'locked' : '']
                .filter(Boolean)
                .join(' ')}
            >
              {isLocked ? (
                <span
                  className="progress-step is-disabled"
                  title={lockHint}
                  aria-disabled="true"
                >
                  <span>{stepNumber}</span>

                  <div>
                    <small>{status}</small>
                    <strong>{step.title}</strong>
                  </div>
                </span>
              ) : (
                <Link
                  to={step.to}
                  className="progress-step"
                  title={step.description}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  <span>{stepNumber}</span>

                  <div>
                    <small>{status}</small>
                    <strong>{step.title}</strong>
                  </div>
                </Link>
              )}
            </li>
          )
        })}
      </ol>
      </section>
    </div>
  )
}

export default TripProgress
