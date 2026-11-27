import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

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

export function TripProgress({ currentStep, orientation = 'horizontal' }) {
  const vertical = orientation === 'vertical'
  const slotRef = useRef(null)
  const [floating, setFloating] = useState(false)
  const [box, setBox] = useState({ left: 0, width: 0, height: 0 })
  const progressPercentage = (currentStep / TRIP_STEPS.length) * 100
  const currentStepData = TRIP_STEPS[currentStep - 1]

  useLayoutEffect(() => {
    const slot = slotRef.current
    if (!slot || vertical) return

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
  }, [vertical])

  useEffect(() => {
    const slot = slotRef.current
    if (!slot || vertical) return

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
  }, [vertical])

  if (vertical) {
    return (
      <div className="trip-progress-rail">
        <nav className="trip-progress-vertical" aria-label="Trip planning progress">
          <div className="vertical-progress-head">
            <strong>
              Step {currentStep} of {TRIP_STEPS.length}
            </strong>
            <small>{currentStepData.title}</small>
          </div>
          <ol className="vertical-progress-steps">
            {TRIP_STEPS.map((step, index) => {
              const stepNumber = index + 1
              const isCurrent = stepNumber === currentStep
              const isComplete = stepNumber < currentStep

              return (
                <li
                  key={step.title}
                  className={[isComplete ? 'complete' : '', isCurrent ? 'current' : '']
                    .filter(Boolean)
                    .join(' ')}
                >
                  <Link to={step.to} aria-current={isCurrent ? 'step' : undefined}>
                    <span>{isComplete ? '✓' : stepNumber}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <small>{step.description}</small>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ol>
        </nav>
      </div>
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
          <strong>
            Step {currentStep} of {TRIP_STEPS.length}
          </strong>
          <small>{currentStepData.title}</small>
        </div>

        <ol className="progress-steps">
          {TRIP_STEPS.map((step, index) => {
            const stepNumber = index + 1
            const isCurrent = stepNumber === currentStep
            const isComplete = stepNumber < currentStep

            return (
              <li
                key={step.title}
                className={[isComplete ? 'complete' : '', isCurrent ? 'current' : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                <Link
                  to={step.to}
                  className="progress-step"
                  title={step.description}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  <span>{isComplete ? '✓' : stepNumber}</span>
                  <strong>{step.title}</strong>
                </Link>
              </li>
            )
          })}
        </ol>

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
      </section>
    </div>
  )
}

export default TripProgress
